
import React, { useState, useEffect } from 'react';
import { Account, Bank, PaymentMethod, Entity, FinancialPosting, MainGroup, XmlItem, XmlMapping } from '../types';
import { parseNfeXml, normalizeProductName, NfeData } from '../services/xmlParser';
import { favoredService } from '../services/favoredService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  banks: Bank[];
  paymentMethods: PaymentMethod[];
  entities: Entity[];
  xmlMappings: XmlMapping[];
  onSaveMappings: (mappings: XmlMapping[]) => void;
  onAddPostings: (postings: Omit<FinancialPosting, 'id'>[]) => void;
  onAddEntity?: (entity: Entity) => void;
}

export const XmlImportModal: React.FC<Props> = ({
  isOpen, onClose, accounts, banks, paymentMethods, entities, xmlMappings, onSaveMappings, onAddPostings, onAddEntity
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [nfeData, setNfeData] = useState<NfeData | null>(null);
  const [itemMappings, setItemMappings] = useState<Record<number, string>>({});
  const [saveNewMappings, setSaveNewMappings] = useState<Record<number, boolean>>({});
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Settings for launch
  const [status, setStatus] = useState<'LIQUIDADO' | 'PROVISIONADO'>('PROVISIONADO');
  const [competenceDate, setCompetenceDate] = useState('');
  const [occurrenceDate, setOccurrenceDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [liquidationDate, setLiquidationDate] = useState('');
  const [selectedBank, setSelectedBank] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('');

  useEffect(() => {
    if (nfeData) {
      setCompetenceDate(nfeData.issueDate);
      setOccurrenceDate(nfeData.issueDate);
      setDueDate(nfeData.issueDate);
      setLiquidationDate(nfeData.issueDate);
      
      // Auto-mapping
      const initialMappings: Record<number, string> = {};
      const initialSave: Record<number, boolean> = {};
      
      nfeData.items.forEach((item, index) => {
        const normalized = normalizeProductName(item.xProd);
        
        // Find mapping
        const mapping = xmlMappings.find(m => 
          (item.gtin && m.matchType === 'GTIN' && m.matchKey === item.gtin) ||
          (m.supplierCnpj === nfeData.supplierCnpj && m.matchType === 'SUPPLIER_CODE' && m.matchKey === item.cProd) ||
          (m.supplierCnpj === nfeData.supplierCnpj && m.matchType === 'NAME_NORMALIZED' && m.matchKey === normalized)
        );
        
        if (mapping) {
          initialMappings[index] = mapping.accountId;
          initialSave[index] = false; // Already saved
        } else {
          initialMappings[index] = '';
          initialSave[index] = true; // Default ON for new ones
        }
      });
      
      setItemMappings(initialMappings);
      setSaveNewMappings(initialSave);
    }
  }, [nfeData, xmlMappings]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const text = await selectedFile.text();
      try {
        const data = parseNfeXml(text);
        setNfeData(data);
        setFile(selectedFile);
      } catch (err) {
        alert("Erro ao processar XML. Verifique se é uma NF-e válida.");
      }
    }
  };

  const handleConfirm = async () => {
    if (!nfeData) return;
    
    // Check if all items are mapped
    const unmapped = nfeData.items.some((_, i) => !itemMappings[i]);
    if (unmapped) {
      alert("Por favor, mapeie todos os itens para uma conta do plano.");
      return;
    }

    if (status === 'LIQUIDADO' && !selectedBank) {
      alert("Para registros liquidados, selecione um banco.");
      return;
    }

    setIsProcessing(true);
    try {
      // 1. Find or create entity
      let entityId = '';
      
      // Try by CNPJ first
      if (nfeData.supplierCnpj && nfeData.supplierCnpj.replace(/\D/g, "").length === 14) {
        const favored = await favoredService.getOrCreateFavoredByCnpj(nfeData.supplierCnpj, nfeData.supplierName);
        if (favored) {
          entityId = favored.id;
          // If it's a new one, we should notify the parent to update the list
          const existsLocally = entities.some(e => e.id === favored.id);
          if (!existsLocally && onAddEntity) {
            onAddEntity(favored);
          }
        }
      }

      // If still no entity, use manual selection or fallback
      if (!entityId) {
        if (selectedEntityId) {
          entityId = selectedEntityId;
        } else {
          // Final fallback by name (legacy)
          entityId = entities.find(e => e.name.includes(nfeData.supplierName) || e.name === nfeData.supplierName)?.id || '';
        }
      }

      if (!entityId) {
        alert("Não foi possível identificar ou criar o fornecedor. Por favor, selecione um manualmente.");
        setIsProcessing(false);
        return;
      }

      // 2. Save new mappings
      const newMappings: XmlMapping[] = [];
      nfeData.items.forEach((item, index) => {
        if (saveNewMappings[index]) {
          const normalized = normalizeProductName(item.xProd);
          
          // Priority for new mapping
          let matchType: XmlMapping['matchType'] = 'NAME_NORMALIZED';
          let matchKey = normalized;
          
          if (item.gtin) {
            matchType = 'GTIN';
            matchKey = item.gtin;
          } else if (item.cProd) {
            matchType = 'SUPPLIER_CODE';
            matchKey = item.cProd;
          }

          newMappings.push({
            id: crypto.randomUUID(),
            supplierCnpj: nfeData.supplierCnpj,
            matchType,
            matchKey,
            accountId: itemMappings[index],
            updatedAt: new Date().toISOString()
          });
        }
      });
      
      if (newMappings.length > 0) {
        onSaveMappings(newMappings);
      }

      // 3. Create postings (Grouped by account)
      const groupedByAccount: Record<string, number> = {};
      nfeData.items.forEach((item, index) => {
        const accId = itemMappings[index];
        groupedByAccount[accId] = (groupedByAccount[accId] || 0) + item.vProd;
      });

      const postings: Omit<FinancialPosting, 'id'>[] = Object.entries(groupedByAccount).map(([accId, totalAmount]) => ({
        status,
        competenceDate,
        occurrenceDate,
        dueDate: status === 'PROVISIONADO' ? dueDate : '',
        group: MainGroup.DESPESAS,
        accountId: accId,
        observations: `Importação XML NF-e ${nfeData.nfeNumber} - ${nfeData.supplierName}`,
        paymentMethodId: selectedMethod,
        entityId,
        liquidationDate: status === 'LIQUIDADO' ? liquidationDate : undefined,
        bankId: status === 'LIQUIDADO' ? selectedBank : undefined,
        amount: totalAmount
      }));

      onAddPostings(postings);
      onClose();
      reset();
    } catch (err) {
      alert("Erro ao processar importação.");
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setFile(null);
    setNfeData(null);
    setItemMappings({});
    setSaveNewMappings({});
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 w-full max-w-5xl max-h-[90vh] rounded-[2.5rem] border border-slate-800 shadow-2xl flex flex-col overflow-hidden">
        <header className="p-8 border-b border-slate-800 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight uppercase">Importar NF-e (XML)</h2>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Criação automática de despesas</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-8 lg:p-12 space-y-10 custom-scrollbar">
          {!nfeData ? (
            <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-slate-800 rounded-[2rem] bg-slate-950/30">
              <svg className="text-slate-700 mb-6" xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></svg>
              <p className="text-slate-400 font-bold mb-4">Arraste o XML aqui ou clique para selecionar</p>
              <input type="file" accept=".xml" onChange={handleFileChange} className="hidden" id="xml-upload" />
              <label htmlFor="xml-upload" className="px-8 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all cursor-pointer shadow-lg">
                Selecionar Arquivo
              </label>
            </div>
          ) : (
            <>
              {/* NF-e Summary */}
              <section className="grid grid-cols-1 md:grid-cols-4 gap-6 bg-slate-950/50 p-6 rounded-3xl border border-slate-800">
                <div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Fornecedor</p>
                  <p className="text-sm font-black text-white truncate">{nfeData.supplierName}</p>
                  <p className="text-[10px] text-slate-500 font-bold">{nfeData.supplierCnpj}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Número / Emissão</p>
                  <p className="text-sm font-black text-white">NF {nfeData.nfeNumber}</p>
                  <p className="text-[10px] text-slate-500 font-bold">{nfeData.issueDate.split('-').reverse().join('/')}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Total da Nota</p>
                  <p className="text-sm font-black text-emerald-400">R$ {nfeData.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="flex flex-col gap-2">
                   <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Favorecido (Manual)</label>
                   <select 
                    value={selectedEntityId}
                    onChange={e => setSelectedEntityId(e.target.value)}
                    className="text-[10px] p-2 bg-slate-900 border border-slate-800 rounded-xl outline-none font-bold text-slate-300"
                   >
                    <option value="">Auto-identificar...</option>
                    {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                   </select>
                   <button onClick={reset} className="text-[9px] font-black text-rose-500 uppercase tracking-widest hover:underline text-left">Trocar Arquivo</button>
                </div>
              </section>

              {/* Items Mapping */}
              <section>
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  Mapeamento de Itens
                </h3>
                <div className="space-y-3">
                  {nfeData.items.map((item, idx) => (
                    <div key={idx} className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col lg:flex-row gap-4 items-center">
                      <div className="flex-1 min-w-0 w-full">
                        <p className="text-[11px] font-black text-slate-200 truncate">{item.xProd}</p>
                        <div className="flex gap-3 mt-1">
                          <span className="text-[9px] text-slate-500 font-bold">Cód: {item.cProd}</span>
                          <span className="text-[9px] text-slate-500 font-bold">Qtd: {item.qCom} {item.uCom}</span>
                          <span className="text-[9px] text-emerald-500 font-black">R$ {item.vProd.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                      <div className="flex flex-col lg:flex-row gap-4 items-center w-full lg:w-auto">
                        <select 
                          value={itemMappings[idx]} 
                          onChange={(e) => setItemMappings(prev => ({ ...prev, [idx]: e.target.value }))}
                          className={`text-[10px] p-2.5 bg-slate-900 border rounded-xl outline-none font-bold min-w-[200px] ${itemMappings[idx] ? 'border-emerald-500/30 text-emerald-400' : 'border-rose-500/30 text-rose-400'}`}
                        >
                          <option value="">Mapear para...</option>
                          {accounts.filter(a => a.groupId === MainGroup.DESPESAS).map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.name}</option>
                          ))}
                        </select>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input 
                            type="checkbox" 
                            checked={saveNewMappings[idx]} 
                            onChange={(e) => setSaveNewMappings(prev => ({ ...prev, [idx]: e.target.checked }))}
                            className="w-4 h-4 rounded border-slate-800 bg-slate-900 text-rose-500 focus:ring-rose-500"
                          />
                          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Salvar</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Launch Settings */}
              <section className="bg-slate-950/30 p-8 rounded-[2rem] border border-slate-800 space-y-8">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                  Configurações de Lançamento
                </h3>
                
                <div className="flex gap-4 mb-8">
                  <button 
                    onClick={() => setStatus('LIQUIDADO')}
                    className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${status === 'LIQUIDADO' ? 'bg-rose-600 text-white shadow-lg' : 'bg-slate-900 text-slate-500 border border-slate-800'}`}
                  >
                    Liquidado
                  </button>
                  <button 
                    onClick={() => setStatus('PROVISIONADO')}
                    className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${status === 'PROVISIONADO' ? 'bg-orange-600 text-white shadow-lg' : 'bg-slate-900 text-slate-500 border border-slate-800'}`}
                  >
                    Provisionado
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Competência / Ocorrência</label>
                    <input type="date" value={competenceDate} onChange={e => { setCompetenceDate(e.target.value); setOccurrenceDate(e.target.value); }} className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white outline-none focus:border-rose-500" />
                  </div>
                  {status === 'PROVISIONADO' ? (
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Vencimento</label>
                      <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white outline-none focus:border-rose-500" />
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Data Efetiva</label>
                        <input type="date" value={liquidationDate} onChange={e => setLiquidationDate(e.target.value)} className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white outline-none focus:border-rose-500" />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Banco</label>
                        <select value={selectedBank} onChange={e => setSelectedBank(e.target.value)} className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white outline-none focus:border-rose-500">
                          <option value="">Selecionar...</option>
                          {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      </div>
                    </>
                  )}
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Operação</label>
                    <select value={selectedMethod} onChange={e => setSelectedMethod(e.target.value)} className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white outline-none focus:border-rose-500">
                      <option value="">Selecionar...</option>
                      {paymentMethods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>

        <footer className="p-8 border-t border-slate-800 flex justify-end gap-4 shrink-0">
          <button onClick={onClose} className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-all">Cancelar</button>
          {nfeData && (
            <button 
              onClick={handleConfirm}
              disabled={isProcessing}
              className="px-10 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-emerald-950/50 disabled:opacity-50"
            >
              {isProcessing ? 'Processando...' : 'Confirmar Importação'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};
