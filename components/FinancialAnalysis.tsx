
import React from 'react';
import { FinancialAnalysisData } from '../services/geminiService';

interface Props {
  data: FinancialAnalysisData;
  period: string;
  onBack: () => void;
}

export const FinancialAnalysis: React.FC<Props> = ({ data, period, onBack }) => {
  const getStatusClasses = (status: string) => {
    switch (status) {
      case 'success': 
        return 'border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.15)]';
      case 'warning': 
        return 'border-amber-500 bg-amber-500/10 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.15)]';
      case 'danger': 
        return 'border-rose-500 bg-rose-500/10 text-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.15)]';
      default: 
        return 'border-slate-800 bg-slate-900 text-slate-400';
    }
  };

  const getBadgeClasses = (status: string) => {
    switch (status) {
      case 'success': return 'bg-emerald-500 text-slate-950';
      case 'warning': return 'bg-amber-500 text-slate-950';
      case 'danger': return 'bg-rose-500 text-white';
      default: return 'bg-slate-700 text-white';
    }
  };

  const cleanBreakEven = data.stability.breakEven.replace(/\(.*\)/g, '').trim();

  const handleExportHTML = () => {
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Diagnóstico Financeiro - ${period}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          body { background-color: #020617; color: #f1f5f9; font-family: sans-serif; }
          .card { background-color: #0f172a; border: 1px solid #1e293b; border-radius: 1.5rem; padding: 2rem; margin-bottom: 2rem; }
        </style>
      </head>
      <body class="p-8 max-w-4xl mx-auto">
        <div class="flex justify-between items-center mb-12 border-b border-slate-800 pb-8">
          <div>
            <h1 class="text-4xl font-black text-white tracking-tighter uppercase">Diagnóstico de Saúde</h1>
            <p class="text-slate-500 text-[10px] font-bold uppercase tracking-[0.4em] mt-2">ProfitFood by Planegi • ${period}</p>
          </div>
          <div class="text-right">
            <p class="text-[10px] font-black text-slate-500 uppercase">Score Geral</p>
            <p class="text-4xl font-black text-white">${data.healthScore}/100</p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div class="card">
            <p class="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">Ponto de Equilíbrio</p>
            <p class="text-3xl font-black text-white">${cleanBreakEven}</p>
          </div>
          <div class="card">
            <p class="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2">Margem de Segurança</p>
            <p class="text-3xl font-black text-white">${data.stability.safetyMargin}</p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          ${data.kpis.map(kpi => `
            <div class="p-6 rounded-3xl border ${
              kpi.status === 'success' ? 'border-emerald-500 bg-emerald-500/5 text-emerald-400' : 
              kpi.status === 'warning' ? 'border-amber-500 bg-amber-500/5 text-amber-400' : 
              'border-rose-500 bg-rose-500/5 text-rose-400'
            }">
              <p class="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1">${kpi.label}</p>
              <h3 class="text-2xl font-black mb-1">${kpi.value}</h3>
              <p class="text-[9px] font-bold italic opacity-70 mb-3">Referência: ${kpi.benchmark}</p>
              <p class="text-[10px] leading-tight font-medium opacity-90">${kpi.description}</p>
            </div>
          `).join('')}
        </div>

        <div class="card">
          <h2 class="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em] mb-6">Parecer Consultivo Especializado</h2>
          <p class="text-slate-300 leading-relaxed whitespace-pre-line italic">${data.summary}</p>
        </div>

        <div class="card">
          <h2 class="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-6">Plano de Ação Sugerido</h2>
          <div class="space-y-4">
            ${data.recommendations.map((rec, i) => `
              <div class="flex gap-4">
                <span class="font-black text-emerald-500">${i + 1}.</span>
                <p class="text-slate-400 text-sm">${rec}</p>
              </div>
            `).join('')}
          </div>
        </div>

        ${data.criticalAlerts.length > 0 ? `
          <div class="card border-rose-500/30 bg-rose-500/5">
            <h2 class="text-[10px] font-black text-rose-500 uppercase tracking-[0.3em] mb-6">Alertas Críticos</h2>
            <div class="space-y-3">
              ${data.criticalAlerts.map(alert => `
                <p class="text-xs font-bold text-rose-200">• ${alert}</p>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <footer class="text-center opacity-40 py-10 border-t border-slate-800 mt-12">
          <p class="text-[8px] font-black uppercase tracking-[0.5em] text-slate-600">
            ProfitFood Management System &copy; 2026
          </p>
        </footer>
      </body>
      </html>
    `;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagnostico_profitfood_${period.replace(/ /g, '_')}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="animate-fade-in space-y-8 pb-24 max-w-6xl mx-auto">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 print:hidden">
        <div>
          <button 
            onClick={onBack}
            className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 hover:text-rose-500 transition-colors mb-4 cursor-pointer relative z-10"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            Voltar para o DRE
          </button>
          <div className="flex items-center gap-4 mb-2">
            <div className="w-10 h-10 text-rose-500">
               <svg viewBox="0 0 100 100" className="w-full h-full fill-current">
                 <path d="M20,10 L70,10 C85,10 95,25 95,40 C95,55 85,70 70,70 L40,70 L40,95 L20,95 L20,10 Z M40,30 L40,50 L70,50 C75,50 80,45 80,40 C80,35 75,30 70,30 L40,30 Z" />
               </svg>
            </div>
            <h2 className="text-4xl font-black text-white tracking-tighter uppercase leading-none">Diagnóstico de Saúde</h2>
          </div>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.4em]">ProfitFood by Planegi • {period}</p>
        </div>

        <div className="bg-slate-900/50 p-6 rounded-[2rem] border border-slate-800 shadow-2xl flex items-center gap-6">
          <div className="text-right">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Score Geral</p>
            <p className="text-2xl font-black text-white tracking-tighter">{data.healthScore}/100</p>
          </div>
          <div className="relative w-14 h-14 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
              <circle cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-slate-800" />
              <circle 
                cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="4" fill="transparent" 
                className={data.healthScore > 70 ? 'text-emerald-500' : data.healthScore > 40 ? 'text-amber-500' : 'text-rose-500'}
                strokeDasharray={2 * Math.PI * 24}
                strokeDashoffset={2 * Math.PI * 24 * (1 - data.healthScore / 100)}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 1.5s ease-out' }}
              />
            </svg>
          </div>
        </div>
      </header>

      {/* Título Visível Apenas no PDF/Impressão */}
      <div className="hidden print:block mb-8 border-b-2 border-slate-800 pb-6 text-center">
        <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-2">Relatório de Saúde Financeira</h1>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">ProfitFood Management System • {period}</p>
      </div>

      {/* 1º BLOCO: MÉTRICAS DE ESTABILIDADE (FÓRMULAS BLOCO 6 DO PDF) */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900 p-8 rounded-[2.5rem] border border-slate-800 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-5 text-blue-500 print:hidden">
            <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
          </div>
          <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">Ponto de Equilíbrio (R$)</p>
          <h3 className="text-4xl font-black text-white mb-2">{cleanBreakEven}</h3>
          <p className="text-xs text-slate-500 font-medium leading-relaxed italic">
            "Termômetro da viabilidade: quanto você precisa vender para não ter prejuízo."
          </p>
        </div>

        <div className={`p-8 rounded-[2.5rem] border transition-all duration-500 shadow-2xl relative overflow-hidden group ${getStatusClasses(data.stability.safetyMarginStatus)}`}>
          <div className="absolute top-0 right-0 p-8 opacity-10 print:hidden">
            <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
          </div>
          <div className="flex justify-between items-start mb-2">
             <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Margem de Segurança (%)</p>
             <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase shadow-lg ${getBadgeClasses(data.stability.safetyMarginStatus)}`}>
                {data.stability.safetyMarginStatus === 'success' ? 'Operação Segura' : data.stability.safetyMarginStatus === 'warning' ? 'Atenção' : 'Risco Alto'}
             </span>
          </div>
          <h3 className="text-4xl font-black mb-2">{data.stability.safetyMargin}</h3>
          <p className="text-xs font-medium leading-relaxed opacity-80 italic">
            "Sua gordura financeira antes de atingir a linha de risco."
          </p>
        </div>
      </section>

      {/* 2º BLOCO: KPIs OPERACIONAIS (BENCHMARKS DO BLOCO 7 DO PDF) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {data.kpis.map((kpi, idx) => (
          <div key={idx} className={`p-6 rounded-3xl border transition-all duration-300 shadow-xl ${getStatusClasses(kpi.status)}`}>
            <p className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1">{kpi.label}</p>
            <h3 className="text-2xl font-black mb-1">{kpi.value}</h3>
            <p className="text-[9px] font-bold italic opacity-70 mb-3 underline decoration-dotted">Referência: {kpi.benchmark}</p>
            <p className="text-[10px] leading-tight font-medium opacity-90">{kpi.description}</p>
          </div>
        ))}
      </div>

      {/* 3º BLOCO: PARECER CONSULTIVO ESPECIALIZADO (CONTEÚDO IA) */}
      <section className="bg-slate-900/40 backdrop-blur-xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-800">
        <div className="px-10 py-6 border-b border-slate-800 bg-slate-950/40 flex justify-between items-center print:bg-slate-100">
          <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em]">
            Parecer Consultivo Especializado
          </h3>
          <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Baseado em Hipóteses Plausíveis</span>
        </div>
        <div className="p-10 lg:p-14">
          <div className="prose prose-invert max-w-none">
            <p className="text-slate-300 leading-[1.8] text-base font-medium whitespace-pre-line text-justify italic print:text-slate-800">
              {data.summary}
            </p>
          </div>
        </div>
      </section>

      {/* 4º BLOCO: PLANO DE AÇÃO (ESTRATÉGIA 30/60/90 DIAS) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-slate-900/50 p-8 rounded-[2.5rem] border border-slate-800 shadow-2xl">
            <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-6 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Plano de Ação Sugerido (30/60/90 Dias)
            </h3>
            <div className="space-y-4">
              {data.recommendations.map((rec, i) => (
                <div key={i} className="flex gap-4 items-start group">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-500 flex items-center justify-center font-black text-xs shrink-0 border border-emerald-500/20">
                    {i + 1}
                  </div>
                  <p className="text-sm text-slate-400 font-medium group-hover:text-slate-200 transition-colors print:text-slate-800">{rec}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-8">
          {data.criticalAlerts.length > 0 && (
            <section className="bg-rose-500/5 p-8 rounded-[2.5rem] border border-rose-500/30 shadow-2xl">
              <h3 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.3em] mb-6 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse print:animate-none"></span>
                Alertas Críticos
              </h3>
              <div className="space-y-4">
                {data.criticalAlerts.map((alert, i) => (
                  <div key={i} className="p-4 bg-rose-500/10 rounded-2xl border border-rose-500/20 flex gap-3">
                    <svg className="text-rose-500 shrink-0" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                    <p className="text-xs font-bold text-rose-200 print:text-rose-900">{alert}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="bg-slate-900/80 p-8 rounded-[2rem] border border-slate-800 text-center shadow-2xl relative print:hidden">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-4">Relatório Executivo</p>
            <button 
              type="button"
              onClick={handleExportHTML}
              className="w-full py-4 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border border-rose-500 shadow-xl cursor-pointer active:scale-95 relative z-[100]"
            >
              Gerar Diagnóstico Completo
            </button>
            <p className="text-[8px] text-slate-600 mt-4 font-bold uppercase tracking-widest">ProfitFood by Planegi — Inteligência financeira para bares e restaurantes.</p>
          </div>
        </div>
      </div>
      
      <footer className="text-center opacity-40 py-10">
          <p className="text-[8px] font-black uppercase tracking-[0.5em] text-slate-600">
            As análises baseiam-se exclusivamente nos dados financeiros informados.
          </p>
      </footer>

      <style>{`
        @media print {
          header, footer, nav, .print\\:hidden, button { 
            display: none !important; 
          }
          
          body { 
            background: white !important; 
            color: #0f172a !important; 
          }
          
          #root { background: white !important; }

          .bg-slate-900, .bg-slate-950, .bg-slate-900\\/40, .bg-slate-900\\/50 {
            background-color: #f8fafc !important;
            border-color: #e2e8f0 !important;
            color: #0f172a !important;
          }

          .text-white, .text-slate-300, .text-slate-200 {
            color: #0f172a !important;
          }

          .text-slate-500, .text-slate-400, .text-slate-600 {
            color: #475569 !important;
          }

          .shadow-2xl, .shadow-xl, .shadow-lg {
            box-shadow: none !important;
            border: 1px solid #e2e8f0 !important;
          }

          div, section {
            background-image: none !important;
          }

          section, .grid > div {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
};
