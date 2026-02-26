
import React, { useState, useMemo } from 'react';
import { FinancialPosting, MainGroup, Account, Subgroup } from '../types';
import { getDetailedFinancialAnalysis, FinancialAnalysisData } from '../services/geminiService';

interface Props {
  postings: FinancialPosting[];
  accounts: Account[];
  subgroups: Subgroup[];
  onShowAnalysis: (data: FinancialAnalysisData, period: string) => void;
}

export const DRE: React.FC<Props> = ({ postings, accounts, subgroups, onShowAnalysis }) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [analyzing, setAnalyzing] = useState(false);

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => current - 2 + i);
  }, []);

  const data = useMemo(() => {
    const isReceiptAccount = (accId: string) => {
      const acc = accounts.find(a => a.id === accId);
      return acc?.name.toUpperCase().includes('RECEBIMENTO') || false;
    };

    const filtered = postings.filter(p => {
      const [year, month, day] = p.occurrenceDate.split('-').map(Number);
      const localDate = new Date(year, month - 1, day, 12, 0, 0);
      const isPeriodMatch = localDate.getMonth() === selectedMonth && localDate.getFullYear() === selectedYear;
      return isPeriodMatch && !isReceiptAccount(p.accountId);
    });

    // Função para obter valor total de um subgrupo ou conta específica
    const getVal = (accId?: string, subId?: string) => {
      return filtered
        .filter(p => (accId ? p.accountId === accId : true) && (subId ? accounts.find(a => a.id === p.accountId)?.subgroupId === subId : true))
        .reduce((sum, p) => sum + p.amount, 0);
    };

    // Função para obter o detalhamento de contas dentro de um subgrupo
    const getAccountDetails = (subId: string) => {
      const subAccounts = accounts.filter(a => a.subgroupId === subId);
      return subAccounts.map(acc => ({
        name: acc.name,
        value: filtered.filter(p => p.accountId === acc.id).reduce((sum, p) => sum + p.amount, 0)
      })).filter(acc => acc.value > 0);
    };

    const faturamentoBruto = getVal(undefined, 's-entradas-op');
    const faturamentoBrutoDetails = getAccountDetails('s-entradas-op');

    const impostos = getVal(undefined, 's-impostos');
    const impostosDetails = getAccountDetails('s-impostos');

    const variaveisVendas = getVal(undefined, 's-despesas-vendas');
    const variaveisVendasDetails = getAccountDetails('s-despesas-vendas');

    const estoqueInicial = filtered.filter(p => p.accountId === 'e-inicial').reduce((sum, p) => sum + p.amount, 0);
    const estoqueFinal = filtered.filter(p => p.accountId === 'e-final').reduce((sum, p) => sum + p.amount, 0);
    const compras = getVal(undefined, 's-despesas-compras');
    const comprasDetails = getAccountDetails('s-despesas-compras');
    const cmv = estoqueInicial + compras - estoqueFinal;

    const pessoal = getVal(undefined, 's-despesa-pessoal');
    const pessoalDetails = getAccountDetails('s-despesa-pessoal');

    const admin = getVal(undefined, 's-despesas-admin');
    const adminDetails = getAccountDetails('s-despesas-admin');

    const ocupacao = getVal(undefined, 's-despesas-ocupacao');
    const ocupacaoDetails = getAccountDetails('s-despesas-ocupacao');

    const totalDespesasFixas = pessoal + admin + ocupacao;

    const despesasFinanceiras = getVal(undefined, 's-despesas-financeiras');
    const despesasFinanceirasDetails = getAccountDetails('s-despesas-financeiras');

    const outrasEntradas = getVal(undefined, 's-entradas-nao-op');
    const outrasEntradasDetails = getAccountDetails('s-entradas-nao-op');

    const saidasNaoOperacionais = getVal(undefined, 's-saidas-nao-op');
    const saidasNaoOperacionaisDetails = getAccountDetails('s-saidas-nao-op');

    const investimentos = getVal(undefined, 's-investimentos');
    const investimentosDetails = getAccountDetails('s-investimentos');

    const faturamentoLiquido = faturamentoBruto - impostos;
    const lucroBruto = faturamentoLiquido - variaveisVendas - cmv;
    const lucroOperacional = lucroBruto - totalDespesasFixas;
    const resultadoLiquido = lucroOperacional - despesasFinanceiras;
    const resultadoAposAmortizacao = resultadoLiquido + outrasEntradas - saidasNaoOperacionais - investimentos;

    return {
      faturamentoBruto, faturamentoBrutoDetails, impostos, impostosDetails, faturamentoLiquido, 
      variaveisVendas, variaveisVendasDetails, cmv, compras, comprasDetails, estoqueInicial, estoqueFinal, lucroBruto,
      pessoal, pessoalDetails, admin, adminDetails, ocupacao, ocupacaoDetails, totalDespesasFixas, 
      lucroOperacional, despesasFinanceiras, despesasFinanceirasDetails,
      resultadoLiquido, outrasEntradas, outrasEntradasDetails, saidasNaoOperacionais, 
      saidasNaoOperacionaisDetails, investimentos, investimentosDetails,
      resultadoAposAmortizacao
    };
  }, [postings, accounts, selectedMonth, selectedYear]);

  const handleGenerateAnalysis = async () => {
    if (data.faturamentoBruto === 0) {
      alert("Não há dados de faturamento para analisar este período.");
      return;
    }

    setAnalyzing(true);
    try {
      const dashboardStats = {
        contasAPagarTotal: postings.filter(p => p.status === 'PROVISIONADO' && p.group === MainGroup.DESPESAS).reduce((s, p) => s + p.amount, 0)
      };

      const period = `${months[selectedMonth]} de ${selectedYear}`;
      const analysis = await getDetailedFinancialAnalysis(data, dashboardStats, period);
      onShowAnalysis(analysis, period);
    } catch (err) {
      alert("Erro ao gerar análise. Verifique sua conexão ou chave de API.");
    } finally {
      setAnalyzing(false);
    }
  };

  const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatPercent = (val: number) => {
    if (data.faturamentoBruto === 0) return '0,00%';
    return `${((val / data.faturamentoBruto) * 100).toFixed(2)}%`;
  };

  const Row = ({ label, value, isBold = false, isSub = false, color = "text-slate-300", forceVisible = false, className = "" }: any) => {
    if (!forceVisible && !isBold && value === 0) return null;
    return (
      <div className={`flex items-center py-2 px-4 border-b border-slate-800/30 hover:bg-slate-800/10 transition-colors ${isBold ? 'bg-slate-900/50' : ''} ${className}`}>
        <div className={`flex-1 text-[11px] uppercase tracking-wider ${isBold ? 'font-black text-white' : 'font-bold text-slate-500'} ${isSub ? 'pl-8 lowercase italic text-slate-400' : ''}`}>
          {isSub && <span className="mr-2 opacity-50">└</span>}
          {label}
        </div>
        <div className={`w-32 text-right text-[11px] font-black ${isSub ? 'text-slate-400' : color}`}>
          {formatCurrency(value)}
        </div>
        <div className={`w-24 text-right text-[10px] font-bold text-slate-600`}>
          {formatPercent(value)}
        </div>
      </div>
    );
  };

  const SectionTitle = ({ label, color = "text-rose-500" }: { label: string, color?: string }) => (
    <div className={`bg-slate-950 px-4 py-3 text-[10px] font-black ${color} uppercase tracking-[0.3em] border-y border-slate-800/50 mt-4`}>
      {label}
    </div>
  );

  return (
    <div className="animate-fade-in space-y-8 pb-24">
      <header className="flex flex-col md:flex-row justify-between items-end gap-6">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight uppercase">DRE Detalhado</h2>
          <p className="text-slate-500 text-sm font-medium uppercase tracking-widest">Analítico de resultados</p>
        </div>

        <div className="flex flex-wrap gap-4 items-center">
          <button 
            onClick={handleGenerateAnalysis}
            disabled={analyzing}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2"
          >
            {analyzing ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Analisando...
              </span>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v10"/><path d="M18.4 4.6a9 9 0 1 1-12.8 0"/><path d="M12 12 8 16"/><path d="M12 12l4 4"/></svg>
                Análise Inteligente IA
              </>
            )}
          </button>

          <div className="flex gap-2 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 shadow-2xl">
            <select 
              value={selectedMonth} 
              onChange={e => setSelectedMonth(parseInt(e.target.value))}
              className="bg-slate-950 text-slate-300 text-[10px] font-black uppercase p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-rose-500 border border-slate-800 cursor-pointer"
            >
              {months.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select 
              value={selectedYear} 
              onChange={e => setSelectedYear(parseInt(e.target.value))}
              className="bg-slate-950 text-slate-300 text-[10px] font-black uppercase p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-rose-500 border border-slate-800 cursor-pointer"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </header>

      <div className="bg-slate-900 rounded-[2rem] shadow-2xl border border-slate-800 overflow-hidden">
        <div className="flex bg-slate-950/80 px-4 py-4 border-b border-slate-800 text-[9px] font-black text-slate-500 uppercase tracking-widest">
          <div className="flex-1">Resultados detalhados</div>
          <div className="w-32 text-right">Valor (R$)</div>
          <div className="w-24 text-right">Análise %</div>
        </div>

        <div className="divide-y divide-slate-800/20">
          <Row label="FATURAMENTO BRUTO" value={data.faturamentoBruto} isBold color="text-emerald-400" forceVisible />
          {data.faturamentoBrutoDetails.map(acc => (
            <Row key={acc.name} label={acc.name} value={acc.value} isSub />
          ))}

          <Row label="(-) IMPOSTOS SOBRE VENDAS" value={data.impostos} isBold color="text-rose-400" />
          {data.impostosDetails.map(acc => (
            <Row key={acc.name} label={acc.name} value={acc.value} isSub />
          ))}

          <Row label="(=) FATURAMENTO LÍQUIDO" value={data.faturamentoLiquido} isBold />

          <Row label="(-) DESPESAS VARIÁVEIS DE VENDAS" value={data.variaveisVendas} isBold color="text-amber-500" />
          {data.variaveisVendasDetails.map(acc => (
            <Row key={acc.name} label={acc.name} value={acc.value} isSub />
          ))}

          <SectionTitle label="CMV (Custo Mercadoria Vendida)" />
          <Row label="Estoque Inicial (+)" value={data.estoqueInicial} isSub forceVisible={data.estoqueInicial > 0} />
          <Row label="Compras (+)" value={data.compras} isSub forceVisible={data.compras > 0} />
          {data.comprasDetails.map(acc => (
            <Row key={acc.name} label={acc.name} value={acc.value} isSub className="opacity-60 pl-12" />
          ))}
          <Row label="Estoque Final (-)" value={-data.estoqueFinal} isSub forceVisible={data.estoqueFinal > 0} />
          <Row label="(=) CMV TOTAL" value={data.cmv} isBold color="text-rose-400" />

          <Row label="(=) LUCRO BRUTO (MARGEM CONTRIBUIÇÃO)" value={data.lucroBruto} isBold color="text-emerald-400" forceVisible />

          <SectionTitle label="(-) Despesas Fixas Operacionais" />
          <Row label="(-) DESPESA COM PESSOAL" value={data.pessoal} isBold color="text-rose-400" />
          {data.pessoalDetails.map(acc => (
            <Row key={acc.name} label={acc.name} value={acc.value} isSub />
          ))}

          <Row label="(-) DESPESAS ADMINISTRATIVAS" value={data.admin} isBold color="text-rose-400" />
          {data.adminDetails.map(acc => (
            <Row key={acc.name} label={acc.name} value={acc.value} isSub />
          ))}

          <Row label="(-) DESPESAS DE OCUPAÇÃO" value={data.ocupacao} isBold color="text-rose-400" />
          {data.ocupacaoDetails.map(acc => (
            <Row key={acc.name} label={acc.name} value={acc.value} isSub />
          ))}

          <Row label="(=) TOTAL DESPESAS FIXAS" value={data.totalDespesasFixas} isBold color="text-rose-500" />
          
          <Row label="(=) LUCRO OPERACIONAL" value={data.lucroOperacional} isBold color={data.lucroOperacional >= 0 ? "text-emerald-400" : "text-rose-500"} forceVisible />

          <SectionTitle label="(-) Resultado Financeiro" />
          <Row label="(-) DESPESAS FINANCEIRAS" value={data.despesasFinanceiras} isBold color="text-rose-400" />
          {data.despesasFinanceirasDetails.map(acc => (
            <Row key={acc.name} label={acc.name} value={acc.value} isSub />
          ))}

          <Row label="(=) RESULTADO LÍQUIDO" value={data.resultadoLiquido} isBold color={data.resultadoLiquido >= 0 ? "text-emerald-400" : "text-rose-500"} forceVisible />

          <SectionTitle label="Entradas/Saídas Não Operacionais e Investimentos" color="text-blue-500" />
          <Row label="(+) OUTRAS ENTRADAS" value={data.outrasEntradas} isBold color="text-emerald-400" />
          {data.outrasEntradasDetails.map(acc => (
            <Row key={acc.name} label={acc.name} value={acc.value} isSub />
          ))}

          <Row label="(-) SAÍDAS NÃO OPERACIONAIS" value={data.saidasNaoOperacionais} isBold color="text-rose-400" />
          {data.saidasNaoOperacionaisDetails.map(acc => (
            <Row key={acc.name} label={acc.name} value={acc.value} isSub />
          ))}

          <Row label="(-) INVESTIMENTOS" value={data.investimentos} isBold color="text-amber-500" />
          {data.investimentosDetails.map(acc => (
            <Row key={acc.name} label={acc.name} value={acc.value} isSub />
          ))}

          <div className={`p-8 ${data.resultadoAposAmortizacao >= 0 ? 'bg-emerald-500/10 border-t border-emerald-500/30' : 'bg-rose-500/10 border-t border-rose-500/30'} flex flex-col md:flex-row justify-between items-center gap-6`}>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-1">Resultado Final do Período</p>
              <h4 className={`text-4xl font-black ${data.resultadoAposAmortizacao >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                R$ {formatCurrency(data.resultadoAposAmortizacao)}
              </h4>
            </div>
            <span className={`px-8 py-3 rounded-full text-[11px] font-black uppercase tracking-[0.2em] shadow-2xl ${data.resultadoAposAmortizacao >= 0 ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white animate-pulse'}`}>
              {data.resultadoAposAmortizacao >= 0 ? 'SUPERÁVIT' : 'DÉFICIT'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
