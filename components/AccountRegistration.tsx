
import React, { useState } from 'react';
import { MainGroup, Subgroup, Account } from '../types';

interface Props {
  subgroups: Subgroup[];
  accounts: Account[];
  onAddAccount: (name: string, subgroupId: string, groupId: MainGroup) => void;
  onDeleteAccount: (id: string) => void;
}

export const AccountRegistration: React.FC<Props> = ({ subgroups, accounts, onAddAccount, onDeleteAccount }) => {
  const renderGroup = (group: MainGroup, colorClass: string, accentColor: string) => {
    const groupSubgroups = subgroups.filter(s => s.groupId === group);
    const groupAccounts = accounts.filter(a => a.groupId === group);

    return (
      <div className="bg-slate-900 rounded-[2rem] shadow-2xl border border-slate-800 overflow-hidden flex flex-col h-full">
        <div className={`p-6 ${colorClass} text-white font-black text-xl flex justify-between items-center tracking-tighter`}>
          <span>{group}</span>
          <span className="text-[10px] font-bold opacity-60 bg-black/20 px-3 py-1 rounded-full uppercase tracking-widest">{groupAccounts.length} CONTAS</span>
        </div>
        
        <div className="p-6 space-y-8 flex-1 overflow-y-auto custom-scrollbar">
          {group === MainGroup.ESTOQUE ? (
            <div className="space-y-3">
              {groupAccounts.map(acc => (
                <div key={acc.id} className="flex justify-between items-center p-4 bg-slate-950 rounded-2xl border border-slate-800 shadow-inner">
                  <span className="font-bold text-slate-300 text-sm">{acc.name}</span>
                  <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Sistema</span>
                </div>
              ))}
            </div>
          ) : (
            groupSubgroups.map(sub => (
              <div key={sub.id} className="border-l-2 border-slate-800 pl-6 py-2">
                <h4 className="text-[10px] font-black text-slate-500 mb-4 uppercase tracking-[0.2em]">{sub.name}</h4>
                <div className="space-y-2 mb-6">
                  {groupAccounts.filter(a => a.subgroupId === sub.id).map(acc => (
                    <div key={acc.id} className="flex justify-between items-center p-3 bg-slate-900 hover:bg-slate-800/50 rounded-xl border border-transparent hover:border-slate-700 transition-all group">
                      <span className="text-sm font-bold text-slate-400 group-hover:text-slate-200">{acc.name}</span>
                      {!acc.isFixed && (
                        <button 
                          onClick={() => onDeleteAccount(acc.id)}
                          className="text-slate-700 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all p-1"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.target as HTMLFormElement;
                    const input = form.elements.namedItem('accName') as HTMLInputElement;
                    if (input.value.trim()) {
                      onAddAccount(input.value.trim(), sub.id, group);
                      input.value = '';
                    }
                  }}
                  className="flex gap-2"
                >
                  <input 
                    name="accName"
                    placeholder="Adicionar conta..." 
                    className="flex-1 text-[11px] p-2.5 bg-slate-950 border border-slate-800 rounded-lg focus:ring-1 focus:ring-rose-500 outline-none text-slate-300 placeholder:text-slate-700 font-bold"
                  />
                  <button type="submit" className={`bg-slate-800 hover:${accentColor} hover:text-white px-3 py-1 rounded-lg transition-all font-black text-slate-500 text-sm`}>
                    +
                  </button>
                </form>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fade-in space-y-8">
      <header>
        <h2 className="text-3xl font-black text-white tracking-tight">Plano de Contas</h2>
        <p className="text-slate-500 text-sm font-medium">Arquitetura lógica dos seus fluxos financeiros.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
        {renderGroup(MainGroup.RECEITAS, 'bg-emerald-600', 'bg-emerald-500')}
        {renderGroup(MainGroup.DESPESAS, 'bg-rose-600', 'bg-rose-500')}
        {renderGroup(MainGroup.ESTOQUE, 'bg-blue-600', 'bg-blue-500')}
      </div>
    </div>
  );
};
