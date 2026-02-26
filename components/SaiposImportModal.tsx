import React, { useState, useRef } from 'react';
import { Bank, PaymentMethod } from '../types';
import { saiposImportService, SaiposImportPreviewItem } from '../services/saiposImportService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  banks: Bank[];
  paymentMethods: PaymentMethod[];
  onSuccess: () => void;
}

export const SaiposImportModal: React.FC<Props> = ({ isOpen, onClose, banks, paymentMethods, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [previewItems, setPreviewItems] = useState<SaiposImportPreviewItem[]>([]);
  const [fileHash, setFileHash] = useState('');
  const [fromDate, setFromDate] = useState<string | undefined>();
  const [toDate, setToDate] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setLoading(true);
    try {
      const preview = await saiposImportService.preparePreview(selectedFile);
      setFile(selectedFile);
      setPreviewItems(preview.items);
      setFileHash(preview.fileHash);
      setFromDate(preview.fromDate);
      setToDate(preview.toDate);
    } catch (err: any) {
      alert(err.message || 'Erro ao ler arquivo de fechamento.');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateItem = (index: number, updates: Partial<SaiposImportPreviewItem>) => {
    const newItems = [...previewItems];
    newItems[index] = { ...newItems[index], ...updates };
    setPreviewItems(newItems);
  };

  const handleConfirm = async () => {
    if (!file || !fileHash) return;

    setImporting(true);
    try {
      const caixaEmpresa = banks.find(b => b.name.toUpperCase().includes('CAIXA EMPRESA'))?.id;
      
      await saiposImportService.executeImport(
        fileHash,
        file.name,
        previewItems,
        fromDate,
        toDate,
        caixaEmpresa
      );

      alert('Importação concluída com sucesso!');
      onSuccess();
      onClose();
      reset();
    } catch (err: any) {
      alert(err.message || 'Erro ao processar importação.');
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreviewItems([]);
    setFileHash('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 w-full max-w-5xl max-h-[90vh] rounded-[2.5rem] border border-slate-800 shadow-2xl flex flex-col overflow-hidden">
        <header className="p-8 border-b border-slate-800 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-2xl font-black text-white uppercase tracking-tight">Importar Fechamento (PDV)</h2>
            <p className="text-slate-500 text-xs font-medium uppercase tracking-widest mt-1">Sincronize suas vendas diárias do PDV.</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {!file ? (
            <label className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-slate-800 rounded-[2rem] bg-slate-950/50 cursor-pointer hover:border-rose-500/50 transition-all group">
              <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mb-6 border border-slate-800 group-hover:border-rose-500/30 transition-all">
                <svg className="text-rose-500" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
              </div>
              <h3 className="text-lg font-black text-white uppercase tracking-tight mb-2">Selecione o arquivo .xlsx</h3>
              <p className="text-slate-500 text-sm mb-8 max-w-xs text-center font-medium">O arquivo deve conter o relatório de vendas por forma de pagamento exportado do seu sistema.</p>
              <input 
                type="file" 
                accept=".xlsx" 
                ref={fileInputRef}
                onChange={handleFileChange} 
                className="hidden" 
                disabled={loading}
              />
              <div 
                className={`bg-rose-600 group-hover:bg-rose-500 text-white px-10 py-4 rounded-2xl font-black uppercase tracking-widest transition-all shadow-xl shadow-rose-950/50 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {loading ? 'Lendo Arquivo...' : 'Escolher Arquivo'}
              </div>
            </label>
          ) : (
            <div className="space-y-8">
              <div className="flex justify-between items-center bg-slate-950 p-6 rounded-2xl border border-slate-800">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20">
                    <svg className="text-emerald-500" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="m9 15 3 3 3-3"/></svg>
                  </div>
                  <div>
                    <p className="text-white font-black text-sm uppercase">{file.name}</p>
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Período: {fromDate ? new Date(fromDate).toLocaleDateString('pt-BR') : '?'} até {toDate ? new Date(toDate).toLocaleDateString('pt-BR') : '?'}</p>
                  </div>
                </div>
                <button onClick={reset} className="text-rose-500 text-[10px] font-black uppercase tracking-widest hover:underline">Trocar Arquivo</button>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-800">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950 text-slate-500 text-[9px] font-black uppercase tracking-[0.2em] border-b border-slate-800">
                      <th className="px-6 py-4">Data</th>
                      <th className="px-6 py-4">Forma (PDV)</th>
                      <th className="px-6 py-4">Valor</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Banco Destino</th>
                      <th className="px-6 py-4">Mapeamento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {previewItems.map((item, index) => (
                      <tr key={index} className="hover:bg-slate-800/20 transition-colors">
                        <td className="px-6 py-4 text-[10px] font-bold text-slate-400">{new Date(item.date).toLocaleDateString('pt-BR')}</td>
                        <td className="px-6 py-4">
                          <span className="text-[10px] font-black text-slate-200 uppercase">{item.paymentLabel}</span>
                        </td>
                        <td className="px-6 py-4 text-[10px] font-black text-emerald-400">R$ {item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="px-6 py-4">
                          <select 
                            value={item.suggestedStatus}
                            onChange={e => handleUpdateItem(index, { suggestedStatus: e.target.value as any })}
                            className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[9px] font-black text-slate-300 outline-none focus:border-rose-500"
                          >
                            <option value="LIQUIDADO">LIQUIDADO</option>
                            <option value="PROVISIONADO">PROVISIONADO</option>
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <select 
                            value={item.suggestedBankId || ''}
                            onChange={e => handleUpdateItem(index, { suggestedBankId: e.target.value })}
                            disabled={item.suggestedStatus === 'PROVISIONADO'}
                            className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[9px] font-black text-slate-300 outline-none focus:border-rose-500 disabled:opacity-30"
                          >
                            <option value="">Nenhum</option>
                            {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <select 
                            value={item.suggestedMethodId || ''}
                            onChange={e => handleUpdateItem(index, { suggestedMethodId: e.target.value })}
                            className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[9px] font-black text-slate-300 outline-none focus:border-rose-500"
                          >
                            <option value="">Mapear para...</option>
                            {paymentMethods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <footer className="p-8 border-t border-slate-800 flex justify-end gap-4 shrink-0">
          <button onClick={onClose} className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-all">Cancelar</button>
          {file && (
            <button 
              onClick={handleConfirm}
              disabled={importing}
              className="px-10 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-emerald-950/50 disabled:opacity-50"
            >
              {importing ? 'Processando...' : 'Confirmar Importação'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};
