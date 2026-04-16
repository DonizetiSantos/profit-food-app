import React, { useState, useMemo, useEffect } from 'react';
import { MainGroup, Account, Bank, PaymentMethod, Entity, FinancialPosting, XmlMapping } from '../types';
import { XmlImportModal } from './XmlImportModal';
import { PdvImportModal } from './PdvImportModal';
import { supabase } from '../src/lib/supabase';
import { useActiveCompany } from '../src/contexts/CompanyContext';

interface Props {
  accounts: Account[];
  banks: Bank[];
  paymentMethods: PaymentMethod[];
  entities: Entity[];
  onAddPosting: (posting: Omit<FinancialPosting, 'id'>) => void;
  editingPosting?: FinancialPosting | null;
  onCancelEdit?: () => void;
  xmlMappings: XmlMapping[];
  onSaveXmlMappings: (mappings: XmlMapping[]) => void;
  onAddMultiplePostings: (postings: Omit<FinancialPosting, 'id'>[]) => void;
  onAddFavored?: (entity: Entity) => void;
  onRefresh?: () => void;
}

export const FinancialPostings: React.FC<Props> = ({
  accounts, banks, paymentMethods, entities, onAddPosting, editingPosting, onCancelEdit,
  xmlMappings, onSaveXmlMappings, onAddMultiplePostings, onAddFavored, onRefresh
}) => {
  const { activeCompany } = useActiveCompany();

  const getFirstDayOfMonth = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  };

  const getToday = () => new Date().toISOString().split('T')[0];

  const [activeTab, setActiveTab] = useState<'LIQUIDADO' | 'PROVISIONADO'>('LIQUIDADO');
  const [competenceDate, setCompetenceDate] = useState(getFirstDayOfMonth());
  const [occurrenceDate, setOccurrenceDate] = useState(getToday());
  const [dueDate, setDueDate] = useState('');
  const [liquidationDate, setLiquidationDate] = useState(getToday());
  const [selectedGroup, setSelectedGroup] = useState<MainGroup>(MainGroup.RECEITAS);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [observations, setObservations] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('');
  const [selectedEntity, setSelectedEntity] = useState('');
  const [selectedBank, setSelectedBank] = useState('');
  const [amount, setAmount] = useState('');
  const [isXmlModalOpen, setIsXmlModalOpen] = useState(false);
  const [isPdvModalOpen, setIsPdvModalOpen] = useState(false);

  const [invoiceDuplicateMessage, setInvoiceDuplicateMessage] = useState('');
  const [checkingInvoiceDuplicate, setCheckingInvoiceDuplicate] = useState(false);

  useEffect(() => {
    if (editingPosting) {
      setActiveTab(editingPosting.status);
      setCompetenceDate(editingPosting.competenceDate);
      setOccurrenceDate(editingPosting.occurrenceDate);
      setDueDate(editingPosting.dueDate || '');
      setLiquidationDate(editingPosting.liquidationDate || getToday());
      setSelectedGroup(editingPosting.group);
      setSelectedAccount(editingPosting.accountId);
      setInvoiceNumber(editingPosting.invoiceNumber || '');
      setObservations(editingPosting.observations);
      setSelectedMethod(editingPosting.paymentMethodId);
      setSelectedEntity(editingPosting.entityId);
      setSelectedBank(editingPosting.bankId || '');
      setAmount(editingPosting.amount.toString());
    } else {
      resetForm();
    }
  }, [editingPosting]);

  useEffect(() => {
    let cancelled = false;

    const checkDuplicateInvoice = async () => {
      const trimmedInvoice = invoiceNumber.trim();

      if (
        !activeCompany ||
        selectedGroup !== MainGroup.DESPESAS ||
        !selectedEntity ||
        !trimmedInvoice
      ) {
        setInvoiceDuplicateMessage('');
        setCheckingInvoiceDuplicate(false);
        return;
      }

      setCheckingInvoiceDuplicate(true);

      let query = supabase
        .from('postings')
        .select('id')
        .eq('company_id', activeCompany.id)
        .eq('entity_id', selectedEntity)
        .eq('invoice_number', trimmedInvoice)
        .limit(1);

      if (editingPosting?.id) {
        query = query.neq('id', editingPosting.id);
      }

      const { data, error } = await query;

      if (cancelled) return;

      if (error) {
        setInvoiceDuplicateMessage('Não foi possível validar a duplicidade da NF agora.');
        setCheckingInvoiceDuplicate(false);
        return;
      }

      if (data && data.length > 0) {
        setInvoiceDuplicateMessage(`Já existe um lançamento para este fornecedor com a NF ${trimmedInvoice}.`);
      } else {
        setInvoiceDuplicateMessage('');
      }

      setCheckingInvoiceDuplicate(false);
    };

    const timer = window.setTimeout(() => {
      void checkDuplicateInvoice();
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeCompany, selectedGroup, selectedEntity, invoiceNumber, editingPosting]);

  const resetForm = () => {
    setCompetenceDate(getFirstDayOfMonth());
    setOccurrenceDate(getToday());
    setDueDate('');
    setLiquidationDate(getToday());
    setSelectedAccount('');
    setInvoiceNumber('');
    setObservations('');
    setSelectedMethod('');
    setSelectedEntity('');
    setSelectedBank('');
    setAmount('');
    setInvoiceDuplicateMessage('');
    setCheckingInvoiceDuplicate(false);
  };

  const filteredAccounts = useMemo(
    () => [...accounts]
      .filter(acc => acc.groupId === selectedGroup)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [accounts, selectedGroup]
  );

  const sortedPaymentMethods = useMemo(
    () => [...paymentMethods].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [paymentMethods]
  );

  const sortedEntities = useMemo(
    () => [...entities].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [entities]
  );

  const sortedBanks = useMemo(
    () => [...banks].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [banks]
  );

  const hasDuplicateInvoice =
    selectedGroup === MainGroup.DESPESAS &&
    !!selectedEntity &&
    !!invoiceNumber.trim() &&
    !!invoiceDuplicateMessage &&
    !invoiceDuplicateMessage.startsWith('Não foi possível validar');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!amount || !selectedAccount) {
      alert("Por favor, preencha o valor e selecione a conta do plano.");
      return;
    }

    if (activeTab === 'LIQUIDADO' && selectedGroup !== MainGroup.ESTOQUE) {
      if (!selectedMethod || !selectedEntity || !selectedBank) {
        alert("Para registros liquidados, é obrigatório informar Operação, Entidade e Banco.");
        return;
      }
    }

    if (activeTab === 'PROVISIONADO') {
      if (selectedGroup === MainGroup.DESPESAS && !dueDate) {
        alert("Para despesas provisionadas, a data de vencimento é obrigatória.");
        return;
      }
    }

    if (
      activeCompany &&
      selectedGroup === MainGroup.DESPESAS &&
      selectedEntity &&
      invoiceNumber.trim()
    ) {
      let query = supabase
        .from('postings')
        .select('id')
        .eq('company_id', activeCompany.id)
        .eq('entity_id', selectedEntity)
        .eq('invoice_number', invoiceNumber.trim())
        .limit(1);

      if (editingPosting?.id) {
        query = query.neq('id', editingPosting.id);
      }

      const { data, error } = await query;

      if (error) {
        alert("Erro ao validar duplicidade da nota fiscal.");
        return;
      }

      if (data && data.length > 0) {
        alert(`Já existe um lançamento para este fornecedor com a NF ${invoiceNumber.trim()}. Verifique antes de lançar manualmente.`);
        return;
      }
    }

    onAddPosting({
      status: activeTab,
      competenceDate,
      occurrenceDate,
      dueDate: activeTab === 'PROVISIONADO' ? dueDate : '',
      group: selectedGroup,
      accountId: selectedAccount,
      invoiceNumber: invoiceNumber.trim(),
      observations,
      paymentMethodId: selectedMethod,
      entityId: selectedEntity,
      liquidationDate: activeTab === 'LIQUIDADO' ? liquidationDate : undefined,
      bankId: activeTab === 'LIQUIDADO' ? selectedBank : undefined,
      amount: parseFloat(amount)
    });

    alert(editingPosting ? "Lançamento atualizado!" : "Lançamento realizado!");

    resetForm();
    if (editingPosting && onCancelEdit) {
      onCancelEdit();
    }
  };

  return (
    <div className="animate-fade-in max-w-4xl mx-auto pb-10">
      <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight">
            {editingPosting ? 'Corrigir Lançamento' : 'Novo Lançamento'}
          </h2>
          <p className="text-slate-500 text-sm font-medium">
            {editingPosting ? 'Alterando um registro existente no extrato.' : 'Gestão de caixa e previsibilidade financeira.'}
          </p>
        </div>

        <div className="flex items-center gap-4">
          {editingPosting && (
            <button
              onClick={onCancelEdit}
              className="px-4 py-2 text-[10px] font-black bg-slate-800 text-slate-400 rounded-xl hover:text-white transition-all uppercase tracking-widest border border-slate-700"
            >
              Cancelar Edição
            </button>
          )}
          <div className="flex bg-slate-900 p-1.5 rounded-2xl border border-slate-800 shadow-inner">
            <button
              type="button"
              onClick={() => setActiveTab('LIQUIDADO')}
              className={`px-6 py-2.5 rounded-xl text-xs font-black tracking-widest transition-all ${activeTab === 'LIQUIDADO' ? 'bg-slate-800 text-rose-500 shadow-xl' : 'text-slate-500 hover:text-slate-400'}`}
            >
              LIQUIDADOS
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('PROVISIONADO')}
              className={`px-6 py-2.5 rounded-xl text-xs font-black tracking-widest transition-all ${activeTab === 'PROVISIONADO' ? 'bg-slate-800 text-orange-500 shadow-xl' : 'text-slate-500 hover:text-slate-400'}`}
            >
              PROVISIONADOS
            </button>
          </div>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="bg-slate-900 rounded-[2rem] shadow-2xl border border-slate-800 overflow-hidden">
        <div className={`h-2 ${activeTab === 'LIQUIDADO' ? 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)]' : 'bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.3)]'}`}></div>

        <div className="p-8 lg:p-12 space-y-10">
          <section>
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              Prazos e Competência
            </h3>
            <div className={`grid grid-cols-1 ${activeTab === 'PROVISIONADO' ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-8`}>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-400 ml-1">Emissão (Competência)</label>
                <input type="date" value={competenceDate} onChange={e => setCompetenceDate(e.target.value)} className="form-input-dark" required />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-400 ml-1">Fato Gerador (Ocorrência)</label>
                <input type="date" value={occurrenceDate} onChange={e => setOccurrenceDate(e.target.value)} className="form-input-dark" required />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-400 ml-1">Número da Nota Fiscal</label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={e => setInvoiceNumber(e.target.value)}
                  className={`form-input-dark ${
                    hasDuplicateInvoice ? 'border-amber-500/70 focus:border-amber-500' : ''
                  }`}
                  placeholder="Ex.: 1234"
                />
                {checkingInvoiceDuplicate && (
                  <p className="text-[11px] font-bold text-slate-500 ml-1">
                    Verificando NF...
                  </p>
                )}
              </div>
              {activeTab === 'PROVISIONADO' && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-400 ml-1">Vencimento {selectedGroup === MainGroup.RECEITAS ? '(Opcional)' : '(Obrigatório)'}</label>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="form-input-dark" />
                </div>
              )}
            </div>
          </section>

          <section>
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Classificação
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-400 ml-1">Natureza</label>
                <div className="flex bg-slate-950 p-1.5 rounded-xl border border-slate-800 gap-1.5">
                  {Object.values(MainGroup).map(group => (
                    <button
                      key={group} type="button"
                      onClick={() => { setSelectedGroup(group); setSelectedAccount(''); }}
                      className={`flex-1 py-2.5 text-[9px] font-black rounded-lg transition-all uppercase tracking-wider ${selectedGroup === group ? 'bg-slate-800 shadow-lg text-white' : 'text-slate-600 hover:text-slate-400'}`}
                    >
                      {group}
                    </button>
                  ))}
                </div>
                {selectedGroup === MainGroup.DESPESAS && !editingPosting && (
                  <button
                    type="button"
                    onClick={() => setIsXmlModalOpen(true)}
                    className="mt-2 flex items-center justify-center gap-2 py-2.5 bg-slate-800 hover:bg-slate-700 text-rose-500 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-slate-700 shadow-lg"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></svg>
                    Importar XML (NF-e)
                  </button>
                )}
                {selectedGroup === MainGroup.RECEITAS && !editingPosting && (
                  <button
                    type="button"
                    onClick={() => setIsPdvModalOpen(true)}
                    className="mt-2 flex items-center justify-center gap-2 py-2.5 bg-slate-800 hover:bg-slate-700 text-emerald-500 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-slate-700 shadow-lg"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                    Importar Fechamento (PDV)
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-400 ml-1">Conta do Plano</label>
                  <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)} className="form-input-dark" required>
                    <option value="">Selecione...</option>
                    {filteredAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                  </select>
                </div>

                <div className="min-h-[128px]">
                  {!checkingInvoiceDuplicate && invoiceDuplicateMessage && (
                    <div className={`rounded-2xl border px-5 py-4 shadow-lg ${
                      hasDuplicateInvoice
                        ? 'bg-amber-500/10 border-amber-500/30'
                        : 'bg-slate-950/60 border-slate-700'
                    }`}>
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                          hasDuplicateInvoice ? 'bg-amber-400' : 'bg-slate-500'
                        }`}></div>
                        <div className="space-y-1">
                          <p className={`text-[11px] font-black uppercase tracking-[0.18em] ${
                            hasDuplicateInvoice ? 'text-amber-400' : 'text-slate-400'
                          }`}>
                            Atenção
                          </p>
                          <p className={`text-sm font-bold leading-relaxed ${
                            hasDuplicateInvoice ? 'text-amber-200' : 'text-slate-300'
                          }`}>
                            {invoiceDuplicateMessage}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-purple-500"></span>
              Identificação e Valor
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-400 ml-1">Operação {(activeTab === 'PROVISIONADO' || selectedGroup === MainGroup.ESTOQUE) && '(Opcional)'}</label>
                <select value={selectedMethod} onChange={e => setSelectedMethod(e.target.value)} className="form-input-dark">
                  <option value="">Selecione...</option>
                  {sortedPaymentMethods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-400 ml-1">Entidade {(activeTab === 'PROVISIONADO' || selectedGroup === MainGroup.ESTOQUE) && '(Opcional)'}</label>
                <select value={selectedEntity} onChange={e => setSelectedEntity(e.target.value)} className="form-input-dark">
                  <option value="">Selecione...</option>
                  {sortedEntities.map(ent => <option key={ent.id} value={ent.id}>{ent.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-400 ml-1">Valor do Lançamento</label>
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0,00"
                  className={`form-input-dark text-xl font-black ${selectedGroup === MainGroup.RECEITAS ? 'text-emerald-400' : 'text-rose-400'}`}
                  required
                />
              </div>
            </div>
          </section>

          {activeTab === 'LIQUIDADO' && (
            <section className="bg-slate-950/50 p-8 rounded-[1.5rem] border border-slate-800 animate-fade-in ring-1 ring-slate-800/50">
              <h3 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em] mb-6">Conciliação Bancária</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-400 ml-1">Data Efetiva</label>
                  <input type="date" value={liquidationDate} onChange={e => setLiquidationDate(e.target.value)} className="form-input-dark border-rose-500/20" />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-400 ml-1">Conta Bancária {selectedGroup === MainGroup.ESTOQUE && '(Opcional)'}</label>
                  <select value={selectedBank} onChange={e => setSelectedBank(e.target.value)} className="form-input-dark border-rose-500/20">
                    <option value="">Selecione o banco...</option>
                    {sortedBanks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>
            </section>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-400 ml-1">Detalhes Adicionais</label>
            <textarea
              value={observations}
              onChange={e => setObservations(e.target.value)}
              className="form-input-dark min-h-[100px] resize-none"
              placeholder="Notas sobre o lançamento..."
            />
          </div>

          <button
            type="submit"
            disabled={hasDuplicateInvoice || checkingInvoiceDuplicate}
            className={`w-full py-5 rounded-2xl text-white font-black text-lg shadow-2xl active:scale-[0.99] transition-all uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed
              ${activeTab === 'LIQUIDADO' ? 'bg-rose-600 shadow-rose-950/50 hover:brightness-110' : 'bg-orange-600 shadow-orange-950/50 hover:brightness-110'}`}
          >
            {checkingInvoiceDuplicate
              ? 'Validando NF...'
              : (editingPosting ? 'Atualizar Registro' : `Confirmar Registro ${activeTab}`)}
          </button>
        </div>
      </form>

      <XmlImportModal
        isOpen={isXmlModalOpen}
        onClose={() => setIsXmlModalOpen(false)}
        accounts={accounts}
        banks={banks}
        paymentMethods={paymentMethods}
        entities={entities}
        xmlMappings={xmlMappings}
        onSaveMappings={onSaveXmlMappings}
        onAddPostings={onAddMultiplePostings}
        onAddEntity={onAddFavored}
      />

      <PdvImportModal
        isOpen={isPdvModalOpen}
        onClose={() => setIsPdvModalOpen(false)}
        banks={banks}
        paymentMethods={paymentMethods}
        onSuccess={() => {
          if (onRefresh) onRefresh();
          else window.location.reload();
        }}
      />

      <style>{`
        .form-input-dark {
          width: 100%;
          padding: 1rem;
          background-color: #020617;
          border: 1px solid #1e293b;
          border-radius: 1rem;
          font-size: 0.875rem;
          color: #f1f5f9;
          outline: none;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .form-input-dark:focus {
          border-color: #f43f5e;
          background-color: #0f172a;
          box-shadow: 0 0 0 4px rgba(244, 63, 94, 0.15);
        }
        input[type="date"]::-webkit-calendar-picker-indicator {
          filter: invert(1);
          opacity: 0.5;
        }
      `}</style>
    </div>
  );
};