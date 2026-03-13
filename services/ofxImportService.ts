
import { supabase } from '../src/lib/supabase';
import { sha1, sha256 } from './hash';
import { parseOFX, ParsedOfx } from './ofxParser';

export type ImportStatus = 'SUCCESS' | 'DUPLICATE' | 'ERROR';

export interface ImportResult {
  status: ImportStatus;
  message?: string;
  ofxData?: ParsedOfx;
  counts?: {
    total: number;
    new: number;
    existing: number;
  };
}

export const ofxImportService = {
  async importOfxFile(bankId: string, file: File, companyId: string): Promise<ImportResult> {
    try {
      const buffer = await file.arrayBuffer();
      const decoder = new TextDecoder("windows-1252");
      const text = decoder.decode(buffer);
      const fileHash = await sha256(text);

      console.log("OFX: file selected", { name: file.name, size: file.size, hash: fileHash });
      console.log("OFX: decodedHeader", text.slice(0, 80).replace(/\n/g, ' '));
      
      // 1. Check for duplicate file hash
      const { data: existingImport } = await supabase
        .from('ofx_imports')
        .select('id')
        .eq('file_hash', fileHash)
        .eq('company_id', companyId)
        .maybeSingle();

      if (existingImport) {
        console.warn("OFX: duplicate file hash detected, but proceeding to check transactions");
      }

      // 2. Parse OFX
      const parsedOfx = parseOFX(text);
      let syntheticCount = 0;

      // Generate synthetic fit_id if missing
      for (const t of parsedOfx.transactions) {
        if (!t.fitId) {
          const payload = `${bankId}|${t.postedDate}|${t.amount}|${t.memo}`;
          t.fitId = await sha1(payload);
          syntheticCount++;
        }
      }

      const parsedCount = parsedOfx.transactions.length;
      
      if (parsedCount === 0) {
        return { status: 'ERROR', message: 'Nenhuma transação encontrada no arquivo OFX.' };
      }

      const dates = parsedOfx.transactions.map(t => t.postedDate).sort();
      const minDate = dates[0];
      const maxDate = dates[dates.length - 1];
      const example = parsedOfx.transactions[0];

      console.log("OFX: parsed", { 
        parsedCount, 
        syntheticCount,
        minDate, 
        maxDate, 
        example: { date: example.postedDate, amount: example.amount, fitId: example.fitId, memo: example.memo } 
      });

      // 3. Check for existing transactions by fit_id
      const fitIds = parsedOfx.transactions.map(t => t.fitId).filter(Boolean) as string[];
      const { data: existingTxns, error: fetchError } = await supabase
        .from('bank_transactions')
        .select('fit_id')
        .eq('bank_id', bankId)
        .eq('company_id', companyId)
        .in('fit_id', fitIds);

      if (fetchError) throw fetchError;

      const existingFitIds = new Set(existingTxns?.map(t => t.fit_id) || []);
      const newTransactions = parsedOfx.transactions.filter(t => !existingFitIds.has(t.fitId || ''));

      console.log("OFX: duplicate check", { 
        total: parsedCount, 
        existing: existingFitIds.size, 
        new: newTransactions.length 
      });

      // 4. Create import record (if not exists)
      if (!existingImport) {
        const { error: importError } = await supabase
          .from('ofx_imports')
          .insert({
            id: crypto.randomUUID(),
            bank_id: bankId,
            company_id: companyId,
            file_hash: fileHash,
            file_name: file.name,
            from_date: parsedOfx.fromDate || null,
            to_date: parsedOfx.toDate || null,
            total_transactions: parsedCount,
            status: 'IMPORTED'
          });
        if (importError) console.error("OFX: error inserting import record", importError);
      }

      // 5. Insert new transactions
      if (newTransactions.length > 0) {
        const dbTransactions = newTransactions.map(t => ({
          bank_id: bankId,
          company_id: companyId,
          posted_date: t.postedDate,
          amount: t.amount,
          description: t.memo,
          fit_id: t.fitId,
          check_number: t.checkNumber,
          ofx_file_hash: fileHash,
          raw: t.raw
        }));

        console.log("OFX: onConflict used =", "bank_id,fit_id");
        const { error: txnError } = await supabase
          .from('bank_transactions')
          .upsert(dbTransactions, { onConflict: "bank_id,fit_id" });

        if (txnError) {
          console.error("OFX: upsert error", txnError);
          return { 
            status: 'ERROR', 
            message: `Erro ao gravar transações: ${txnError.message || txnError.details || 'Erro desconhecido'}` 
          };
        }
      }

      return { 
        status: 'SUCCESS', 
        ofxData: parsedOfx,
        counts: {
          total: parsedCount,
          new: newTransactions.length,
          existing: existingFitIds.size
        }
      };
    } catch (error: any) {
      console.error("OFX ERROR:", error);
      return { status: 'ERROR', message: error.message || "Erro interno no processamento do OFX" };
    }
  },

  async getTransactions(bankId: string, companyId: string, fromDate?: string, toDate?: string) {
    let query = supabase
      .from('bank_transactions')
      .select(`
        *,
        reconciliations (id)
      `)
      .eq('bank_id', bankId)
      .eq('company_id', companyId)
      .order('posted_date', { ascending: false });

    if (fromDate) query = query.gte('posted_date', fromDate);
    if (toDate) query = query.lte('posted_date', toDate);

    const { data, error } = await query;
    if (error) throw error;

    return data.map(t => ({
      ...t,
      isReconciled: t.reconciliations && t.reconciliations.length > 0
    }));
  },

  async getReconciliationCandidates(bankTx: any, companyId: string) {
    const absAmount = Math.abs(bankTx.amount);
    const dateObj = new Date(bankTx.posted_date);
    
    // Window of -10 to +10 days
    const startDate = new Date(dateObj);
    startDate.setDate(startDate.getDate() - 10);
    const endDate = new Date(dateObj);
    endDate.setDate(endDate.getDate() + 10);

    // Dynamic Tolerance: max(0.10, abs(bankTx.amount) * 0.005)
    const tolerance = Math.max(0.10, absAmount * 0.005);
    const minAmount = absAmount - tolerance;
    const maxAmount = absAmount + tolerance;

    console.log("OFX: searching candidates for", { absAmount, date: bankTx.posted_date, startDate, endDate, tolerance });

    const { data, error } = await supabase
      .from('postings')
      .select(`
        *,
        accounts (name),
        favored (id, name)
      `)
      .eq('company_id', companyId)
      .neq('status', 'LIQUIDADO')
      .is('liquidation_date', null)
      .gte('occurrence_date', startDate.toISOString().split('T')[0])
      .lte('occurrence_date', endDate.toISOString().split('T')[0])
      .gte('amount', minAmount)
      .lte('amount', maxAmount)
      .order('occurrence_date', { ascending: true });

    if (error) throw error;

    // Filter logic:
    // 1. If it's NOT Vendas Gerais, it's always a candidate (current logic)
    // 2. If it IS Vendas Gerais, it's only a candidate if the bank transaction is positive (entry)
    //    and the posting is a revenue (group RECEITAS) and is provisioned.
    const filteredData = data.filter(p => {
      const isVendasGerais = p.accounts?.name?.toUpperCase() === 'VENDAS GERAIS';
      if (!isVendasGerais) return true;
      
      // Vendas Gerais special rule
      return bankTx.amount > 0 && p.group === 'RECEITAS' && p.status === 'PROVISIONADO';
    });

    // Fetch payee mapping for this bank and description
    const { data: mapping } = await supabase
      .from('ofx_payee_mappings')
      .select('entity_id')
      .eq('bank_id', bankTx.bank_id)
      .eq('payee_key', bankTx.description)
      .eq('company_id', companyId)
      .maybeSingle();

    // Text normalization helper
    const normalize = (text: string) => {
      return (text || '')
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter(word => word.length > 2);
    };

    const bankWords = normalize(bankTx.description);

    // Fetch all settlement rules for this company to calculate net amounts for Mode C
    const { data: settlementRules } = await supabase
      .from('payment_settlement_rules')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true);

    // Scoring and Confidence logic
    const candidates = filteredData.map(p => {
      let score = 0;
      let reasons: string[] = [];
      let mode: 'expense' | 'instant_receipt' | 'card_receivable' | 'assisted' = 'assisted';
      let confidenceLevel: 'high' | 'medium' | 'low' = 'low';
      let expectedAmount = p.amount;

      const isVendasGerais = p.accounts?.name?.toUpperCase() === 'VENDAS GERAIS';
      const isRevenue = p.group === 'RECEITAS';
      const isExpense = p.group === 'DESPESAS';
      
      // Determine Mode
      if (isVendasGerais && isRevenue && p.payment_method_id) {
        mode = 'card_receivable';
        // Calculate expected net amount if we have a rule
        const rule = settlementRules?.find(r => r.payment_method_id === p.payment_method_id);
        if (rule) {
          const feePercent = rule.fee_percent || 0;
          const feeFixed = rule.fee_fixed || 0;
          const feeAmount = Number((p.amount * (feePercent / 100) + feeFixed).toFixed(2));
          expectedAmount = Number((p.amount - feeAmount).toFixed(2));
        }
      } else if (isRevenue) {
        // Check if it's PIX or receives same day
        const isPix = normalize(p.observations).includes('pix') || normalize(bankTx.description).includes('pix');
        if (isPix) {
          mode = 'instant_receipt';
        } else {
          mode = 'assisted';
        }
      } else if (isExpense) {
        mode = 'expense';
      }

      // 1. Value Score (up to 50 points)
      const diff = Math.abs(expectedAmount - absAmount);
      if (diff === 0) {
        score += 50;
        reasons.push("Valor exato");
      } else if (diff <= 1.00) {
        score += 45;
        reasons.push("Valor muito próximo (diff ≤ 1,00)");
      } else if (diff <= 3.00) {
        score += 35;
        reasons.push("Valor próximo (diff ≤ 3,00)");
      } else {
        const valScore = Math.max(0, 50 * (1 - diff / tolerance));
        score += valScore;
        if (valScore > 30) reasons.push("Valor aproximado");
      }

      // 2. Date Score (up to 30 points)
      const targetDate = mode === 'card_receivable' && p.due_date ? new Date(p.due_date) : new Date(p.occurrence_date);
      const daysDiff = Math.abs((targetDate.getTime() - dateObj.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysDiff === 0) {
        score += 30;
        reasons.push("Mesma data");
      } else if (daysDiff <= 2) {
        score += 25;
        reasons.push("Data muito próxima (±2 dias)");
      } else if (daysDiff <= 5) {
        score += 15;
        reasons.push("Data próxima (±5 dias)");
      } else {
        const dateScore = Math.max(0, 30 * (1 - daysDiff / 10));
        score += dateScore;
      }

      // 3. Text Similarity (up to 10 points)
      const entityWords = normalize(p.favored?.name);
      const noteWords = normalize(p.observations);
      let textScore = 0;
      const hasEntityMatch = entityWords.some(w => bankWords.includes(w));
      const hasNoteMatch = noteWords.some(w => bankWords.includes(w));
      if (hasEntityMatch) textScore += 7;
      if (hasNoteMatch) textScore += 3;
      score += textScore;
      if (textScore > 0) reasons.push("Texto compatível");

      // 4. Learned Mapping (up to 10 points)
      if (mapping && p.favored?.id === mapping.entity_id) {
        score += 10; 
        reasons.push("Favorecido frequente");
      }

      // Calculate Confidence Level based on Mode and Criteria
      if (mode === 'card_receivable') {
        if (diff <= 1.00 && daysDiff <= 2) {
          confidenceLevel = 'high';
          reasons.unshift("Alta confiança: Líquido e vencimento compatíveis");
        } else if (diff <= 3.00 && daysDiff <= 5) {
          confidenceLevel = 'medium';
          reasons.unshift("Média confiança: Valores e datas próximos");
        } else {
          confidenceLevel = 'low';
        }
      } else if (mode === 'instant_receipt' || mode === 'expense') {
        if (diff === 0 && daysDiff <= 2) {
          confidenceLevel = 'high';
          reasons.unshift("Alta confiança: Valor exato e data próxima");
        } else if (diff <= 0.05 && daysDiff <= 3) {
          confidenceLevel = 'medium';
          reasons.unshift("Média confiança: Valor e data próximos");
        } else {
          confidenceLevel = 'low';
        }
      } else {
        if (score >= 85) confidenceLevel = 'high';
        else if (score >= 60) confidenceLevel = 'medium';
        else confidenceLevel = 'low';
      }

      return {
        ...p,
        match_score: Math.min(100, Math.round(score)),
        confidence_level: confidenceLevel,
        reconciliation_mode: mode,
        expected_amount: expectedAmount,
        reasons: Array.from(new Set(reasons)).slice(0, 3),
        difference: diff,
        days_diff: Math.round(daysDiff),
        has_mapping: mapping && p.favored?.id === mapping.entity_id
      };
    });

    return candidates.sort((a, b) => b.match_score - a.match_score).slice(0, 10);
  },

  async searchPostings(companyId: string, filters: {
    query?: string;
    startDate?: string;
    endDate?: string;
    minAmount?: number;
    maxAmount?: number;
  }) {
    let query = supabase
      .from('postings')
      .select(`
        *,
        accounts (name),
        favored (id, name)
      `)
      .eq('company_id', companyId)
      .neq('status', 'LIQUIDADO')
      .is('liquidation_date', null)
      .order('occurrence_date', { ascending: false });

    if (filters.startDate) query = query.gte('occurrence_date', filters.startDate);
    if (filters.endDate) query = query.lte('occurrence_date', filters.endDate);
    if (filters.minAmount !== undefined) query = query.gte('amount', filters.minAmount);
    if (filters.maxAmount !== undefined) query = query.lte('amount', filters.maxAmount);

    const { data, error } = await query;
    if (error) throw error;

    const filteredData = data || [];

    if (filters.query) {
      const q = filters.query.toLowerCase();
      return filteredData.filter(p => 
        (p.observations || '').toLowerCase().includes(q) || 
        (p.favored?.name || '').toLowerCase().includes(q)
      );
    }

    return filteredData;
  },

  async savePayeeMapping(bankId: string, payeeKey: string, entityId: string, companyId: string) {
    const { error } = await supabase
      .from('ofx_payee_mappings')
      .upsert({
        bank_id: bankId,
        company_id: companyId,
        payee_key: payeeKey,
        entity_id: entityId,
        confidence: 1.0,
        updated_at: new Date().toISOString()
      }, { onConflict: 'bank_id,payee_key,company_id' });
    
    if (error) console.error("Error saving payee mapping:", error);
  }
};
