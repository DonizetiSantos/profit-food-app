
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { FinancialPosting, Account, Bank, PaymentMethod, Entity, MainGroup } from '../types';

interface Props {
  initialSearch?: string;
  postings: FinancialPosting[];
  accounts: Account[];
  banks: Bank[];
  paymentMethods: PaymentMethod[];
  entities: Entity[];
  onDeletePosting: (id: string) => void;
  onEditPosting: (posting: FinancialPosting) => void;
}

export const PostingsList: React.FC<Props> = ({ 
  initialSearch = '', postings, accounts, banks, paymentMethods, entities, onDeletePosting, onEditPosting
}) => {
  const [searchTerm, setSearchTerm] = useState(initialSearch);

  useEffect(() => {
    setSearchTerm(initialSearch);
  }, [initialSearch]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  };

  const getAccountName = (id: string) => accounts.find(a => a.id === id)?.name || id;
  const getBankName = (id?: string) => banks.find(b => b.id === id)?.name || id || '-';
  const getMethodName = (id: string) => paymentMethods.find(m => m.id === id)?.name || id || '-';
  const getEntityName = (id: string) => entities.find(e => e.id === id)?.name || id || '-';

  const filteredPostings = useMemo(() => {
    if (!searchTerm) return postings;
    const lowerSearch = searchTerm.toLowerCase();
    
    return postings.filter(p => {
      const accName = getAccountName(p.accountId).toLowerCase();
      const bankName = getBankName(p.bankId).toLowerCase();
      const methodName = getMethodName(p.paymentMethodId).toLowerCase();
      const entName = getEntityName(p.entityId).toLowerCase();
      const obs = (p.observations || '').toLowerCase();
      
      const compDate = formatDate(p.competenceDate).toLowerCase();
      const occurDate = formatDate(p.occurrenceDate).toLowerCase();
      const dueDate = formatDate(p.dueDate).toLowerCase();
      const liqDate = formatDate(p.liquidationDate).toLowerCase();
      
      return (
        accName.includes(lowerSearch) || 
        bankName.includes(lowerSearch) || 
        methodName.includes(lowerSearch) || 
        entName.includes(lowerSearch) || 
        obs.includes(lowerSearch) ||
        compDate.includes(lowerSearch) ||
        occurDate.includes(lowerSearch) ||
        dueDate.includes(lowerSearch) ||
        liqDate.includes(lowerSearch)
      );
    });
  }, [postings, searchTerm, accounts, banks, paymentMethods, entities]);

  return (
    <div className="animate-fade-in w-full space-y-0">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 sticky top-[65px] z-40 bg-slate-950/95 backdrop-blur-sm py-6 -mx-4 px-4 border-b border-slate-800/50">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight">Extrato de Movimentações</h2>
          <p className="text-slate-500 text-sm font-medium">Histórico completo de auditoria financeira.</p>
        </div>
        
        <div className="relative w-full md:w-96 group">
          <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-500 group-focus-within:text-rose-500 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </span>
          <input 
            type="text"
            placeholder="Pesquise por nome, banco, data (dd/mm/aaaa)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-slate-900 border border-slate-800 rounded-2xl focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none transition-all shadow-xl text-slate-100 placeholder:text-slate-600 font-medium text-xs"
          />
        </div>
      </header>

      <div className="bg-slate-900 rounded-b-[2rem] shadow-2xl border-x border-b border-slate-800 overflow-hidden mt-0">
        <div className="overflow-auto custom-scrollbar max-h-[350px]">
          <table className="w-full text-left border-collapse min-w-[1400px]">
            <thead className="sticky top-0 z-30">
              <tr className="bg-slate-950 text-slate-500 text-[9px] uppercase tracking-[0.2em] font-black shadow-md">
                <th className="px-5 py-5 border-r border-slate-800/50">Emissão</th>
                <th className="px-5 py-5 border-r border-slate-800/50">Ocorrência</th>
                <th className="px-5 py-5 border-r border-slate-800/50">Vencimento</th>
                <th className="px-5 py-5 border-r border-slate-800/50 text-center">Tipo</th>
                <th className="px-5 py-5 border-r border-slate-800/50">Descrição Plano</th>
                <th className="px-5 py-5 border-r border-slate-800/50">Notas</th>
                <th className="px-5 py-5 border-r border-slate-800/50">Operação</th>
                <th className="px-5 py-5 border-r border-slate-800/50">Entidade</th>
                <th className="px-5 py-5 border-r border-slate-800/50">Liquidação</th>
                <th className="px-5 py-5 border-r border-slate-800/50">Banco</th>
                <th className="px-5 py-5 border-r border-slate-800/50 bg-rose-500/5 text-rose-500 text-center">Débito Real</th>
                <th className="px-5 py-5 border-r border-slate-800/50 bg-emerald-500/5 text-emerald-500 text-center">Crédito Real</th>
                <th className="px-5 py-5 border-r border-slate-800/50 bg-rose-900/10 text-rose-300 text-center">Prev. Débito</th>
                <th className="px-5 py-5 border-r border-slate-800/50 bg-emerald-900/10 text-emerald-300 text-center">Prev. Crédito</th>
                <th className="px-5 py-5 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredPostings.length === 0 ? (
                <tr>
                  <td colSpan={15} className="text-center py-24 text-slate-600 font-bold italic bg-slate-900/50">
                    Nenhum registro encontrado para "{searchTerm}".
                  </td>
                </tr>
              ) : (
                filteredPostings.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-800/30 transition-colors text-[11px] font-bold text-slate-400 group">
                    <td className="px-5 py-4 border-r border-slate-800/30 whitespace-nowrap">{formatDate(p.competenceDate)}</td>
                    <td className="px-5 py-4 border-r border-slate-800/30 whitespace-nowrap">{formatDate(p.occurrenceDate)}</td>
                    <td className="px-5 py-4 border-r border-slate-800/30 whitespace-nowrap">{formatDate(p.dueDate)}</td>
                    <td className="px-5 py-4 border-r border-slate-800/30 text-center">
                      <span className={`px-2 py-0.5 rounded text-[9px] ${p.group === MainGroup.RECEITAS ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                        {p.group}
                      </span>
                    </td>
                    <td className="px-5 py-4 border-r border-slate-800/30 truncate max-w-[180px] text-slate-300">{getAccountName(p.accountId)}</td>
                    <td className="px-5 py-4 border-r border-slate-800/30 truncate max-w-[180px] italic opacity-60 font-medium">{p.observations}</td>
                    <td className="px-5 py-4 border-r border-slate-800/30">{getMethodName(p.paymentMethodId)}</td>
                    <td className="px-5 py-4 border-r border-slate-800/30 text-slate-300">{getEntityName(p.entityId)}</td>
                    <td className="px-5 py-4 border-r border-slate-800/30 whitespace-nowrap">{formatDate(p.liquidationDate)}</td>
                    <td className="px-5 py-4 border-r border-slate-800/30">{getBankName(p.bankId)}</td>
                    
                    <td className="px-5 py-4 border-r border-slate-800/30 text-right font-black text-rose-500 bg-rose-500/[0.02]">
                      {p.status === 'LIQUIDADO' && p.group === MainGroup.DESPESAS ? p.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''}
                    </td>
                    <td className="px-5 py-4 border-r border-slate-800/30 text-right font-black text-emerald-400 bg-emerald-500/[0.02]">
                      {p.status === 'LIQUIDADO' && p.group === MainGroup.RECEITAS ? p.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''}
                    </td>
                    <td className="px-5 py-4 border-r border-slate-800/30 text-right font-black text-rose-300/60 bg-slate-950/20">
                      {p.status === 'PROVISIONADO' && p.group === MainGroup.DESPESAS ? p.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''}
                    </td>
                    <td className="px-5 py-4 border-r border-slate-800/30 text-right font-black text-emerald-300/60 bg-slate-950/20">
                      {p.status === 'PROVISIONADO' && p.group === MainGroup.RECEITAS ? p.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''}
                    </td>

                    <td className="px-5 py-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditPosting(p);
                          }}
                          className="text-slate-600 hover:text-blue-400 p-2 rounded-xl hover:bg-blue-400/10 transition-all"
                          title="Editar/Liquidar lançamento"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                        </button>
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeletePosting(p.id);
                          }}
                          className="text-slate-600 hover:text-rose-500 p-2 rounded-xl hover:bg-rose-500/10 transition-all"
                          title="Excluir lançamento"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
