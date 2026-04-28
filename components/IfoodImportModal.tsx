import React, { useRef, useState } from 'react';
import { ifoodImportService, IfoodImportPreview } from '../services/ifoodImportService';
import { useActiveCompany } from '../src/contexts/CompanyContext';

interface Props {
  isOpen: boolean;
  bankId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const IfoodImportModal: React.FC<Props> = ({ isOpen, bankId, onClose, onSuccess }) => {
  const { activeCompany } = useActiveCompany();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<IfoodImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile || !activeCompany) return;

    setLoading(true);
    try {
      const previewData = await ifoodImportService.preparePreview(selectedFile, activeCompany.id);
      setFile(selectedFile);
      setPreview(previewData);
    } catch (err: any) {
      alert(err.message || 'Erro ao ler o arquivo CSV do iFood.');
      reset();
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview || !activeCompany) return;

    if (!bankId) {
      alert('Selecione o banco/conta antes de confirmar a importação do iFood.');
      return;
    }

    setImporting(true);
    try {
      await ifoodImportService.executeImport(preview, activeCompany.id, bankId);
      alert('Importação iFood concluída com sucesso. As movimentações foram criadas para conciliação bancária, sem gerar DRE nesta etapa.');
      onSuccess();
      onClose();
      reset();
    } catch (err: any) {
      alert(err.message || 'Erro ao importar o CSV do iFood.');
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (importing) return;
    onClose();
    reset();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 w-full max-w-5xl max-h-[90vh] rounded-[2.5rem] border border-slate-800 shadow-2xl flex flex-col overflow-hidden">
        <header className="p-8 border-b border-slate-800 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-2xl font-black text-white uppercase tracking-tight">Importar CSV iFood</h2>
            <p className="text-slate-500 text-xs font-medium uppercase tracking-widest mt-1">
              Fluxo de caixa realizado. Não gera DRE nesta etapa.
            </p>
          </div>
          <button onClick={handleClose} className="text-slate-500 hover:text-white transition-colors" disabled={importing}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {!file ? (
            <label className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-slate-800 rounded-[2rem] bg-slate-950/50 cursor-pointer hover:border-emerald-500/50 transition-all group">
              <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mb-6 border border-slate-800 group-hover:border-emerald-500/30 transition-all">
                <svg className="text-emerald-500" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
              </div>
              <h3 className="text-lg font-black text-white uppercase tracking-tight mb-2">Selecione o CSV do iFood</h3>
              <p className="text-slate-500 text-sm mb-8 max-w-md text-center font-medium">
                O arquivo deve conter as colunas: data da transação, descrição, valor e categoria.
              </p>
              <input
                type="file"
                accept=".csv,text/csv"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                disabled={loading}
              />
              <div className={`bg-emerald-600 group-hover:bg-emerald-500 text-white px-10 py-4 rounded-2xl font-black uppercase tracking-widest transition-all shadow-xl shadow-emerald-950/50 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                {loading ? 'Lendo CSV...' : 'Escolher CSV'}
              </div>
            </label>
          ) : (
            <div className="space-y-8">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">Regra estrutural ativa</p>
                <p className="text-xs text-emerald-100 leading-relaxed mt-2">
                  CSV iFood entra como <strong>fluxo de caixa realizado</strong>. Nesta etapa o sistema grava o controle em <strong>ifood_imports</strong> e <strong>ifood_import_items</strong> e cria as movimentações em <strong>bank_transactions</strong> para conciliação. Nenhum lançamento automático em DRE é criado.
                </p>
              </div>

              {preview && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Arquivo</p>
                    <p className="text-sm font-black text-white mt-2 truncate">{preview.fileName}</p>
                  </div>
                  <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Linhas</p>
                    <p className="text-2xl font-black text-white mt-2">{preview.totalRows}</p>
                  </div>
                  <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total CSV</p>
                    <p className="text-2xl font-black text-emerald-400 mt-2">
                      R$ {preview.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto rounded-2xl border border-slate-800">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950 text-slate-500 text-[9px] font-black uppercase tracking-[0.2em] border-b border-slate-800">
                      <th className="px-6 py-4">Data</th>
                      <th className="px-6 py-4">Descrição</th>
                      <th className="px-6 py-4">Categoria</th>
                      <th className="px-6 py-4 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {preview?.rows.map((row, index) => (
                      <tr key={`${row.transactionDate}-${row.description}-${index}`} className="hover:bg-slate-800/20 transition-colors">
                        <td className="px-6 py-4 text-[10px] font-black text-slate-300">{row.transactionDate}</td>
                        <td className="px-6 py-4 text-[10px] font-black text-slate-200 uppercase">{row.description}</td>
                        <td className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">{row.category || '-'}</td>
                        <td className="px-6 py-4 text-[10px] font-black text-emerald-400 text-right">
                          R$ {row.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
          <button onClick={handleClose} className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-all" disabled={importing}>
            Cancelar
          </button>
          {file && (
            <button
              onClick={handleConfirm}
              disabled={importing || !preview}
              className="px-10 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-emerald-950/50 disabled:opacity-50"
            >
              {importing ? 'Gravando...' : 'Confirmar Importação'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};
