
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
      .eq('status', 'PROVISIONADO')
      .not('accounts.name', 'ilike', 'VENDAS GERAIS') // Exclude Vendas Gerais
      .gte('occurrence_date', startDate.toISOString().split('T')[0])
      .lte('occurrence_date', endDate.toISOString().split('T')[0])
      .gte('amount', minAmount)
      .lte('amount', maxAmount)
      .order('occurrence_date', { ascending: true });

    if (error) throw error;

    // Filter out null accounts (which happens if the .not filter on join table doesn't work as expected in some Supabase versions)
    const filteredData = data.filter(p => p.accounts && p.accounts.name.toUpperCase() !== 'VENDAS GERAIS');

    // Fetch payee mapping for this bank and description
    const { data: mapping } = await supabase
      .from('ofx_payee_mappings')
      .select('entity_id')
      .eq('bank_id', bankTx.bank_id)
      .eq('payee_key', bankTx.description)
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

    // Scoring logic
    const candidates = filteredData.map(p => {
      let score = 0;
      let reasons: string[] = [];
      
      // 1. Value (up to 60 points)
      const diff = Math.abs(p.amount - absAmount);
      if (diff === 0) {
        score += 60;
        reasons.push("Valor exato");
      } else {
        const valScore = Math.max(0, 60 * (1 - diff / tolerance));
        score += valScore;
        if (valScore > 40) reasons.push("Valor muito próximo");
        else reasons.push("Valor aproximado");
      }

      // 2. Date proximity (up to 25 points)
      const pDate = new Date(p.occurrence_date);
      const daysDiff = Math.abs((pDate.getTime() - dateObj.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff === 0) {
        score += 25;
        reasons.push("Mesma data");
      } else {
        const dateScore = Math.max(0, 25 * (1 - daysDiff / 10));
        score += dateScore;
        if (dateScore > 15) reasons.push("Data próxima");
      }

      // 3. Text similarity (up to 15 points)
      const entityWords = normalize(p.favored?.name);
      const noteWords = normalize(p.observations);
      
      let textScore = 0;
      const hasEntityMatch = entityWords.some(w => bankWords.includes(w));
      const hasNoteMatch = noteWords.some(w => bankWords.includes(w));
      
      if (hasEntityMatch) textScore += 10;
      if (hasNoteMatch) textScore += 5;
      
      score += Math.min(15, textScore);
      if (textScore > 0) reasons.push("Texto semelhante");
      
      // Bonus for learned mapping
      if (mapping && p.favored?.id === mapping.entity_id) {
        score += 30; 
        reasons.push("Favorecido frequente");
      }

      return {
        ...p,
        match_score: Math.min(100, Math.round(score)),
        reasons: Array.from(new Set(reasons)).slice(0, 2),
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
      .eq('status', 'PROVISIONADO')
      .not('accounts.name', 'ilike', 'VENDAS GERAIS')
      .order('occurrence_date', { ascending: false });

    if (filters.startDate) query = query.gte('occurrence_date', filters.startDate);
    if (filters.endDate) query = query.lte('occurrence_date', filters.endDate);
    if (filters.minAmount !== undefined) query = query.gte('amount', filters.minAmount);
    if (filters.maxAmount !== undefined) query = query.gte('amount', filters.maxAmount);

    const { data, error } = await query;
    if (error) throw error;

    // Extra safety filter
    const filteredData = data.filter(p => p.accounts && p.accounts.name.toUpperCase() !== 'VENDAS GERAIS');

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
