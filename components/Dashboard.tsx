
import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { FinancialPosting, MainGroup, Account, Bank } from '../types';

interface Props {
  postings: FinancialPosting[];
  accounts: Account[];
  banks: Bank[];
  onLiquidar?: (posting: FinancialPosting) => void;
}

export const Dashboard: React.FC<Props> = ({ postings, accounts, banks, onLiquidar }) => {
  const today = new Date().toISOString().split('T')[0];

  const stats = useMemo(() => {
    let realIncome = 0;
    let realExpense = 0;
    let provExpense = 0;

    postings.forEach(p => {
      if (p.status === 'LIQUIDADO') {
        if (p.group === MainGroup.RECEITAS) realIncome += p.amount;
        if (p.group === MainGroup.DESPESAS) realExpense += p.amount;
      } else {
        if (p.group === MainGroup.DESPESAS) provExpense += p.amount;
      }
    });

    const currentBalance = realIncome - realExpense;
    const projectedBalance = currentBalance - provExpense;

    // Calculate bank balances
    const bankBalances: Record<string, number> = {};
    banks.forEach(b => bankBalances[b.id] = 0);
    
    postings.forEach(p => {
      if (p.status === 'LIQUIDADO' && p.bankId) {
        if (p.group === MainGroup.RECEITAS) {
          bankBalances[p.bankId] += p.amount;
        } else if (p.group === MainGroup.DESPESAS) {
          bankBalances[p.bankId] -= p.amount;
        }
      }
    });

    return {
      currentBalance,
      provExpense,
      projectedBalance,
      totalRealIncome: realIncome,
      totalRealExpense: realExpense,
      bankBalances
    };
  }, [postings, banks]);

  const chartData = useMemo(() => {
    const dates: Record<string, { real: number, prov: number }> = {};
    postings.forEach(p => {
      const date = p.status === 'LIQUIDADO' ? p.liquidationDate || p.occurrenceDate : p.dueDate;
      if (!date) return;
      
      if (!dates[date]) dates[date] = { real: 0, prov: 0 };
      
      if (p.status === 'LIQUIDADO') {
        if (p.group === MainGroup.RECEITAS) {
          dates[date].real += p.amount;
        } else if (p.group === MainGroup.DESPESAS) {
          dates[date].real -= p.amount;
        }
      } else {
        if (p.group === MainGroup.DESPESAS) {
          dates[date].prov -= p.amount;
        }
      }
    });

    return Object.entries(dates)
      .map(([date, vals]) => ({
        date,
        formattedDate: date.split('-').reverse().slice(0, 2).join('/'),
        saldo: vals.real + vals.prov
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .reduce((acc: any[], curr, i) => {
        const prevSaldo = i > 0 ? acc[i-1].acumulado : 0;
        acc.push({ ...curr, acumulado: prevSaldo + curr.saldo });
        return acc;
      }, []);
  }, [postings]);

  const { overdue, upcoming } = useMemo(() => {
    const expenses = postings
      .filter(p => p.status === 'PROVISIONADO' && p.group === MainGroup.DESPESAS && p.dueDate)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    return {
      overdue: expenses.filter(p => p.dueDate < today),
      upcoming: expenses.filter(p => p.dueDate >= today).slice(0, 5)
    };
  }, [postings, today]);

  const formatCurrency = (val: number) => 
    val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const handleLiquidarAction = (p: FinancialPosting) => {
    if (onLiquidar) onLiquidar(p);
  };

  // Fix: Explicitly typing ItemCard as React.FC so it accepts the 'key' prop in overdue/upcoming maps
  const ItemCard: React.FC<{ p: FinancialPosting; isOverdue?: boolean }> = ({ p, isOverdue }) => (
    <div className={`flex items-center gap-4 p-4 rounded-2xl bg-slate-800/40 hover:bg-slate-800 transition-all border border-transparent hover:border-slate-700 group`}>
      <div className={`w-1 h-8 rounded-full ${isOverdue ? 'bg-rose-500 animate-pulse' : 'bg-amber-500'}`}></div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-black text-slate-200 truncate group-hover:text-white transition-colors">
          {accounts.find(a => a.id === p.accountId)?.name || 'CONTA'}
        </p>
        <p className={`text-[9px] font-bold uppercase tracking-wider ${isOverdue ? 'text-rose-500' : 'text-slate-500'}`}>
          {p.dueDate.split('-').reverse().join('/')} {isOverdue && '• VENCIDA'}
        </p>
      </div>
      <div className="text-right flex flex-col items-end gap-2">
        <p className={`text-[11px] font-black ${isOverdue ? 'text-rose-400' : 'text-amber-400'}`}>
          {formatCurrency(p.amount)}
        </p>
        <button 
          onClick={(e) => { e.stopPropagation(); handleLiquidarAction(p); }}
          className="px-2 py-1 bg-slate-700 hover:bg-rose-500 text-white text-[8px] font-black uppercase rounded-lg transition-all opacity-0 group-hover:opacity-100 flex items-center gap-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          Liquidar
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card de Saldo Real - Lado Esquerdo */}
        <div className="bg-slate-900 p-6 rounded-3xl shadow-xl border border-slate-800 flex flex-col">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Saldo Real em Caixa</p>
          <h3 className={`text-2xl font-black ${stats.currentBalance >= 0 ? 'text-blue-400' : 'text-rose-500'}`}>
            {formatCurrency(stats.currentBalance)}
          </h3>
          <p className="text-[9px] text-slate-500 mt-2 font-bold italic">Dinheiro disponível hoje</p>
          
          {/* Bank Balances List */}
          {banks.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-800 space-y-2 flex-1">
              {banks.map(bank => (
                <div key={bank.id} className="flex justify-between items-center">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">{bank.name}</span>
                  <span className={`text-[10px] font-black ${stats.bankBalances[bank.id] >= 0 ? 'text-slate-200' : 'text-rose-400'}`}>
                    {formatCurrency(stats.bankBalances[bank.id] || 0)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Coluna da Direita - Cards Empilhados */}
        <div className="flex flex-col gap-4">
          {/* Card de Contas a Pagar */}
          <div className="flex-1 bg-slate-900 p-6 rounded-3xl shadow-xl border border-slate-800 flex flex-col justify-center">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Contas a Pagar</p>
            <h3 className="text-2xl font-black text-amber-500">
              {formatCurrency(stats.provExpense)}
            </h3>
            <p className="text-[9px] text-slate-500 mt-1 font-bold italic">Saídas provisionadas</p>
          </div>

          {/* Card de Fluxo Previsto */}
          <div className={`flex-1 p-6 rounded-3xl shadow-xl text-white transition-colors duration-500 flex flex-col justify-center ${stats.projectedBalance >= 0 ? 'bg-emerald-600 shadow-emerald-900/20' : 'bg-rose-600 shadow-rose-900/20'}`}>
            <p className="text-[10px] font-black opacity-80 uppercase tracking-widest mb-1">Fluxo Final Previsto</p>
            <h3 className="text-2xl font-black">
              {formatCurrency(stats.projectedBalance)}
            </h3>
            <p className="text-[9px] opacity-70 mt-1 font-bold italic">Saldo Real - Saídas Pendentes</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-3xl shadow-xl border border-slate-800">
          <div className="flex justify-between items-center mb-8">
            <h4 className="font-bold text-slate-200">Previsão de Fluxo</h4>
            <span className="text-[10px] bg-slate-800 text-slate-400 px-3 py-1 rounded-full font-bold uppercase tracking-widest">Saldo Acumulado</span>
          </div>
          <div className="h-[300px] w-full">
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorSal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                  <XAxis dataKey="formattedDate" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(val) => `R$${val}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '16px', border: '1px solid #1e293b', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)' }}
                    itemStyle={{ color: '#fff' }}
                    labelStyle={{ color: '#64748b', fontSize: '10px' }}
                    formatter={(val: number) => [formatCurrency(val), 'Saldo']}
                  />
                  <Area type="monotone" dataKey="acumulado" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorSal)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-20"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
                <p className="text-xs font-bold uppercase tracking-widest opacity-30 italic">Dados insuficientes para o gráfico</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-slate-900 p-6 rounded-3xl shadow-xl border border-slate-800 flex flex-col max-h-[600px] overflow-hidden">
          <h4 className="font-bold text-slate-200 mb-6 flex items-center gap-2 text-sm shrink-0">
             <span className="w-2 h-2 rounded-full bg-amber-500"></span>
             Gestão de Contas (Saídas)
          </h4>
          
          <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
            {overdue.length > 0 && (
              <div>
                <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
                  Vencidas ({overdue.length})
                </p>
                <div className="space-y-3">
                  {overdue.map(p => <ItemCard key={p.id} p={p} isOverdue />)}
                </div>
              </div>
            )}

            <div>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                A Vencer Próximas
              </p>
              <div className="space-y-3">
                {upcoming.length > 0 ? (
                  upcoming.map(p => <ItemCard key={p.id} p={p} />)
                ) : (
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-700 py-4 text-center">Nenhum compromisso agendado</p>
                )}
              </div>
            </div>
          </div>

          {postings.length > 0 && (
             <div className="mt-8 pt-6 border-t border-slate-800 flex justify-between items-center px-2 shrink-0">
                <div className="text-left">
                  <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">Média Transações</p>
                  <p className="text-xs font-black text-slate-300">{formatCurrency((stats.totalRealIncome + stats.totalRealExpense) / (postings.length || 1))}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">Qtd Operações</p>
                  <p className="text-xs font-black text-slate-300">{postings.length}</p>
                </div>
             </div>
          )}
        </div>
      </div>
    </div>
  );
};
