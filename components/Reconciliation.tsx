import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Bank, User } from '../types';
import { ofxImportService } from '../services/ofxImportService';
import { settlementService } from '../services/settlementService';
import { supabase } from '../src/lib/supabase';
import { useActiveCompany } from '../src/contexts/CompanyContext';
import { IfoodImportModal } from './IfoodImportModal';

interface Props {
  banks: Bank[];
  onRefresh?: () => void;
  user: User | null;
}

export const Reconciliation: React.FC<Props> = ({ banks, onRefresh, user }) => {
  const { activeCompany } = useActiveCompany();
  const [selectedBankId, setSelectedBankId] = useState<string>('');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [isIfoodModalOpen, setIsIfoodModalOpen] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [selectedPostingId, setSelectedPostingId] = useState<string>('');
  const [reconciling, setReconciling] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manual Selection State
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualQuery, setManualQuery] = useState('');
  const [manualStartDate, setManualStartDate] = useState('');
  const [manualEndDate, setManualEndDate] = useState('');
  const [manualMinAmount, setManualMinAmount] = useState('');
  const [manualMaxAmount, setManualMaxAmount] = useState('');
  const [manualCandidates, setManualCandidates] = useState<any[]>([]);
  const [loadingManual, setLoadingManual] = useState(false);

  const sortedBanks = useMemo(() => [...banks].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [banks]);

  const loadTransactions = async () => {
    if (!selectedBankId || !activeCompany) {
      setTransactions([]);
      return;
    }
    setLoading(true);
    try {
      const data = await ofxImportService.getTransactions(selectedBankId, activeCompany.id, fromDate, toDate);
      setTransactions(data);
      console.log(`Transactions loaded: ${data.length}`);
    } catch (err) {
      console.error("Erro ao carregar transações:", err);
      alert("Erro ao carregar transações do banco.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, [selectedBankId, fromDate, toDate]);

  const handleImportClick = () => {
    if (!selectedBankId) {
      alert("Selecione um banco antes de importar.");
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!selectedBankId || !activeCompany) {
      alert("Selecione o banco/conta antes de importar.");
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setImporting(true);
    try {
      const result = await ofxImportService.importOfxFile(selectedBankId, file, activeCompany.id);
      
      if (result.status === 'SUCCESS') {
        console.log("OFX import ok, refreshing transactions...");
        
        // Update date filters based on imported file if available
        if (result.ofxData?.fromDate) setFromDate(result.ofxData.fromDate);
        if (result.ofxData?.toDate) setToDate(result.ofxData.toDate);

        const counts = result.counts;
        const msg = counts 
          ? `Importado: ${counts.total} transações (${counts.new} novas, ${counts.existing} já existentes)`
          : "Extrato importado e lista atualizada";
          
        alert(msg);
        await loadTransactions();
      } else if (result.status === 'DUPLICATE') {
        alert(result.message || "Este arquivo já foi importado anteriormente.");
      } else {
        alert("Erro ao importar OFX: " + (result.message || "Erro desconhecido"));
      }
    } catch (err: any) {
      alert("Erro ao importar OFX: " + (err.message || "Erro interno"));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  const handleReconcileClick = async (transaction: any) => {
    if (!activeCompany) return;
    console.log("Conciliar clicked", transaction.id);
    setSelectedTransaction(transaction);
    setLoadingCandidates(true);
    setSelectedPostingId('');
    setIsManualMode(false);
    setManualCandidates([]);
    
    // Clear manual filters by default as requested
    setManualStartDate('');
    setManualEndDate('');
    setManualMinAmount('');
    setManualMaxAmount('');
    setManualQuery('');

    try {
      const results = await ofxImportService.getReconciliationCandidates(transaction, activeCompany.id);
      setCandidates(results);
      
      // Auto-select if confidence is high
      const bestMatch = results[0];
      if (bestMatch && bestMatch.confidence_level === 'high') {
        setSelectedPostingId(bestMatch.id);
        
        // Auto-liquidate if requested (user said "para alta confiança executar automaticamente")
        // But usually in UI we might want a confirmation if it's the manual click.
        // However, the prompt says "auto-conciliação apenas quando a confiança for alta".
        // I'll implement a separate "Conciliar Tudo" button for the bulk action.
      }

      if (results.length === 0) {
        setIsManualMode(true);
        setLoadingManual(true);

        try {
          const manualResults = await ofxImportService.searchPostings(activeCompany.id, {});
          setManualCandidates(manualResults);
        } finally {
          setLoadingManual(false);
        }
      }
    } catch (err) {
      console.error("Erro ao buscar candidatos:", err);
      alert("Erro ao buscar lançamentos para conciliação.");
    } finally {
      setLoadingCandidates(false);
    }
  };

  const runAutoReconciliation = async () => {
    if (!activeCompany || reconciling) return;
    
    const pendingTransactions = transactions.filter(t => !t.isReconciled);
    if (pendingTransactions.length === 0) {
      alert("Nenhuma transação pendente para conciliar.");
      return;
    }

    if (!window.confirm(`Deseja executar a conciliação automática para ${pendingTransactions.length} transações pendentes? Apenas matches de ALTA CONFIANÇA serão processados.`)) {
      return;
    }

    setReconciling(true);
    let count = 0;

    try {
      for (const tx of pendingTransactions) {
        const candidates = await ofxImportService.getReconciliationCandidates(tx, activeCompany.id);
        const bestMatch = candidates[0];

        if (bestMatch && bestMatch.confidence_level === 'high') {
          await performReconciliation(tx, bestMatch, 'AUTO');
          count++;
        }
      }
      
      alert(`Conciliação automática concluída! ${count} transações foram conciliadas com sucesso.`);
      await loadTransactions();
    } catch (err: any) {
      console.error("Erro na conciliação automática:", err);
      alert("Ocorreu um erro durante a conciliação automática: " + err.message);
    } finally {
      setReconciling(false);
    }
  };

  const handleManualSearch = async () => {
    if (!activeCompany) return;
    setLoadingManual(true);
    try {
      const results = await ofxImportService.searchPostings(activeCompany.id, {
        query: manualQuery,
        startDate: manualStartDate,
        endDate: manualEndDate,
        minAmount: manualMinAmount ? parseFloat(manualMinAmount) : undefined,
        maxAmount: manualMaxAmount ? parseFloat(manualMaxAmount) : undefined
      });
      setManualCandidates(results);
    } catch (err) {
      console.error("Erro na busca manual:", err);
      alert("Erro ao buscar lançamentos.");
    } finally {
      setLoadingManual(false);
    }
  };

  const performReconciliation = async (bankTx: any, posting: any, type: 'MANUAL' | 'AUTO' = 'MANUAL') => {
    if (!activeCompany) return;
    console.log(`[Reconciliation] Starting (${type})`, { bankTxId: bankTx.id, postingId: posting.id, amount: bankTx.amount });
    setReconciling(true);

    try {
      const actualAmount = Math.abs(bankTx.amount);

      // (0) Check if bank transaction is already reconciled to avoid duplicates
      const { data: existingRec } = await supabase
        .from('reconciliations')
        .select('id')
        .eq('bank_transaction_id', bankTx.id)
        .eq('company_id', activeCompany.id)
        .maybeSingle();

      if (existingRec) {
        alert("Esta transação já foi conciliada.");
        setSelectedTransaction(null);
        setSelectedPostingId('');
        loadTransactions();
        return;
      }

      // (A) Check if it's a provisioned revenue from card/voucher
      // We check group RECEITAS, status PROVISIONADO and account VENDAS GERAIS
      const isProvisionedRevenue = posting.group === 'RECEITAS' && 
                                   posting.status === 'PROVISIONADO' &&
                                   posting.accounts?.name?.toUpperCase() === 'VENDAS GERAIS' &&
                                   posting.payment_method_id;

      if (isProvisionedRevenue) {
        // NEW LOGIC: Create a new posting for the receipt and keep original economic posting intact
        const receiptAccountId = await settlementService.resolveReceiptAccountByPaymentMethod(activeCompany.id, posting.payment_method_id);
        
        if (!receiptAccountId) {
          throw new Error(`Conta de recebimento não encontrada para o meio de pagamento do lançamento.`);
        }

        const newPostingId = crypto.randomUUID();
        
        // 1. Create the receipt posting (Financial Fact)
        const { error: newPostError } = await supabase
          .from('postings')
          .insert({
            id: newPostingId,
            company_id: activeCompany.id,
            status: 'LIQUIDADO',
            group: 'RECEITAS',
            account_id: receiptAccountId,
            amount: actualAmount,
            competence_date: bankTx.posted_date,
            occurrence_date: bankTx.posted_date,
            due_date: bankTx.posted_date,
            liquidation_date: bankTx.posted_date,
            bank_id: bankTx.bank_id,
            entity_id: posting.entity_id || null,
            payment_method_id: posting.payment_method_id,
            observations: `Recebimento conciliado via OFX - Ref: ${posting.observations || 'Venda PDV'}`
          });

        if (newPostError) throw newPostError;

        // 2. Insert reconciliation record linking to the NEW posting
        const { error: recError } = await supabase
          .from('reconciliations')
          .insert({
            company_id: activeCompany.id,
            bank_transaction_id: bankTx.id,
            posting_id: newPostingId,
            match_type: type,
            match_score: posting.match_score || 0,
            notes: `Recebimento de cartão conciliado: ${bankTx.description}`,
            reconciled_by: user?.id || null,
            matched_amount: actualAmount
          });

        if (recError) {
          console.error("[Reconciliation] Error inserting reconciliation (provisioned):", recError);
          // Fallback if some columns are missing
          const { error: retryError } = await supabase
            .from('reconciliations')
            .insert({
              company_id: activeCompany.id,
              bank_transaction_id: bankTx.id,
              posting_id: newPostingId,
              match_type: type,
              notes: `Recebimento de cartão conciliado: ${bankTx.description} (Valor: ${actualAmount})`
            });
          if (retryError) throw retryError;
        }

        // 3. Update original posting with a note, but KEEP IT PROVISIONADO and KEEP AMOUNT (Economic Fact)
        const { error: updateError } = await supabase
          .from('postings')
          .update({
            observations: (posting.observations || '') + ` [Conciliado OFX em ${bankTx.posted_date}]`
          })
          .eq('id', posting.id)
          .eq('company_id', activeCompany.id);

        if (updateError) throw updateError;

      } else {
        // OLD LOGIC (for expenses and other revenues)
        // (A) Insert reconciliation record
        const { error: recError } = await supabase
          .from('reconciliations')
          .insert({
            company_id: activeCompany.id,
            bank_transaction_id: bankTx.id,
            posting_id: posting.id,
            match_type: type,
            match_score: posting.match_score || 0,
            notes: bankTx.description,
            reconciled_by: user?.id || null,
            matched_amount: actualAmount
          });

        if (recError) {
          console.error("[Reconciliation] Error inserting reconciliation:", recError);
          // Fallback if columns are missing in some environments
          const { error: retryError } = await supabase
            .from('reconciliations')
            .insert({
              company_id: activeCompany.id,
              bank_transaction_id: bankTx.id,
              posting_id: posting.id,
              match_type: type,
              notes: `${bankTx.description} (Valor real: ${actualAmount})`
            });
          if (retryError) throw retryError;
        }

        // (B) Update posting: Status, Bank, Liquidation Date AND Amount
        const { error: updateError } = await supabase
          .from('postings')
          .update({
            status: 'LIQUIDADO',
            bank_id: bankTx.bank_id,
            liquidation_date: bankTx.posted_date,
            amount: actualAmount // Update to the real value paid/received
          })
          .eq('id', posting.id)
          .eq('company_id', activeCompany.id);
        
        if (updateError) {
          console.error("[Reconciliation] Error updating posting:", updateError);
          throw updateError;
        }
      }

      // (C) Save learned mapping for future auto-reconciliations
      if (posting.favored?.id) {
        await ofxImportService.savePayeeMapping(bankTx.bank_id, bankTx.description, posting.favored.id, activeCompany.id);
      }

      console.log("[Reconciliation] Success!");
      if (type === 'MANUAL') alert("Conciliação realizada com sucesso!");
      
      setSelectedTransaction(null);
      setSelectedPostingId('');
      setIsManualMode(false);
      
      await loadTransactions();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error("[Reconciliation] Critical error:", err);
      alert("Erro ao salvar conciliação: " + (err.message || "Erro desconhecido"));
    } finally {
      setReconciling(false);
    }
  };

  const handleConfirmReconciliation = async () => {
    const bankTx = selectedTransaction;
    const posting = isManualMode 
      ? manualCandidates.find(c => c.id === selectedPostingId)
      : candidates.find(c => c.id === selectedPostingId);

    if (!bankTx || !posting) {
      alert("Selecione uma transação e um lançamento para conciliar.");
      return;
    }

    await performReconciliation(bankTx, posting, 'MANUAL');
  };

  return (
    <div className="animate-fade-in space-y-8">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight uppercase">Conciliação Bancária</h2>
          <p className="text-slate-500 text-sm font-medium">Vincule seus extratos bancários (OFX) aos lançamentos do sistema.</p>
        </div>
        
        <div className="flex flex-wrap gap-4 bg-slate-900 p-3 rounded-3xl border border-slate-800 shadow-2xl items-center">
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Banco / Conta</label>
            <select 
              value={selectedBankId} 
              onChange={e => setSelectedBankId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs font-bold text-slate-300 outline-none focus:border-rose-500 transition-all min-w-[200px]"
            >
              <option value="">Selecionar Banco...</option>
              {sortedBanks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">De</label>
            <input 
              type="date" 
              value={fromDate} 
              onChange={e => setFromDate(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs font-bold text-slate-300 outline-none focus:border-rose-500 transition-all"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Até</label>
            <input 
              type="date" 
              value={toDate} 
              onChange={e => setToDate(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs font-bold text-slate-300 outline-none focus:border-rose-500 transition-all"
            />
          </div>

          <div className="flex items-end h-full pt-4">
            <input 
              type="file" 
              accept=".ofx" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
            />
            <button 
              onClick={handleImportClick}
              disabled={importing || !selectedBankId}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg ${importing || !selectedBankId ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-rose-600 hover:bg-rose-500 text-white'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
              {importing ? 'Processando...' : 'Importar OFX'}
            </button>

            <button
              onClick={() => setIsIfoodModalOpen(true)}
              disabled={!selectedBankId}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg ${!selectedBankId ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-500 text-white'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></svg>
              Importar CSV iFood
            </button>

            <button 
              onClick={runAutoReconciliation}
              disabled={reconciling || transactions.length === 0}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg ${reconciling || transactions.length === 0 ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>
              {reconciling ? 'Conciliando...' : 'Conciliar Automático'}
            </button>
          </div>
        </div>
      </header>

      <div className="bg-slate-900 rounded-[2rem] shadow-2xl border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="w-12 h-12 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin"></div>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest animate-pulse">Buscando transações...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center px-8">
            <div className="w-20 h-20 bg-slate-950 rounded-3xl flex items-center justify-center border border-slate-800 mb-6">
              <svg className="text-slate-700" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10h18"/><path d="M7 15h.01"/><path d="M11 15h.01"/><rect width="18" height="14" x="3" y="5" rx="2"/></svg>
            </div>
            <h3 className="text-xl font-black text-white uppercase tracking-tight mb-2">
              {!selectedBankId ? 'Selecione um banco' : 'Nenhuma transação encontrada'}
            </h3>
            <p className="text-slate-500 max-w-md mx-auto text-sm leading-relaxed font-medium">
              {!selectedBankId 
                ? 'Escolha uma conta bancária acima para visualizar o extrato importado.' 
                : 'Importe um arquivo OFX para começar a conciliar seus lançamentos.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-500 text-[9px] uppercase tracking-[0.2em] font-black border-b border-slate-800">
                  <th className="px-8 py-5">Data</th>
                  <th className="px-8 py-5">Descrição / Memo</th>
                  <th className="px-8 py-5 text-right">Valor</th>
                  <th className="px-8 py-5 text-center">Status</th>
                  <th className="px-8 py-5 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {transactions.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="px-8 py-5 text-xs font-bold text-slate-400">{formatDate(t.posted_date)}</td>
                    <td className="px-8 py-5">
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-slate-200 uppercase tracking-tight">{t.description}</span>
                        {t.fit_id && <span className="text-[9px] text-slate-600 font-bold font-mono mt-0.5">FITID: {t.fit_id}</span>}
                      </div>
                    </td>
                    <td className={`px-8 py-5 text-right text-sm font-black ${t.amount < 0 ? 'text-rose-500' : 'text-emerald-400'}`}>
                      R$ {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-8 py-5 text-center">
                      {t.isReconciled ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-full text-[9px] font-black uppercase tracking-widest">
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          Conciliado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-800 text-slate-500 rounded-full text-[9px] font-black uppercase tracking-widest">
                          Pendente
                        </span>
                      )}
                    </td>
                    <td className="px-8 py-5 text-center">
                      {!t.isReconciled ? (
                        <button 
                          onClick={() => handleReconcileClick(t)}
                          className="text-[9px] font-black text-rose-500 uppercase tracking-widest hover:text-rose-400 transition-colors"
                        >
                          Conciliar
                        </button>
                      ) : (
                        <span className="text-[9px] font-black text-slate-700 uppercase tracking-widest">
                          -
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reconcile Modal */}
      {selectedTransaction && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 w-full max-w-4xl rounded-[2.5rem] border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <div>
                <h3 className="text-xl font-black text-white uppercase tracking-tight">Conciliar Transação</h3>
                <p className="text-slate-500 text-[10px] font-medium mt-0.5">Vincule esta transação bancária a um lançamento do sistema.</p>
              </div>
              <button 
                onClick={() => setSelectedTransaction(null)}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-500 transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="p-5 bg-slate-950/30 border-b border-slate-800">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Data</span>
                  <span className="text-xs font-bold text-slate-300">{formatDate(selectedTransaction.posted_date)}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Valor</span>
                  <span className={`text-xs font-black ${selectedTransaction.amount < 0 ? 'text-rose-500' : 'text-emerald-400'}`}>
                    R$ {selectedTransaction.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 col-span-2">
                  <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Descrição / Memo</span>
                  <span className="text-xs font-bold text-slate-300 truncate">{selectedTransaction.description}</span>
                </div>
              </div>
              {selectedTransaction.fit_id && (
                <div className="mt-2 pt-2 border-t border-slate-800/50">
                  <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">FITID: </span>
                  <span className="text-[9px] font-mono text-slate-500 break-all">{selectedTransaction.fit_id}</span>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                  {isManualMode ? 'Busca Manual de Lançamentos' : 'Sugestões de Lançamentos'}
                </h4>
                <button 
                  onClick={() => {
                    setIsManualMode(!isManualMode);
                    setSelectedPostingId('');
                    if (!isManualMode) handleManualSearch();
                  }}
                  className="text-[9px] font-black text-rose-500 uppercase tracking-widest hover:underline"
                >
                  {isManualMode ? 'Voltar para Sugestões' : 'Selecionar manualmente'}
                </button>
              </div>
              
              {isManualMode ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
                    <div className="flex flex-col gap-1">
                      <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Busca</label>
                      <input 
                        type="text" 
                        placeholder="Descrição ou Favorecido..."
                        value={manualQuery}
                        onChange={e => setManualQuery(e.target.value)}
                        className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-[10px] font-bold text-slate-300 outline-none focus:border-rose-500"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Período</label>
                      <div className="flex items-center gap-2">
                        <input 
                          type="date" 
                          value={manualStartDate}
                          onChange={e => setManualStartDate(e.target.value)}
                          className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-[9px] font-bold text-slate-300 outline-none w-full"
                        />
                        <input 
                          type="date" 
                          value={manualEndDate}
                          onChange={e => setManualEndDate(e.target.value)}
                          className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-[9px] font-bold text-slate-300 outline-none w-full"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Faixa de Valor</label>
                      <div className="flex items-center gap-2">
                        <input 
                          type="number" 
                          placeholder="Min"
                          value={manualMinAmount}
                          onChange={e => setManualMinAmount(e.target.value)}
                          className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-[9px] font-bold text-slate-300 outline-none w-full"
                        />
                        <input 
                          type="number" 
                          placeholder="Max"
                          value={manualMaxAmount}
                          onChange={e => setManualMaxAmount(e.target.value)}
                          className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-[9px] font-bold text-slate-300 outline-none w-full"
                        />
                      </div>
                    </div>
                    <div className="md:col-span-3">
                      <button 
                        onClick={handleManualSearch}
                        className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-[9px] font-black uppercase tracking-widest rounded-lg transition-all"
                      >
                        Aplicar Filtros
                      </button>
                    </div>
                  </div>

                  {loadingManual ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <div className="w-8 h-8 border-3 border-rose-500/20 border-t-rose-500 rounded-full animate-spin"></div>
                      <p className="text-slate-600 text-[9px] font-black uppercase tracking-widest">Buscando lançamentos...</p>
                    </div>
                  ) : manualCandidates.length === 0 ? (
                    <div className="py-12 text-center bg-slate-950/50 rounded-3xl border border-dashed border-slate-800">
                      <p className="text-slate-500 text-xs font-medium">Nenhum lançamento encontrado com estes filtros.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {manualCandidates.map((c) => (
                        <div 
                          key={c.id}
                          onClick={() => setSelectedPostingId(c.id)}
                          className={`p-2.5 rounded-2xl border transition-all cursor-pointer flex justify-between items-center group ${selectedPostingId === c.id ? 'bg-rose-500/10 border-rose-500/50 shadow-lg shadow-rose-500/5' : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'}`}
                        >
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-slate-200 uppercase tracking-tight">{c.favored?.name || 'Sem Entidade'}</span>
                              <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-widest ${c.status === 'LIQUIDADO' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                                {c.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-slate-500 font-medium">
                              <span>{formatDate(c.occurrence_date)}</span>
                              <span className="w-1 h-1 bg-slate-800 rounded-full"></span>
                              <span>{c.accounts?.name}</span>
                              <span className="w-1 h-1 bg-slate-800 rounded-full"></span>
                              <span className="text-slate-400 truncate max-w-[150px]">{c.observations}</span>
                            </div>
                          </div>
                          <div className="text-right flex items-center gap-4">
                            <span className="text-sm font-black text-white">R$ {c.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${selectedPostingId === c.id ? 'border-rose-500 bg-rose-500 shadow-lg shadow-rose-500/20' : 'border-slate-700 group-hover:border-slate-600'}`}>
                              {selectedPostingId === c.id && <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {loadingCandidates ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <div className="w-8 h-8 border-3 border-rose-500/20 border-t-rose-500 rounded-full animate-spin"></div>
                      <p className="text-slate-600 text-[9px] font-black uppercase tracking-widest">Buscando sugestões...</p>
                    </div>
                  ) : candidates.length === 0 ? (
                    <div className="py-12 text-center bg-slate-950/50 rounded-3xl border border-dashed border-slate-800">
                      <p className="text-slate-500 text-xs font-medium">Nenhum lançamento compatível encontrado.</p>
                      <p className="text-slate-600 text-[10px] mt-1">Verifique o valor e a data (janela de +/- 10 dias).</p>
                      <button 
                        onClick={() => {
                          setIsManualMode(true);
                          handleManualSearch();
                        }}
                        className="mt-4 px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white text-[9px] font-black uppercase tracking-widest rounded-xl transition-all"
                      >
                        Selecionar lançamento manualmente
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {candidates.map((c) => (
                        <div 
                          key={c.id}
                          onClick={() => setSelectedPostingId(c.id)}
                          className={`p-2.5 rounded-2xl border transition-all cursor-pointer flex justify-between items-center group ${selectedPostingId === c.id ? 'bg-rose-500/10 border-rose-500/50 shadow-lg shadow-rose-500/5' : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'}`}
                        >
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-slate-200 uppercase tracking-tight">{c.favored?.name || 'Sem Entidade'}</span>
                              <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-widest ${c.status === 'LIQUIDADO' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                                {c.status}
                              </span>
                              {c.confidence_level === 'high' && (
                                <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-widest bg-emerald-500/20 text-emerald-500">
                                  Confiança Alta
                                </span>
                              )}
                              {c.confidence_level === 'medium' && (
                                <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-widest bg-amber-500/20 text-amber-500">
                                  Confiança Média
                                </span>
                              )}
                              {c.confidence_level === 'low' && (
                                <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-widest bg-slate-800 text-slate-500">
                                  Confiança Baixa
                                </span>
                              )}
                              {c.reconciliation_mode === 'card_receivable' && (
                                <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-widest bg-indigo-500/20 text-indigo-400">
                                  Cartão/Voucher
                                </span>
                              )}
                              {c.reconciliation_mode === 'instant_receipt' && (
                                <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-widest bg-sky-500/20 text-sky-400">
                                  PIX/Imediato
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-slate-500 font-medium">
                              <span>{formatDate(c.occurrence_date)}</span>
                              <span className="w-1 h-1 bg-slate-800 rounded-full"></span>
                              <span>{c.accounts?.name}</span>
                              <span className="w-1 h-1 bg-slate-800 rounded-full"></span>
                              <span className={c.difference === 0 ? 'text-emerald-500' : 'text-amber-500'}>
                                Líquido: R$ {c.expected_amount?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                              <span className="w-1 h-1 bg-slate-800 rounded-full"></span>
                              <span>{c.days_diff} dias</span>
                            </div>
                            {c.reasons && c.reasons.length > 0 && (
                              <div className="flex gap-2 mt-1">
                                {c.reasons.map((r: string, idx: number) => (
                                  <span key={idx} className="text-[8px] font-bold text-slate-600 uppercase tracking-tighter bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                                    {r}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="text-right flex items-center gap-4">
                            <div className="flex flex-col items-end">
                              <span className="text-sm font-black text-white">R$ {c.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              <span className={`text-[10px] font-black ${c.match_score >= 80 ? 'text-emerald-400' : c.match_score >= 50 ? 'text-amber-400' : 'text-slate-500'}`}>
                                {c.match_score}% Match
                              </span>
                            </div>
                            <div className="flex items-center justify-end">
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${selectedPostingId === c.id ? 'border-rose-500 bg-rose-500 shadow-lg shadow-rose-500/20' : 'border-slate-700 group-hover:border-slate-600'}`}>
                                {selectedPostingId === c.id && <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="p-5 border-t border-slate-800 bg-slate-900/50 flex gap-4">
              <button 
                onClick={() => setSelectedTransaction(null)}
                className="flex-1 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white hover:bg-slate-800 transition-all border border-slate-800"
              >
                Cancelar
              </button>
              <button 
                disabled={!selectedPostingId || reconciling}
                onClick={handleConfirmReconciliation}
                className={`flex-[2] px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl ${!selectedPostingId || reconciling ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20'}`}
              >
                {reconciling ? 'Processando...' : 'Confirmar Conciliação'}
              </button>
            </div>
          </div>
        </div>
      )}

      <IfoodImportModal
        isOpen={isIfoodModalOpen}
        bankId={selectedBankId}
        onClose={() => setIsIfoodModalOpen(false)}
        onSuccess={() => {
          setIsIfoodModalOpen(false);
          loadTransactions();
          if (onRefresh) onRefresh();
        }}
      />
    </div>
  );
};
