import { supabase } from '../src/lib/supabase';
import { BankTransaction, Reconciliation, FinancialPosting } from '../types';

export const reconciliationService = {
  /**
   * Lista transações bancárias importadas para um banco específico em um período.
   */
  async listBankTransactions(bankId: string, from?: string, to?: string): Promise<BankTransaction[]> {
    let query = supabase
      .from('bank_transactions')
      .select('*')
      .eq('bank_id', bankId);

    if (from) query = query.gte('posted_date', from);
    if (to) query = query.lte('posted_date', to);

    const { data, error } = await query.order('posted_date', { ascending: false });
    
    if (error) throw error;
    
    return (data || []).map(t => ({
      id: t.id,
      bankId: t.bank_id,
      postedDate: t.posted_date,
      amount: Number(t.amount),
      description: t.description,
      fitId: t.fit_id,
      checkNumber: t.check_number,
      ofxFileHash: t.ofx_file_hash,
      raw: t.raw,
      createdAt: t.created_at
    }));
  },

  /**
   * Lista transações bancárias que ainda não foram conciliadas.
   */
  async listUnreconciledTransactions(bankId: string, from?: string, to?: string): Promise<BankTransaction[]> {
    // Busca IDs já conciliados
    const { data: reconciled } = await supabase
      .from('reconciliations')
      .select('bank_transaction_id');
    
    const reconciledIds = (reconciled || []).map(r => r.bank_transaction_id);

    let query = supabase
      .from('bank_transactions')
      .select('*')
      .eq('bank_id', bankId);

    if (reconciledIds.length > 0) {
      query = query.not('id', 'in', `(${reconciledIds.join(',')})`);
    }

    if (from) query = query.gte('posted_date', from);
    if (to) query = query.lte('posted_date', to);

    const { data, error } = await query.order('posted_date', { ascending: false });
    
    if (error) throw error;
    
    return (data || []).map(t => ({
      id: t.id,
      bankId: t.bank_id,
      postedDate: t.posted_date,
      amount: Number(t.amount),
      description: t.description,
      fitId: t.fit_id,
      checkNumber: t.check_number,
      ofxFileHash: t.ofx_file_hash,
      raw: t.raw,
      createdAt: t.created_at
    }));
  },

  /**
   * Busca sugestões de lançamentos para uma transação bancária.
   */
  async findSuggestions(transaction: BankTransaction): Promise<FinancialPosting[]> {
    const absAmount = Math.abs(transaction.amount);
    const tolerance = 0.05;
    
    // Janela de -10 a +10 dias
    const date = new Date(transaction.postedDate);
    const fromDate = new Date(date);
    fromDate.setDate(date.getDate() - 10);
    const toDate = new Date(date);
    toDate.setDate(date.getDate() + 10);

    const fromStr = fromDate.toISOString().split('T')[0];
    const toStr = toDate.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('postings')
      .select('*, favored(name), accounts(name)')
      .gte('occurrence_date', fromStr)
      .lte('occurrence_date', toStr)
      .gte('amount', absAmount - tolerance)
      .lte('amount', absAmount + tolerance)
      .in('status', ['PROVISIONADO', 'LIQUIDADO']);

    if (error) throw error;

    const candidates = (data || []).map(p => ({
      id: p.id,
      status: p.status,
      competenceDate: p.competence_date,
      occurrenceDate: p.occurrence_date,
      dueDate: p.due_date || '',
      group: p.group,
      accountId: p.account_id,
      accountName: p.accounts?.name,
      observations: p.observations || '',
      paymentMethodId: p.payment_method_id || '',
      entityId: p.entity_id || '',
      entityName: p.favored?.name,
      liquidationDate: p.liquidation_date,
      bankId: p.bank_id,
      amount: Number(p.amount)
    }));

    // Ordenar por data mais próxima
    candidates.sort((a, b) => {
      const diffA = Math.abs(new Date(a.occurrenceDate).getTime() - date.getTime());
      const diffB = Math.abs(new Date(b.occurrenceDate).getTime() - date.getTime());
      return diffA - diffB;
    });

    console.log("Found candidates", candidates.length);
    return candidates;
  },

  /**
   * Executa a conciliação manual.
   */
  async reconcile(bankTransactionId: string, posting: FinancialPosting, transactionDate: string, bankId: string): Promise<void> {
    // 1. Inserir reconciliação
    const { error: recError } = await supabase
      .from('reconciliations')
      .insert({
        bank_transaction_id: bankTransactionId,
        posting_id: posting.id,
        match_type: 'MANUAL',
        matched_amount: posting.amount,
        status: 'MATCHED'
      });

    if (recError) throw recError;

    // 2. Se estiver PROVISIONADO, atualizar para LIQUIDADO
    if (posting.status === 'PROVISIONADO') {
      const { error: postError } = await supabase
        .from('postings')
        .update({
          status: 'LIQUIDADO',
          bank_id: bankId,
          liquidation_date: transactionDate
        })
        .eq('id', posting.id);
      
      if (postError) throw postError;
    }

    console.log("Reconciliation saved");
  },

  /**
   * Remove uma conciliação.
   */
  async deleteReconciliation(id: string): Promise<void> {
    const { error } = await supabase
      .from('reconciliations')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  }
};
