
import React, { useState } from 'react';
import { getFinancialAdvice } from '../services/geminiService';
import { Transaction, Category } from '../types';

interface Props {
  transactions: Transaction[];
  categories: Category[];
}

export const AIConsultant: React.FC<Props> = ({ transactions, categories }) => {
  const [advice, setAdvice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGetAdvice = async () => {
    if (transactions.length < 3) {
      alert("Adicione pelo menos 3 transações para uma análise precisa.");
      return;
    }
    setLoading(true);
    const result = await getFinancialAdvice(transactions, categories);
    setAdvice(result || "Nenhum conselho disponível.");
    setLoading(false);
  };

  return (
    <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-6 rounded-2xl shadow-xl text-white mb-8">
      <div className="flex items-center gap-3 mb-4">
        <div className="bg-white/20 p-2 rounded-lg">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
        </div>
        <h3 className="text-xl font-bold">Consultor IA</h3>
      </div>
      
      {advice ? (
        <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 animate-fade-in">
          <p className="text-sm leading-relaxed whitespace-pre-line">{advice}</p>
          <button 
            onClick={() => setAdvice(null)}
            className="mt-4 text-xs font-semibold uppercase tracking-wider opacity-70 hover:opacity-100 transition-opacity"
          >
            Fechar Análise
          </button>
        </div>
      ) : (
        <div>
          <p className="text-indigo-100 mb-4 opacity-90">Deixe que nossa inteligência artificial analise seus padrões de gastos e te dê dicas personalizadas para economizar.</p>
          <button
            onClick={handleGetAdvice}
            disabled={loading}
            className="bg-white text-indigo-600 font-bold px-6 py-2 rounded-full hover:bg-indigo-50 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Analisando...
              </>
            ) : (
              'Analisar Meus Gastos'
            )}
          </button>
        </div>
      )}
    </div>
  );
};
