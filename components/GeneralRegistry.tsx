import React, { useMemo, useRef, useState } from 'react';
import { Bank, PaymentMethod, Entity } from '../types';

interface Props {
  banks: Bank[];
  paymentMethods: PaymentMethod[];
  favored: Entity[];
  onAddBank: (name: string) => void;
  onDeleteBank: (id: string) => void;
  onAddMethod: (name: string) => void;
  onDeleteMethod: (id: string) => void;
  onAddFavored: (name: string) => void;
  onDeleteFavored: (id: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onReload: () => void;
  onReset: () => void;
}

const CORE_PAYMENT_METHODS = [
  'DINHEIRO',
  'PIX',
  'PIX ONLINE',
  'DEPÓSITO',
  'BOLETO',
  'CARTÃO CRÉDITO',
  'CARTÃO DÉBITO',
  'APLICATIVO DELIVERY',
  'OUTROS',
] as const;

const normalizeText = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export const GeneralRegistry: React.FC<Props> = ({
  banks,
  paymentMethods,
  favored,
  onAddBank,
  onDeleteBank,
  onAddMethod,
  onDeleteMethod,
  onAddFavored,
  onDeleteFavored,
  onExport,
  onImport,
  onReload,
  onReset,
}) => {
  const [inputBank, setInputBank] = useState('');
  const [inputFavored, setInputFavored] = useState('');
  const [inputMethod, setInputMethod] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const coreMethodSet = useMemo(
    () => new Set(CORE_PAYMENT_METHODS.map((method) => normalizeText(method))),
    []
  );

  const normalizedExistingMethods = useMemo(
    () => new Set(paymentMethods.map((method) => normalizeText(method.name))),
    [paymentMethods]
  );

  const sortedBanks = useMemo(() => {
    return [...banks].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [banks]);

  const sortedFavored = useMemo(() => {
    return [...favored].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [favored]);

  const coreMethods = useMemo(() => {
    return paymentMethods
      .filter((method) => coreMethodSet.has(normalizeText(method.name)))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [paymentMethods, coreMethodSet]);

  const legacyMethods = useMemo(() => {
    return paymentMethods
      .filter((method) => !coreMethodSet.has(normalizeText(method.name)))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [paymentMethods, coreMethodSet]);

  const missingCoreMethods = useMemo(() => {
    const existing = new Set(coreMethods.map((method) => normalizeText(method.name)));
    return CORE_PAYMENT_METHODS
      .filter((method) => !existing.has(normalizeText(method)))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [coreMethods]);

  const handleAddCustomMethod = () => {
    const normalized = normalizeText(inputMethod);

    if (!normalized) return;

    if (normalizedExistingMethods.has(normalized)) {
      setInputMethod('');
      return;
    }

    onAddMethod(normalized);
    setInputMethod('');
  };

  const renderSection = (
    title: string,
    placeholder: string,
    items: any[],
    onAdd: (name: string) => void,
    onDelete: (id: string) => void,
    inputValue: string,
    setInputValue: (val: string) => void,
    icon: React.ReactNode
  ) => (
    <div className="bg-slate-900 rounded-[2rem] shadow-2xl border border-slate-800 overflow-hidden flex flex-col h-full min-h-[400px]">
      <div className="p-6 bg-slate-950/50 border-b border-slate-800 flex items-center gap-3">
        <div className="text-rose-500 w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center border border-slate-800">
          {icon}
        </div>
        <h3 className="font-black text-slate-200 uppercase tracking-[0.2em] text-[10px]">{title}</h3>
      </div>

      <div className="p-6 flex-1 flex flex-col">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (inputValue.trim()) {
              onAdd(inputValue.trim().toUpperCase());
              setInputValue('');
            }
          }}
          className="mb-6 flex gap-2"
        >
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={placeholder}
            className="flex-1 text-[10px] p-3 bg-slate-950 border border-slate-800 rounded-xl focus:ring-1 focus:ring-rose-500 outline-none text-slate-100 placeholder:text-slate-700 font-bold"
          />
          <button
            type="submit"
            className="bg-slate-800 text-rose-500 px-4 py-2 rounded-xl hover:bg-rose-600 hover:text-white transition-all font-black text-xs"
          >
            +
          </button>
        </form>

        <div className="space-y-2 flex-1 overflow-y-auto pr-2 custom-scrollbar">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex justify-between items-center p-3 bg-slate-950 rounded-xl group border border-slate-800 hover:border-slate-700 transition-all"
            >
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider group-hover:text-slate-200">
                  {item.name}
                </span>
                {item.document && (
                  <span className="text-[8px] text-slate-600 font-bold tracking-widest">{item.document}</span>
                )}
              </div>
              <button
                onClick={() => onDelete(item.id)}
                className="text-slate-800 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderPaymentMethodsSection = () => (
    <div className="bg-slate-900 rounded-[2rem] shadow-2xl border border-slate-800 overflow-hidden flex flex-col h-full min-h-[400px]">
      <div className="p-6 bg-slate-950/50 border-b border-slate-800 flex items-center gap-3">
        <div className="text-rose-500 w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center border border-slate-800">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10h18" /><path d="M7 15h.01" /><path d="M11 15h.01" /><rect width="18" height="14" x="3" y="5" rx="2" /></svg>
        </div>
        <div>
          <h3 className="font-black text-slate-200 uppercase tracking-[0.2em] text-[10px]">Canais de Transação</h3>
          <p className="text-[9px] font-bold text-slate-500 mt-1 uppercase tracking-wider">Cadastre aqui os meios base e também meios complementares quando a operação exigir.</p>
        </div>
      </div>

      <div className="p-6 flex-1 flex flex-col gap-5">
        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-4 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">Modelo correto do app</p>
          <p className="text-xs text-cyan-100 leading-relaxed">
            Mantenha aqui os meios estruturais como <strong>Dinheiro, Pix, Pix Online, Depósito, Boleto, Cartão Crédito, Cartão Débito, Aplicativo Delivery e Outros</strong>.
            Combinações como <strong>Visa + Stone</strong> ou <strong>Master + Rede</strong> devem continuar em <strong>Configurações &gt; Regras de Cartões</strong>.
          </p>
        </div>

        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 mb-3">Adicionar meio base estrutural</p>
          <div className="flex flex-wrap gap-2">
            {missingCoreMethods.length === 0 ? (
              <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-[10px] font-black uppercase tracking-widest text-emerald-400">
                Todos os meios estruturais já estão cadastrados
              </div>
            ) : (
              missingCoreMethods.map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => onAddMethod(method)}
                  className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-slate-800 hover:bg-slate-700 text-cyan-400 transition-all"
                >
                  + {method}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-4 space-y-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300">Adicionar meio complementar manualmente</p>
            <p className="text-xs text-amber-100/90 leading-relaxed mt-2">
              Use isso quando a operação exigir um canal que faça sentido separar no seu controle, como <strong>Pago Online</strong>, <strong>Depósito Online</strong>, <strong>Débito em Conta</strong> ou outro meio específico.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAddCustomMethod();
            }}
            className="flex gap-2"
          >
            <input
              value={inputMethod}
              onChange={(e) => setInputMethod(e.target.value)}
              placeholder="Ex.: PAGO ONLINE"
              className="flex-1 text-[10px] p-3 bg-slate-950 border border-slate-800 rounded-xl focus:ring-1 focus:ring-amber-400 outline-none text-slate-100 placeholder:text-slate-700 font-bold uppercase"
            />
            <button
              type="submit"
              className="bg-slate-800 text-amber-400 px-4 py-2 rounded-xl hover:bg-amber-500 hover:text-slate-950 transition-all font-black text-xs"
            >
              +
            </button>
          </form>
        </div>

        <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 mb-3">Meios estruturais cadastrados</p>
            <div className="space-y-2">
              {coreMethods.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Nenhum meio estrutural cadastrado ainda.
                </div>
              ) : (
                coreMethods.map((item) => (
                  <div key={item.id} className="flex justify-between items-center p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-200 font-bold uppercase tracking-wider">{item.name}</span>
                      <span className="text-[8px] text-emerald-400 font-black tracking-[0.18em] uppercase">Estrutural do sistema</span>
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">Protegido</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-400 mb-3">Meios complementares cadastrados</p>
            <div className="space-y-2">
              {legacyMethods.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Nenhum meio complementar cadastrado.
                </div>
              ) : (
                legacyMethods.map((item) => (
                  <div key={item.id} className="flex justify-between items-center p-3 bg-slate-950 rounded-xl group border border-amber-500/20 hover:border-amber-500/40 transition-all">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-200 font-bold uppercase tracking-wider">{item.name}</span>
                      <span className="text-[8px] text-amber-400 font-black tracking-[0.18em] uppercase">Complementar da operação</span>
                    </div>
                    <button
                      onClick={() => onDeleteMethod(item.id)}
                      className="text-rose-500 hover:text-rose-400 transition-all shrink-0 text-[9px] font-black uppercase tracking-widest"
                    >
                      Excluir
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="animate-fade-in space-y-12">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight">Cadastros e Portabilidade</h2>
          <p className="text-slate-500 text-sm font-medium">Gerencie suas entidades e salve seus dados em arquivos externos.</p>
        </div>

        <div className="flex gap-3 bg-slate-900 p-2 rounded-2xl border border-slate-800 shadow-2xl">
          <input
            type="file"
            accept=".json"
            className="hidden"
            ref={fileInputRef}
            onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])}
          />
          <button onClick={onReload} className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>
            Recarregar do Servidor
          </button>
          <button onClick={onExport} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
            Exportar Backup
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
            Restaurar Backup
          </button>
          <button onClick={onReset} className="flex items-center gap-2 bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg>
            Sair da Sessão
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {renderSection(
          'Bancos e Contas',
          'Banco...',
          banks,
          onAddBank,
          onDeleteBank,
          inputBank,
          setInputBank,
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="12" x="2" y="6" rx="2" /><circle cx="12" cy="12" r="2" /><path d="M6 12h.01" /><path d="M18 12h.01" /></svg>
        )}
        {renderPaymentMethodsSection()}
        {renderSection(
          'Favorecidos / Clientes',
          'Nome...',
          favored,
          onAddFavored,
          onDeleteFavored,
          inputFavored,
          setInputFavored,
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
        )}
      </div>
    </div>
  );
};