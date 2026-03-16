
import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { FinancialPosting, MainGroup, Account, Bank } from '../types';
import { calculateDRE } from '../src/lib/financialCalculations';

interface Props {
  postings: FinancialPosting[];
  accounts: Account[];
  banks: Bank[];
  onLiquidar?: (posting: FinancialPosting) => void;
}

export const Dashboard: React.FC<Props> = ({ postings, accounts, banks, onLiquidar }) => {
  const today = new Date().toISOString().split('T')[0];
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const dreData = useMemo(() => {
    return calculateDRE(postings, accounts, currentMonth, currentYear);
  }, [postings, accounts, currentMonth, currentYear]);

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

  const { overdue, upcoming, overdueTotal, upcomingTotal } = useMemo(() => {
    const expenses = postings
      .filter(p => {
        const account = accounts.find(a => a.id === p.accountId);
        const isTaxaCartao = account?.name.toUpperCase() === 'TAXAS CARTÕES';
        return p.status === 'PROVISIONADO' && p.group === MainGroup.DESPESAS && p.dueDate && !isTaxaCartao;
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const overdueList = expenses.filter(p => p.dueDate < today);
    const upcomingList = expenses.filter(p => p.dueDate >= today);

    return {
      overdue: overdueList,
      upcoming: upcomingList.slice(0, 5),
      overdueTotal: overdueList.reduce((sum, p) => sum + p.amount, 0),
      upcomingTotal: upcomingList.reduce((sum, p) => sum + p.amount, 0)
    };
  }, [postings, today]);

  const formatCurrency = (val: number) => 
    val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatPercent = (val: number, base: number) => {
    if (base === 0) return '0,0%';
    return `${((val / base) * 100).toFixed(1)}%`;
  };

  const getIndicatorStatus = (type: string, value: number) => {
    const percent = dreData.faturamentoBruto > 0 ? (value / dreData.faturamentoBruto) * 100 : 0;
    
    switch (type) {
      case 'CMV':
        if (percent <= 35) return { label: 'Saudável', color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
        if (percent <= 38) return { label: 'Atenção', color: 'text-amber-400', bg: 'bg-amber-500/10' };
        return { label: 'Crítico', color: 'text-rose-400', bg: 'bg-rose-500/10' };
      case 'MARGEM':
        if (percent >= 40) return { label: 'Saudável', color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
        if (percent >= 37) return { label: 'Atenção', color: 'text-amber-400', bg: 'bg-amber-500/10' };
        return { label: 'Crítico', color: 'text-rose-400', bg: 'bg-rose-500/10' };
      case 'FIXAS':
        if (percent <= 35) return { label: 'Saudável', color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
        if (percent <= 38) return { label: 'Atenção', color: 'text-amber-400', bg: 'bg-amber-500/10' };
        return { label: 'Crítico', color: 'text-rose-400', bg: 'bg-rose-500/10' };
      case 'PESSOAL':
        if (percent <= 25) return { label: 'Saudável', color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
        if (percent <= 28) return { label: 'Atenção', color: 'text-amber-400', bg: 'bg-amber-500/10' };
        return { label: 'Crítico', color: 'text-rose-400', bg: 'bg-rose-500/10' };
      case 'FINANCEIRAS':
        if (percent <= 5) return { label: 'Saudável', color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
        if (percent <= 7) return { label: 'Atenção', color: 'text-amber-400', bg: 'bg-amber-500/10' };
        return { label: 'Crítico', color: 'text-rose-400', bg: 'bg-rose-500/10' };
      case 'DIVIDA':
        if (percent <= 10) return { label: 'Saudável', color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
        if (percent <= 15) return { label: 'Atenção', color: 'text-amber-400', bg: 'bg-amber-500/10' };
        return { label: 'Crítico', color: 'text-rose-400', bg: 'bg-rose-500/10' };
      case 'LUCRATIVIDADE':
        if (percent > 10) return { label: 'Saudável', color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
        if (percent >= 7) return { label: 'Atenção', color: 'text-amber-400', bg: 'bg-amber-500/10' };
        return { label: 'Crítico', color: 'text-rose-400', bg: 'bg-rose-500/10' };
      default:
        return { label: 'N/A', color: 'text-slate-400', bg: 'bg-slate-500/10' };
    }
  };

  const operationalSecurity = useMemo(() => {
    const faturamento = dreData.faturamentoBruto;
    const despesasFixas = dreData.totalDespesasFixas;
    const margemContrib = dreData.lucroBruto;
    
    const mcPercent = faturamento > 0 ? margemContrib / faturamento : 0;
    const pontoEquilibrio = mcPercent > 0 ? despesasFixas / mcPercent : 0;
    const margemSeguranca = faturamento > 0 ? ((faturamento - pontoEquilibrio) / faturamento) * 100 : 0;

    let status = 'Operação segura';
    let color = 'text-emerald-400';
    let bg = 'bg-emerald-500/10';
    let interpretation = 'As vendas atuais estão acima do ponto de equilíbrio com folga confortável.';

    if (margemSeguranca < 10) {
      status = 'Risco alto';
      color = 'text-rose-400';
      bg = 'bg-rose-500/10';
      interpretation = 'Pequena oscilação nas vendas pode pressionar o resultado.';
    } else if (margemSeguranca <= 20) {
      status = 'Atenção';
      color = 'text-amber-400';
      bg = 'bg-amber-500/10';
      interpretation = 'A folga operacional existe, mas ainda merece acompanhamento.';
    }

    return { pontoEquilibrio, margemSeguranca, status, color, bg, interpretation };
  }, [dreData]);

  const radarInfo = useMemo(() => {
    const alerts: { title: string, description: string, priority: 'high' | 'medium' | 'low' }[] = [];
    let score = 100;

    const faturamento = dreData.faturamentoBruto;
    const cmvPercent = faturamento > 0 ? (dreData.cmv / faturamento) * 100 : 0;
    const margemPercent = faturamento > 0 ? (dreData.lucroBruto / faturamento) * 100 : 0;
    const fixasPercent = faturamento > 0 ? (dreData.totalDespesasFixas / faturamento) * 100 : 0;
    const lucroPercent = faturamento > 0 ? (dreData.lucroOperacional / faturamento) * 100 : 0;
    const pessoalPercent = faturamento > 0 ? (dreData.pessoal / faturamento) * 100 : 0;
    const financeirasPercent = faturamento > 0 ? (dreData.despesasFinanceiras / faturamento) * 100 : 0;
    const dividaPercent = faturamento > 0 ? (dreData.servicoDivida / faturamento) * 100 : 0;

    // Margem de Contribuição (Peso Alto: 25)
    if (margemPercent < 37) {
      alerts.push({ title: 'Margem Comprimida', description: 'Margem abaixo de 37% sugere investigar precificação ou taxas de cartões.', priority: 'high' });
      score -= 25;
    } else if (margemPercent < 40) {
      score -= 10;
    }

    // Despesas Fixas (Peso Alto: 20)
    if (fixasPercent > 38) {
      alerts.push({ title: 'Fixas Elevadas', description: 'Estrutura fixa acima de 38% pode estar pesada para o faturamento atual.', priority: 'high' });
      score -= 20;
    } else if (fixasPercent > 35) {
      score -= 8;
    }

    // Lucratividade (Peso Alto: 20)
    if (lucroPercent < 7) {
      alerts.push({ title: 'Lucratividade Baixa', description: 'Resultado operacional abaixo de 7% exige revisão imediata de custos.', priority: 'high' });
      score -= 20;
    } else if (lucroPercent < 10) {
      score -= 8;
    }

    // Fluxo Final Previsto (Peso Médio-Alto: 15)
    if (stats.projectedBalance < 0) {
      alerts.push({ title: 'Risco de Caixa', description: 'Fluxo final previsto negativo sugere necessidade de antecipação ou cortes.', priority: 'high' });
      score -= 15;
    }

    // Contas Vencidas (Peso Médio: 10)
    if (overdue.length > 0) {
      alerts.push({ title: 'Contas Vencidas', description: 'Há compromissos em atraso; vale acompanhar o impacto no custo financeiro.', priority: 'medium' });
      score -= 10;
    }

    // CMV (Peso Médio: 10)
    if (cmvPercent > 38) {
      alerts.push({ title: 'CMV Crítico', description: 'Custo de mercadoria acima de 38% sugere falhas em compras ou estoque.', priority: 'medium' });
      score -= 10;
    } else if (cmvPercent > 35) {
      alerts.push({ title: 'CMV em Atenção', description: 'CMV levemente acima da referência; vale observar desperdícios.', priority: 'low' });
      score -= 5;
    } else {
      alerts.push({ title: 'CMV Controlado', description: 'Custo de mercadoria dentro da média de referência.', priority: 'low' });
    }

    // Margem de Segurança (Peso Médio-Alto: 10)
    if (operationalSecurity.margemSeguranca < 10) {
      alerts.push({ title: 'Segurança em Risco', description: 'Margem de segurança baixa; operação vulnerável a quedas de venda.', priority: 'high' });
      score -= 10;
    } else if (operationalSecurity.margemSeguranca > 20) {
      alerts.push({ title: 'Folga Operacional', description: 'Margem de segurança confortável no momento.', priority: 'low' });
    }

    score = Math.max(0, score);
    let status = 'Saudável';
    let statusColor = 'text-emerald-400';
    let gaugeColor = '#10b981';
    if (score < 50) {
      status = 'Crítico';
      statusColor = 'text-rose-500';
      gaugeColor = '#f43f5e';
    } else if (score < 80) {
      status = 'Atenção';
      statusColor = 'text-amber-500';
      gaugeColor = '#f59e0b';
    }

    return { score, status, statusColor, gaugeColor, alerts: alerts.sort((a, b) => (a.priority === 'high' ? -1 : 1)).slice(0, 4) };
  }, [dreData, overdue, stats.projectedBalance, operationalSecurity]);

  const interpretationText = useMemo(() => {
    if (dreData.faturamentoBruto === 0) return "Aguardando dados de faturamento para análise executiva.";
    
    const lucroPercent = (dreData.lucroOperacional / dreData.faturamentoBruto) * 100;
    if (lucroPercent > 10) return "Os indicadores atuais sugerem uma operação saudável neste momento, com boa folga operacional. Vale acompanhar a evolução do mês para confirmar a consistência dessa tendência.";
    if (lucroPercent >= 7) return "O painel sugere uma operação em equilíbrio, mas com pontos específicos que ainda merecem monitoramento, especialmente custos variáveis.";
    return "O resultado operacional atual sugere atenção imediata. Vale investigar se a compressão vem de custos fixos elevados ou margens reduzidas.";
  }, [dreData]);

  const priorityFinancial = useMemo(() => {
    if (dreData.faturamentoBruto === 0) return null;

    const faturamento = dreData.faturamentoBruto;
    const indicators = [
      {
        name: 'CMV',
        current: (dreData.cmv / faturamento) * 100,
        ideal: 35,
        type: 'lower',
        impact: 'Redução da margem bruta e pressão no lucro operacional.',
        label: 'Custo de Mercadoria'
      },
      {
        name: 'Margem de Contribuição',
        current: (dreData.lucroBruto / faturamento) * 100,
        ideal: 40,
        type: 'higher',
        impact: 'Dificuldade em cobrir custos fixos e gerar lucro líquido.',
        label: 'Margem de Contribuição'
      },
      {
        name: 'Despesas Fixas',
        current: (dreData.totalDespesasFixas / faturamento) * 100,
        ideal: 35,
        type: 'lower',
        impact: 'Estrutura pesada que exige faturamento muito alto para equilibrar.',
        label: 'Despesas Fixas'
      },
      {
        name: 'Custo com Pessoal',
        current: (dreData.pessoal / faturamento) * 100,
        ideal: 25,
        type: 'lower',
        impact: 'Folha de pagamento desproporcional ao volume de vendas.',
        label: 'Custo de Pessoal'
      },
      {
        name: 'Despesas Financeiras',
        current: (dreData.despesasFinanceiras / faturamento) * 100,
        ideal: 5,
        type: 'lower',
        impact: 'Endividamento ou taxas bancárias corroendo o resultado final.',
        label: 'Despesas Financeiras'
      },
      {
        name: 'Lucratividade',
        current: (dreData.lucroOperacional / faturamento) * 100,
        ideal: 10,
        type: 'higher',
        impact: 'Retorno sobre a operação abaixo do esperado para o setor.',
        label: 'Lucratividade'
      }
    ];

    const deviations = indicators.map(ind => {
      const deviation = ind.type === 'lower' 
        ? ind.current - ind.ideal 
        : ind.ideal - ind.current;
      return { ...ind, deviation };
    });

    const worst = deviations.reduce((prev, current) => (prev.deviation > current.deviation) ? prev : current);

    if (worst.deviation <= 0) return { healthy: true };

    const estimatedImpact = faturamento * (worst.deviation / 100);

    return {
      healthy: false,
      name: worst.name,
      label: worst.label,
      current: worst.current,
      ideal: worst.ideal,
      impact: worst.impact,
      type: worst.type,
      estimatedImpact
    };
  }, [dreData]);

  const handleLiquidarAction = (p: FinancialPosting) => {
    if (onLiquidar) onLiquidar(p);
  };

  const IndicatorCard = ({ title, value, type, isCurrency = false }: { title: string, value: number, type: string, isCurrency?: boolean }) => {
    const status = getIndicatorStatus(type, value);
    const percent = dreData.faturamentoBruto > 0 ? (value / dreData.faturamentoBruto) * 100 : 0;
    
    return (
      <div className="bg-slate-900 p-5 rounded-3xl border border-slate-800 shadow-xl flex flex-col gap-2">
        <div className="flex justify-between items-start">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{title}</p>
          <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${status.bg} ${status.color}`}>
            {status.label}
          </span>
        </div>
        <div>
          <h4 className="text-xl font-black text-white">
            {isCurrency ? formatCurrency(value) : `${percent.toFixed(1)}%`}
          </h4>
          {isCurrency && (
            <p className="text-[10px] font-bold text-slate-500 mt-0.5">
              Representa {percent.toFixed(1)}% das vendas
            </p>
          )}
        </div>
      </div>
    );
  };

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
    <div className="space-y-6 animate-fade-in pb-12">
      {/* 1. Indicadores Executivos do Topo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-xl flex flex-col gap-1">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Faturamento</p>
          <h4 className="text-lg font-black text-emerald-400 truncate">
            {formatCurrency(dreData.faturamentoBruto)}
          </h4>
          <p className="text-[8px] font-bold text-slate-600 uppercase tracking-tighter italic">Vendas Brutas</p>
        </div>
        <IndicatorCard title="CMV" value={dreData.cmv} type="CMV" />
        <IndicatorCard title="Margem Contrib." value={dreData.lucroBruto} type="MARGEM" />
        <IndicatorCard title="Despesas Fixas" value={dreData.totalDespesasFixas} type="FIXAS" />
        <IndicatorCard title="Pessoal" value={dreData.pessoal} type="PESSOAL" />
        <IndicatorCard title="Financeiras" value={dreData.despesasFinanceiras} type="FINANCEIRAS" />
        <IndicatorCard title="Lucratividade" value={dreData.lucroOperacional} type="LUCRATIVIDADE" />
      </div>

      {/* PRIORIDADE FINANCEIRA DO NEGÓCIO */}
      {priorityFinancial && (
        <div className={`p-6 rounded-3xl border shadow-xl flex flex-col md:flex-row items-center gap-6 transition-all duration-500 ${priorityFinancial.healthy ? 'bg-emerald-900/10 border-emerald-500/20' : 'bg-rose-900/10 border-rose-500/20'}`}>
          <div className={`p-4 rounded-2xl shrink-0 ${priorityFinancial.healthy ? 'bg-emerald-500/20' : 'bg-rose-500/20'}`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={priorityFinancial.healthy ? 'text-emerald-400' : 'text-rose-400'}>
              {priorityFinancial.healthy ? (
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3" />
              ) : (
                <>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </>
              )}
            </svg>
          </div>
          
          <div className="flex-1">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">Prioridade Financeira</h3>
            {priorityFinancial.healthy ? (
              <p className="text-sm font-black text-emerald-400 uppercase tracking-tight">
                Indicadores financeiros dentro da faixa saudável segundo o método Profit Food.
              </p>
            ) : (
              <div className="space-y-4">
                <div>
                  <h4 className="text-xl font-black text-white uppercase tracking-tight leading-none">
                    {priorityFinancial.label} ACIMA DO IDEAL
                  </h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                    Foco imediato na correção deste indicador para proteger o resultado.
                  </p>
                </div>
                
                <div className="flex gap-8">
                  <div>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Atual</p>
                    <p className="text-lg font-black text-rose-400">{priorityFinancial.current.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Ideal</p>
                    <p className="text-lg font-black text-emerald-400">{priorityFinancial.type === 'lower' ? 'até' : 'mínimo'} {priorityFinancial.ideal}%</p>
                  </div>
                  {priorityFinancial.estimatedImpact && (
                    <div className="pl-8 border-l border-slate-800/50">
                      <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-1">Impacto Estimado no Resultado</p>
                      <p className="text-lg font-black text-white">+{formatCurrency(priorityFinancial.estimatedImpact)}/mês</p>
                      <p className="text-[8px] font-bold text-slate-500 uppercase mt-0.5">Se ajustado ao nível ideal</p>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-800/50">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Possível Impacto</p>
                  <p className="text-xs font-medium text-slate-300 italic">"{priorityFinancial.impact}"</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Interpretação Executiva Curta */}
      <div className="bg-indigo-600/5 border border-indigo-500/20 p-3 rounded-xl flex items-center gap-3">
        <div className="bg-indigo-600/20 p-1.5 rounded-lg">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        </div>
        <p className="text-[11px] font-medium text-indigo-200/80 italic leading-relaxed">
          {interpretationText}
        </p>
      </div>

      {/* 3. Radar Financeiro Executivo */}
      <div className="bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl overflow-hidden">
        <div className="p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Área Esquerda: Gauge / Velocímetro */}
          <div className="lg:col-span-4 flex flex-col items-center justify-center border-r border-slate-800/50 pr-8">
            <div className="relative w-full max-w-[200px] aspect-[1.6/1] flex items-end justify-center mb-2">
              <svg viewBox="0 0 100 60" className="w-full h-full overflow-visible">
                {/* Background Track Segments */}
                <path d="M 10 50 A 40 40 0 0 1 36.6 15.4" fill="none" stroke="#f43f5e" strokeWidth="10" strokeLinecap="round" opacity="0.15" />
                <path d="M 36.6 15.4 A 40 40 0 0 1 63.4 15.4" fill="none" stroke="#f59e0b" strokeWidth="10" strokeLinecap="round" opacity="0.15" />
                <path d="M 63.4 15.4 A 40 40 0 0 1 90 50" fill="none" stroke="#10b981" strokeWidth="10" strokeLinecap="round" opacity="0.15" />
                
                {/* Active Progress Arc (Optional, but adds depth) */}
                <path 
                  d="M 10 50 A 40 40 0 0 1 90 50" 
                  fill="none" 
                  stroke={radarInfo.gaugeColor} 
                  strokeWidth="10" 
                  strokeLinecap="round" 
                  strokeDasharray="125.6" 
                  strokeDashoffset={125.6 - (125.6 * radarInfo.score) / 100}
                  opacity="0.3"
                  className="transition-all duration-1000 ease-out"
                />

                {/* Needle / Ponteiro */}
                <g transform={`rotate(${(radarInfo.score / 100) * 180 - 90}, 50, 50)`} className="transition-transform duration-1000 ease-out">
                  <path d="M 50 50 L 50 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx="50" cy="50" r="5" fill="white" />
                  <circle cx="50" cy="50" r="2.5" fill="#0f172a" />
                </g>

                {/* Labels */}
                <text x="8" y="58" fontSize="5" fontWeight="black" fill="#475569" textAnchor="middle">0</text>
                <text x="92" y="58" fontSize="5" fontWeight="black" fill="#475569" textAnchor="middle">100</text>
              </svg>
              
              <div className="absolute bottom-0 flex flex-col items-center">
                <span className="text-5xl font-black text-white leading-none tracking-tighter">{radarInfo.score}</span>
              </div>
            </div>
            <div className={`mt-4 px-4 py-1 rounded-full bg-slate-800/50 border border-slate-700/50`}>
              <span className={`text-sm font-black uppercase tracking-[0.2em] ${radarInfo.statusColor}`}>{radarInfo.status}</span>
            </div>
          </div>

          {/* Área Central: Título e Base */}
          <div className="lg:col-span-3 flex flex-col justify-center border-r border-slate-800/50 px-4">
            <h3 className="text-xl font-black text-white uppercase tracking-tight mb-3">Radar Financeiro</h3>
            <p className="text-[10px] font-bold text-slate-500 leading-relaxed uppercase tracking-wider">
              Baseado em: CMV, Margem, Fixas, Lucratividade, Fluxo, Contas vencidas e Margem de Segurança.
            </p>
          </div>

          {/* Área Direita: Alertas Prioritários */}
          <div className="lg:col-span-5 grid grid-cols-1 gap-4 pl-4">
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-1">Alertas Prioritários</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {radarInfo.alerts.length > 0 ? radarInfo.alerts.map((alert, i) => (
                <div key={i} className="flex gap-3 items-start p-3 rounded-2xl bg-slate-800/30 border border-slate-800/50 hover:bg-slate-800/50 transition-colors group">
                  <div className={`mt-1 w-2 h-2 rounded-full shrink-0 shadow-lg ${alert.priority === 'high' ? 'bg-rose-500 shadow-rose-500/20' : alert.priority === 'medium' ? 'bg-amber-500 shadow-amber-500/20' : 'bg-blue-500 shadow-blue-500/20'}`}></div>
                  <div>
                    <p className="text-[11px] font-black text-slate-200 uppercase leading-none mb-1.5 group-hover:text-white transition-colors">{alert.title}</p>
                    <p className="text-[10px] font-medium text-slate-500 leading-snug group-hover:text-slate-400 transition-colors">{alert.description}</p>
                  </div>
                </div>
              )) : (
                <div className="col-span-2 p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  <p className="text-xs font-black text-emerald-400 uppercase tracking-widest italic">Operação em conformidade total.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Segurança da Operação */}
      <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-2xl ${operationalSecurity.bg}`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={operationalSecurity.color}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <div>
              <h4 className="text-sm font-black text-white uppercase tracking-tight">Segurança da Operação</h4>
              <p className={`text-[10px] font-black uppercase tracking-widest ${operationalSecurity.color}`}>{operationalSecurity.status}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 flex-1 max-w-xl">
            <div>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Ponto de Equilíbrio</p>
              <h5 className="text-xl font-black text-white">{formatCurrency(operationalSecurity.pontoEquilibrio)}</h5>
              <p className="text-[8px] font-bold text-slate-600 uppercase mt-0.5">Vendas necessárias p/ cobrir custos</p>
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Margem de Segurança</p>
              <h5 className={`text-xl font-black ${operationalSecurity.color}`}>{operationalSecurity.margemSeguranca.toFixed(1)}%</h5>
              <p className="text-[8px] font-bold text-slate-600 uppercase mt-0.5">Folga sobre o ponto crítico</p>
            </div>
          </div>

          <div className="hidden xl:block max-w-xs">
            <p className="text-[10px] font-medium text-slate-400 italic leading-relaxed text-right">
              "{operationalSecurity.interpretation}"
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 5. Saldo real em caixa + fluxo final previsto + previsão de fluxo */}
        <div className="lg:col-span-1 space-y-4">
          {/* Card de Saldo Real em Caixa */}
          <div className="bg-slate-900 p-5 rounded-3xl shadow-xl border border-slate-800 flex flex-col">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Saldo Real em Caixa</p>
                <h3 className={`text-2xl font-black ${stats.currentBalance >= 0 ? 'text-blue-400' : 'text-rose-500'}`}>
                  {formatCurrency(stats.currentBalance)}
                </h3>
              </div>
              <div className="bg-blue-500/10 p-2 rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
              </div>
            </div>
            
            <div className="space-y-2 mt-1">
              {banks.map(bank => (
                <div key={bank.id} className="flex justify-between items-center bg-slate-950/30 p-2 rounded-lg border border-slate-800/30">
                  <span className="text-[8px] font-bold text-slate-400 uppercase">{bank.name}</span>
                  <span className={`text-[9px] font-black ${stats.bankBalances[bank.id] >= 0 ? 'text-slate-200' : 'text-rose-400'}`}>
                    {formatCurrency(stats.bankBalances[bank.id] || 0)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 flex justify-between items-center opacity-60">
              <p className="text-[7px] font-black text-slate-500 uppercase">Contas Negativas: {Object.values(stats.bankBalances).filter((v: number) => v < 0).length}</p>
              <p className="text-[7px] font-black text-slate-500 uppercase">Maior Saldo: {formatCurrency(Math.max(0, ...(Object.values(stats.bankBalances) as number[])))}</p>
            </div>
          </div>

          {/* Card de Fluxo Previsto */}
          <div className={`p-5 rounded-3xl shadow-xl text-white transition-all duration-500 flex flex-col justify-between h-32 ${stats.projectedBalance >= 0 ? 'bg-emerald-600 shadow-emerald-900/20' : 'bg-rose-600 shadow-rose-900/20'}`}>
            <div>
              <p className="text-[9px] font-black opacity-80 uppercase tracking-widest mb-1">Fluxo Final Previsto</p>
              <h3 className="text-2xl font-black">
                {formatCurrency(stats.projectedBalance)}
              </h3>
            </div>
            <div className="flex justify-between items-end">
              <p className="text-[8px] opacity-70 font-bold italic">Saldo Real - Saídas Pendentes</p>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="opacity-30"><path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/></svg>
            </div>
          </div>
        </div>

        {/* Gráfico de Previsão de Fluxo */}
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-3xl shadow-xl border border-slate-800">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h4 className="font-black text-white uppercase tracking-tight text-base">Previsão de Fluxo</h4>
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Saldo Acumulado Projetado</p>
            </div>
            <div className="flex gap-2">
              <span className="text-[8px] bg-slate-800 text-slate-400 px-2 py-1 rounded-lg font-black uppercase tracking-widest border border-slate-700">30 Dias</span>
            </div>
          </div>
          <div className="h-[240px] w-full">
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorSal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" opacity={0.5} />
                  <XAxis dataKey="formattedDate" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#64748b', fontWeight: 'bold' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#64748b', fontWeight: 'bold' }} tickFormatter={(val) => `R$${val}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '16px', border: '1px solid #1e293b', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', padding: '12px' }}
                    itemStyle={{ color: '#fff', fontWeight: 'black', fontSize: '11px' }}
                    labelStyle={{ color: '#64748b', fontSize: '9px', fontWeight: 'bold', marginBottom: '4px', textTransform: 'uppercase' }}
                    formatter={(val: number) => [formatCurrency(val), 'Saldo Projetado']}
                  />
                  <ReferenceLine x={today.split('-').reverse().slice(0, 2).join('/')} stroke="#3b82f6" strokeDasharray="5 5" label={{ position: 'top', value: 'HOJE', fill: '#3b82f6', fontSize: 9, fontWeight: 'black' }} />
                  <ReferenceLine y={5000} stroke="#f43f5e" strokeDasharray="3 3" opacity={0.3} label={{ position: 'right', value: 'MÍNIMO SEGURANÇA', fill: '#f43f5e', fontSize: 7, fontWeight: 'black' }} />
                  <Area type="monotone" dataKey="acumulado" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorSal)" animationDuration={2000} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-10"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-20 italic">Dados insuficientes para projeção</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 6. Gestão de Contas (Saídas) */}
      <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h4 className="font-black text-white uppercase tracking-tight text-base flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"></span>
              Gestão de Contas (Saídas)
            </h4>
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Controle de compromissos financeiros</p>
          </div>
          
          <div className="flex gap-3">
            <div className="bg-rose-500/10 px-3 py-1.5 rounded-xl border border-rose-500/20">
              <p className="text-[7px] font-black text-rose-500 uppercase tracking-widest mb-0.5">Vencidas</p>
              <p className="text-xs font-black text-rose-400">{formatCurrency(overdueTotal)} <span className="text-[9px] opacity-60 ml-1">({overdue.length})</span></p>
            </div>
            <div className="bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/20">
              <p className="text-[7px] font-black text-amber-500 uppercase tracking-widest mb-0.5">Próximas</p>
              <p className="text-xs font-black text-amber-400">{formatCurrency(upcomingTotal)} <span className="text-[9px] opacity-60 ml-1">({upcoming.length})</span></p>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {overdue.length > 0 && (
            <div className="space-y-3">
              <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
                Contas Vencidas
              </p>
              <div className="space-y-2">
                {overdue.map(p => <ItemCard key={p.id} p={p} isOverdue />)}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
              Próximos Compromissos
            </p>
            <div className="space-y-2">
              {upcoming.length > 0 ? (
                upcoming.map(p => <ItemCard key={p.id} p={p} />)
              ) : (
                <div className="bg-slate-950/30 border border-dashed border-slate-800 rounded-xl p-6 text-center">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-700 italic">Nenhum compromisso agendado</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
