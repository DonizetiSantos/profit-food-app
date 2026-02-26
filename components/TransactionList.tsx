
import React from 'react';
import { Transaction, Category, TransactionType } from '../types';

interface Props {
  transactions: Transaction[];
  categories: Category[];
  onDeleteTransaction: (id: string) => void;
}

export const TransactionList: React.FC<Props> = ({ transactions, categories, onDeleteTransaction }) => {
  const sortedTransactions = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (transactions.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-300">
        <p className="text-gray-400">Nenhuma transação registrada ainda.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 border-b border-gray-50 bg-gray-50/50">
        <h3 className="font-semibold text-gray-800">Histórico de Atividades</h3>
      </div>
      <div className="divide-y divide-gray-50">
        {sortedTransactions.map((t) => {
          const category = categories.find(c => c.id === t.categoryId);
          return (
            <div key={t.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors group">
              <div className="flex items-center gap-4">
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xl shadow-sm"
                  style={{ backgroundColor: `${category?.color}15` }}
                >
                  {category?.icon || '❓'}
                </div>
                <div>
                  <p className="font-medium text-gray-900">{t.description}</p>
                  <div className="flex gap-2 items-center">
                    <span className="text-xs text-gray-500">{new Date(t.date).toLocaleDateString('pt-BR')}</span>
                    <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                    <span className="text-xs font-medium" style={{ color: category?.color }}>{category?.name}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <p className={`font-semibold ${t.type === TransactionType.INCOME ? 'text-green-600' : 'text-red-600'}`}>
                  {t.type === TransactionType.INCOME ? '+' : '-'} 
                  {t.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
                <button
                  onClick={() => onDeleteTransaction(t.id)}
                  className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-red-500 transition-all rounded-lg"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
