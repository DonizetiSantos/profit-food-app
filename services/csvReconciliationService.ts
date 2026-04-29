import { supabase } from '../src/lib/supabase';

type ConfidenceLevel = 'high' | 'medium' | 'low';
type ReconciliationMode = 'ifood_csv' | 'csv_learning' | 'assisted';

type SettlementRule = {
  payment_method_id: string;
  settlement_days: number;
  receives_same_day: boolean;
  fee_percent: number;
  fee_fixed: number;
  is_active: boolean;
};

type CsvLearning = {
  id: string;
  company_id: string;
  bank_id: string | null;
  source: string;
  description_pattern: string;
  category_pattern: string | null;
  transaction_sign: 'CREDIT' | 'DEBIT';
  posting_group: string | null;
  account_id: string | null;
  payment_method_id: string | null;
  times_used: number;
};

const toMoney = (value: number): number => Number(value.toFixed(2));

const normalizeText = (value: string | null | undefined): string =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeKey = (value: string | null | undefined): string =>
  normalizeText(value).replace(/\s+/g, ' ');

const getRawRow = (bankTx: any): Record<string, any> => bankTx?.raw?.row || {};

const getCsvDescription = (bankTx: any): string => {
  const row = getRawRow(bankTx);
  return String(row['descrição'] || row['descricao'] || bankTx?.description || '').trim();
};

const getCsvCategory = (bankTx: any): string | null => {
  const row = getRawRow(bankTx);
  const value = String(row.categoria || '').trim();
  return value || null;
};

const getTransactionSign = (bankTx: any): 'CREDIT' | 'DEBIT' =>
  Number(bankTx?.amount || 0) >= 0 ? 'CREDIT' : 'DEBIT';

export const csvReconciliationService = {
  isIfoodCsvTransaction(bankTx: any): boolean {
    return bankTx?.raw?.source === 'ifood_csv';
  },

  async getIfoodReconciliationCandidates(bankTx: any, companyId: string) {
    const absAmount = Math.abs(Number(bankTx.amount || 0));
    const transactionDate = new Date(`${bankTx.posted_date}T00:00:00`);
    const source = 'ifood_csv';
    const csvDescription = getCsvDescription(bankTx);
    const csvCategory = getCsvCategory(bankTx);
    const descriptionKey = normalizeKey(csvDescription || bankTx.description);
    const categoryKey = csvCategory ? normalizeKey(csvCategory) : null;
    const transactionSign = getTransactionSign(bankTx);

    const { data: settlementRulesData, error: settlementRulesError } = await supabase
      .from('payment_settlement_rules')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true);

    if (settlementRulesError) throw settlementRulesError;

    const settlementRules = (settlementRulesData || []) as SettlementRule[];
    const maxSettlementDays = settlementRules.reduce((max, rule) => Math.max(max, Number(rule.settlement_days || 0)), 0);

    const startDate = new Date(transactionDate);
    startDate.setDate(startDate.getDate() - Math.max(20, maxSettlementDays + 15));

    const endDate = new Date(transactionDate);
    endDate.setDate(endDate.getDate() + 10);

    const { data: learningData, error: learningError } = await supabase
      .from('csv_reconciliation_learning')
      .select('*')
      .eq('company_id', companyId)
      .eq('source', source)
      .eq('description_pattern', descriptionKey)
      .eq('transaction_sign', transactionSign)
      .or(`bank_id.eq.${bankTx.bank_id},bank_id.is.null`);

    if (learningError) throw learningError;

    const learningRows = ((learningData || []) as CsvLearning[]).filter((row) => {
      if (!row.category_pattern && !categoryKey) return true;
      if (!row.category_pattern) return true;
      return row.category_pattern === categoryKey;
    });

    const strongestLearning = learningRows.sort((a, b) => Number(b.times_used || 0) - Number(a.times_used || 0))[0] || null;

    let postingsQuery = supabase
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
      .lte('occurrence_date', endDate.toISOString().split('T')[0]);

    if (transactionSign === 'CREDIT') {
      postingsQuery = postingsQuery.eq('group', 'RECEITAS');
    } else {
      postingsQuery = postingsQuery.eq('group', 'DESPESAS');
    }

    const { data: postingsData, error: postingsError } = await postingsQuery.order('occurrence_date', { ascending: true });

    if (postingsError) throw postingsError;

    const paymentMethodIds = Array.from(
      new Set((postingsData || []).map((posting: any) => posting.payment_method_id).filter(Boolean))
    );

    let paymentMethodNames = new Map<string, string>();
    if (paymentMethodIds.length > 0) {
      const { data: methodsData, error: methodsError } = await supabase
        .from('payment_methods')
        .select('id, name')
        .in('id', paymentMethodIds);

      if (methodsError) throw methodsError;
      paymentMethodNames = new Map((methodsData || []).map((method: any) => [method.id, method.name]));
    }

    const categoryWords = normalizeText(csvCategory).split(' ').filter((word) => word.length > 2);
    const descriptionWords = normalizeText(csvDescription).split(' ').filter((word) => word.length > 2);

    const candidates = (postingsData || []).map((posting: any) => {
      const rule = settlementRules.find((item) => item.payment_method_id === posting.payment_method_id);
      const paymentMethodName = paymentMethodNames.get(posting.payment_method_id) || '';
      const paymentMethodWords = normalizeText(paymentMethodName).split(' ').filter((word) => word.length > 2);
      const observationWords = normalizeText(posting.observations).split(' ').filter((word) => word.length > 2);
      const accountName = posting.accounts?.name || '';

      let expectedAmount = Number(posting.amount || 0);
      if (rule) {
        const feePercent = Number(rule.fee_percent || 0);
        const feeFixed = Number(rule.fee_fixed || 0);
        expectedAmount = toMoney(Number(posting.amount || 0) - (Number(posting.amount || 0) * (feePercent / 100)) - feeFixed);
      }

      const targetDate = posting.due_date || posting.occurrence_date;
      const targetDateObj = new Date(`${targetDate}T00:00:00`);
      const daysDiff = Math.abs((targetDateObj.getTime() - transactionDate.getTime()) / (1000 * 60 * 60 * 24));
      const diff = Math.abs(Math.abs(expectedAmount) - absAmount);
      const tolerance = Math.max(1.00, absAmount * 0.01);

      let score = 0;
      const reasons: string[] = [];
      let reconciliationMode: ReconciliationMode = 'ifood_csv';

      if (diff <= 0.01) {
        score += 45;
        reasons.push('Valor líquido exato');
      } else if (diff <= 1.00) {
        score += 40;
        reasons.push('Valor líquido muito próximo');
      } else if (diff <= tolerance) {
        score += 30;
        reasons.push('Valor líquido dentro da tolerância');
      } else {
        score += Math.max(0, 25 * (1 - diff / Math.max(tolerance * 3, 1)));
      }

      if (daysDiff === 0) {
        score += 25;
        reasons.push('Mesma data prevista');
      } else if (daysDiff <= 2) {
        score += 20;
        reasons.push('Data prevista muito próxima');
      } else if (daysDiff <= 7) {
        score += 12;
        reasons.push('Data prevista próxima');
      }

      const categoryMethodMatch = categoryWords.some((word) => paymentMethodWords.includes(word));
      const descriptionMethodMatch = descriptionWords.some((word) => paymentMethodWords.includes(word));
      const observationMatch = [...categoryWords, ...descriptionWords].some((word) => observationWords.includes(word));

      if (categoryMethodMatch) {
        score += 10;
        reasons.push('Categoria compatível com meio de pagamento');
      }

      if (descriptionMethodMatch) {
        score += 8;
        reasons.push('Descrição compatível com meio de pagamento');
      }

      if (observationMatch) {
        score += 5;
        reasons.push('Observação compatível');
      }

      if (strongestLearning) {
        let learningScore = 0;

        if (strongestLearning.payment_method_id && strongestLearning.payment_method_id === posting.payment_method_id) {
          learningScore += 18;
        }

        if (strongestLearning.account_id && strongestLearning.account_id === posting.account_id) {
          learningScore += 12;
        }

        if (strongestLearning.posting_group && strongestLearning.posting_group === posting.group) {
          learningScore += 5;
        }

        if (learningScore > 0) {
          reconciliationMode = 'csv_learning';
          score += learningScore;
          reasons.push('Aprendizado de conciliação CSV');
        }
      }

      let confidenceLevel: ConfidenceLevel = 'low';
      if (score >= 85 && diff <= 1.00 && daysDiff <= 3) {
        confidenceLevel = 'high';
      } else if (score >= 65 && diff <= tolerance && daysDiff <= 7) {
        confidenceLevel = 'medium';
      }

      return {
        ...posting,
        payment_method_name: paymentMethodName,
        match_score: Math.min(100, Math.round(score)),
        confidence_level: confidenceLevel,
        reconciliation_mode: reconciliationMode,
        expected_amount: expectedAmount,
        difference: diff,
        days_diff: Math.round(daysDiff),
        reasons: Array.from(new Set(reasons)).slice(0, 4),
        has_csv_learning: Boolean(strongestLearning),
      };
    });

    return candidates
      .filter((candidate: any) => candidate.match_score >= 25)
      .sort((a: any, b: any) => b.match_score - a.match_score)
      .slice(0, 10);
  },

  async saveIfoodLearning(bankTx: any, posting: any, companyId: string): Promise<void> {
    if (!csvReconciliationService.isIfoodCsvTransaction(bankTx)) return;

    const descriptionKey = normalizeKey(getCsvDescription(bankTx) || bankTx.description);
    const categoryKey = getCsvCategory(bankTx) ? normalizeKey(getCsvCategory(bankTx)) : null;
    const transactionSign = getTransactionSign(bankTx);

    if (!descriptionKey) return;

    const payload = {
      company_id: companyId,
      bank_id: bankTx.bank_id || null,
      source: 'ifood_csv',
      description_pattern: descriptionKey,
      category_pattern: categoryKey,
      transaction_sign: transactionSign,
      posting_group: posting.group || null,
      account_id: posting.account_id || null,
      payment_method_id: posting.payment_method_id || null,
      last_bank_transaction_id: bankTx.id || null,
      last_posting_id: posting.id || null,
      updated_at: new Date().toISOString(),
    };

    let existingQuery = supabase
      .from('csv_reconciliation_learning')
      .select('id, times_used')
      .eq('company_id', companyId)
      .eq('source', 'ifood_csv')
      .eq('description_pattern', descriptionKey)
      .eq('transaction_sign', transactionSign);

    if (bankTx.bank_id) {
      existingQuery = existingQuery.eq('bank_id', bankTx.bank_id);
    } else {
      existingQuery = existingQuery.is('bank_id', null);
    }

    if (categoryKey) {
      existingQuery = existingQuery.eq('category_pattern', categoryKey);
    } else {
      existingQuery = existingQuery.is('category_pattern', null);
    }

    const { data: existingRows, error: existingError } = await existingQuery.limit(1);

    if (existingError) {
      console.error('[CSV Learning] Erro ao buscar aprendizado:', existingError);
      return;
    }

    const existing = existingRows?.[0] || null;

    if (existing) {
      const { error: updateError } = await supabase
        .from('csv_reconciliation_learning')
        .update({
          ...payload,
          times_used: Number(existing.times_used || 0) + 1,
        })
        .eq('id', existing.id);

      if (updateError) console.error('[CSV Learning] Erro ao atualizar aprendizado:', updateError);
      return;
    }

    const { error: insertError } = await supabase
      .from('csv_reconciliation_learning')
      .insert({
        ...payload,
        times_used: 1,
      });

    if (insertError) console.error('[CSV Learning] Erro ao salvar aprendizado:', insertError);
  },
};
