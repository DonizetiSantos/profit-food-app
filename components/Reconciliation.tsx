import React, { useState, useEffect, useRef } from 'react';
import { Bank } from '../types';
import { ofxImportService } from '../services/ofxImportService';
import { supabase } from '../src/lib/supabase';

interface Props {
  banks: Bank[];
  onRefresh?: () => void;
}

export const Reconciliation: React.FC<Props> = ({ banks, onRefresh }) => {
  const [selectedBankId, setSelectedBankId] = useState<string>('');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [selectedPostingId, setSelectedPostingId] = useState<string>('');
  const [reconciling, setReconciling] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadTransactions = async () => {
    if (!selectedBankId) {
      setTransactions([]);
      return;
    }
    setLoading(true);
    try {
      const data = await ofxImportService.getTransactions(selectedBankId, fromDate, toDate);
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

    if (!selectedBankId) {
      alert("Selecione o banco/conta antes de importar.");
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setImporting(true);
    try {
      const result = await ofxImportService.importOfxFile(selectedBankId, file);
      
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
    console.log("Conciliar clicked", transaction.id);
    setSelectedTransaction(transaction);
    setLoadingCandidates(true);
    setSelectedPostingId('');
    try {
      const results = await ofxImportService.getReconciliationCandidates(transaction);
      setCandidates(results);
      
      // Auto-select if score >= 90
      const bestMatch = results[0];
      if (bestMatch && bestMatch.match_score >= 90) {
        setSelectedPostingId(bestMatch.id);
        
        // Auto-liquidate if score >= 95 and has mapping
        if (bestMatch.match_score >= 95 && bestMatch.has_mapping) {
          console.log("Auto-matching detected for", transaction.id, "Score:", bestMatch.match_score);
          // We'll show a small indicator or just let the user confirm with one click
          // The prompt says "permitir auto-liquidação (sem modal)", so let's implement a quick path
          if (window.confirm(`Conciliação automática sugerida (Score: ${bestMatch.match_score}%). Confirmar vínculo com ${bestMatch.favored?.name}?`)) {
            await performReconciliation(transaction, bestMatch, 'AUTO');
            return;
          }
        }
      }
    } catch (err) {
      console.error("Erro ao buscar candidatos:", err);
      alert("Erro ao buscar lançamentos para conciliação.");
    } finally {
      setLoadingCandidates(false);
    }
  };

  const performReconciliation = async (bankTx: any, posting: any, type: 'MANUAL' | 'AUTO' = 'MANUAL') => {
    console.log(`Reconciling (${type})`, bankTx.id, "->", posting.id);
    setReconciling(true);

    try {
      // (A) Insert reconciliation
      const { error: recError } = await supabase
        .from('reconciliations')
        .insert({
          bank_transaction_id: bankTx.id,
          posting_id: posting.id,
          match_type: type,
          match_score: posting.match_score || 1,
          notes: bankTx.description
        });

      if (recError) throw recError;

      // (B) Update posting if PROVISIONADO
      if (posting.status === 'PROVISIONADO') {
        const { error: updateError } = await supabase
          .from('postings')
          .update({
            status: 'LIQUIDADO',
            bank_id: bankTx.bank_id,
            liquidation_date: bankTx.posted_date
          })
          .eq('id', posting.id);
        
        if (updateError) throw updateError;
      }

      // (C) Save learned mapping
      if (posting.favored?.id) {
        await ofxImportService.savePayeeMapping(bankTx.bank_id, bankTx.description, posting.favored.id);
      }

      if (type === 'MANUAL') alert("Conciliação realizada com sucesso");
      
      setSelectedTransaction(null);
      await loadTransactions();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error("Erro ao conciliar:", err);
      alert("Erro ao salvar conciliação: " + (err.message || "Erro desconhecido"));
    } finally {
      setReconciling(false);
    }
  };

  const handleConfirmReconciliation = async () => {
    const bankTx = selectedTransaction;
    const posting = candidates.find(c => c.id === selectedPostingId);

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
              {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
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
          <div className="bg-slate-900 w-full max-w-2xl rounded-[2.5rem] border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <div>
                <h3 className="text-2xl font-black text-white uppercase tracking-tight">Conciliar Transação</h3>
                <p className="text-slate-500 text-xs font-medium mt-1">Vincule esta transação bancária a um lançamento do sistema.</p>
              </div>
              <button 
                onClick={() => setSelectedTransaction(null)}
                className="p-2 rounded-xl hover:bg-slate-800 text-slate-500 transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="p-8 bg-slate-950/30 border-b border-slate-800">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Data</span>
                  <span className="text-xs font-bold text-slate-300">{formatDate(selectedTransaction.posted_date)}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Valor</span>
                  <span className={`text-xs font-black ${selectedTransaction.amount < 0 ? 'text-rose-500' : 'text-emerald-400'}`}>
                    R$ {selectedTransaction.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex flex-col gap-1 col-span-2">
                  <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Descrição / Memo</span>
                  <span className="text-xs font-bold text-slate-300 truncate">{selectedTransaction.description}</span>
                </div>
              </div>
              {selectedTransaction.fit_id && (
                <div className="mt-4 pt-4 border-t border-slate-800/50">
                  <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">FITID: </span>
                  <span className="text-[10px] font-mono text-slate-500">{selectedTransaction.fit_id}</span>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Sugestões de Lançamentos</h4>
              
              {loadingCandidates ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-8 h-8 border-3 border-rose-500/20 border-t-rose-500 rounded-full animate-spin"></div>
                  <p className="text-slate-600 text-[9px] font-black uppercase tracking-widest">Buscando sugestões...</p>
                </div>
              ) : candidates.length === 0 ? (
                <div className="py-12 text-center bg-slate-950/50 rounded-3xl border border-dashed border-slate-800">
                  <p className="text-slate-500 text-xs font-medium">Nenhum lançamento compatível encontrado.</p>
                  <p className="text-slate-600 text-[10px] mt-1">Verifique o valor e a data (janela de +/- 10 dias).</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {candidates.map((c) => (
                    <div 
                      key={c.id}
                      onClick={() => setSelectedPostingId(c.id)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex justify-between items-center group ${selectedPostingId === c.id ? 'bg-rose-500/10 border-rose-500/50 shadow-lg shadow-rose-500/5' : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'}`}
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-200 uppercase tracking-tight">{c.favored?.name || 'Sem Entidade'}</span>
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-widest ${c.status === 'LIQUIDADO' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                            {c.status}
                          </span>
                          {c.match_score >= 90 && (
                            <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-widest bg-rose-500/20 text-rose-500 animate-pulse">
                              Sugestão Forte
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-slate-500 font-medium">
                          <span>{formatDate(c.occurrence_date)}</span>
                          <span className="w-1 h-1 bg-slate-800 rounded-full"></span>
                          <span>{c.accounts?.name}</span>
                          <span className="w-1 h-1 bg-slate-800 rounded-full"></span>
                          <span className={c.difference === 0 ? 'text-emerald-500' : 'text-amber-500'}>
                            Dif: R$ {c.difference.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                          <span className="w-1 h-1 bg-slate-800 rounded-full"></span>
                          <span>{c.days_diff} dias</span>
                        </div>
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
            </div>

            <div className="p-8 border-t border-slate-800 bg-slate-900/50 flex gap-4">
              <button 
                onClick={() => setSelectedTransaction(null)}
                className="flex-1 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white hover:bg-slate-800 transition-all border border-slate-800"
              >
                Cancelar
              </button>
              <button 
                disabled={!selectedPostingId || reconciling}
                onClick={handleConfirmReconciliation}
                className={`flex-[2] px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl ${!selectedPostingId || reconciling ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20'}`}
              >
                {reconciling ? 'Processando...' : 'Confirmar Conciliação'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
