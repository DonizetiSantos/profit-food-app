
import React, { useState, useEffect, useCallback } from 'react';
import { MainGroup, Subgroup, Account, FinancialPosting, Bank, PaymentMethod, Entity, User, XmlMapping } from './types';
import { INITIAL_SUBGROUPS, INITIAL_ACCOUNTS } from './constants';
import { Dashboard } from './components/Dashboard';
import { AccountRegistration } from './components/AccountRegistration';
import { GeneralRegistry } from './components/GeneralRegistry';
import { FinancialPostings } from './components/FinancialPostings';
import { PostingsList } from './components/PostingsList';
import { DRE } from './components/DRE';
import { Auth } from './components/Auth';
import { FinancialAnalysis } from './components/FinancialAnalysis';
import { FinancialAnalysisData } from './services/geminiService';
import { datastore, AppState } from './data/datastore';
import { Reconciliation } from './components/Reconciliation';
import { FinancialAssumptions } from './components/FinancialAssumptions';
import { supabase } from './src/lib/supabase';
import { CompanyProvider, useActiveCompany } from './src/contexts/CompanyContext';
import { Company } from './types';

const WHATSAPP_LINK = "https://wa.me/5511999999999"; // Configurar link aqui

const canAccessCompany = (company: Company | null): boolean => {
  if (!company) return false;
  
  const status = company.subscription_status;
  
  // Se subscription_status = 'active' → acesso liberado
  if (status === 'active') return true;
  
  // Se subscription_status = 'blocked' → bloquear acesso
  // Se subscription_status = 'expired' → bloquear acesso
  if (status === 'blocked' || status === 'expired') return false;
  
  // Se subscription_status = 'trial':
  if (status === 'trial') {
    // se não houver trial_ends_at → false
    if (!company.trial_ends_at) return false;
    
    // se data atual <= trial_ends_at → true
    // se data atual > trial_ends_at → false
    const trialEnd = new Date(company.trial_ends_at);
    const now = new Date();
    return now <= trialEnd;
  }
  
  return false; // Default blocked for safety
};

const AppContent: React.FC<{ user: User; onLogout: (e: React.MouseEvent) => void }> = ({ user, onLogout }) => {
  const { activeCompany, loading: companyLoading, error: companyError } = useActiveCompany();
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'lancamentos' | 'lista' | 'contas' | 'cadastros' | 'dre' | 'analise' | 'conciliacao' | 'configuracoes'>('dashboard');
  const [analysisData, setAnalysisData] = useState<{ data: FinancialAnalysisData, period: string } | null>(null);
  const [editingPosting, setEditingPosting] = useState<FinancialPosting | null>(null);
  const [globalSearchFilter, setGlobalSearchFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  
  const [subgroups] = useState<Subgroup[]>(INITIAL_SUBGROUPS);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [favored, setFavored] = useState<Entity[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [postings, setPostings] = useState<FinancialPosting[]>([]);
  const [xmlMappings, setXmlMappings] = useState<XmlMapping[]>([]);

  const initData = useCallback(async () => {
    if (!activeCompany) return;
    
    setLoading(true);
    setError(null);
    try {
      const state = await datastore.loadAll(activeCompany.id);
      setBanks(state.banks);
      setPaymentMethods(state.paymentMethods);
      setFavored(state.favored);
      setAccounts(state.accounts);
      setPostings(state.postings);
      setXmlMappings(state.xmlMappings);
    } catch (err: any) {
      console.error("Erro ao carregar dados:", err);
      setError(err.message || "Erro de conexão com o servidor.");
    } finally {
      setLoading(false);
    }
  }, [activeCompany]);

  useEffect(() => {
    if (activeCompany) {
      initData();
    }
  }, [activeCompany, initData]);

  const handleAddBank = async (name: string) => { 
    if (!activeCompany) return;
    setSyncing(true);
    try {
      const newBank = { id: crypto.randomUUID(), name };
      await datastore.upsertOne('banks', newBank, activeCompany.id);
      setBanks(prev => [...prev, newBank]); 
    } catch (err) {
      alert("Erro ao salvar no servidor. Tente novamente.");
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteBank = async (id: string) => { 
    if (!activeCompany) return;
    setSyncing(true);
    try {
      await datastore.deleteOne('banks', id, activeCompany.id);
      setBanks(prev => prev.filter(b => b.id !== id)); 
    } catch (err) {
      alert("Erro ao excluir no servidor.");
    } finally {
      setSyncing(false);
    }
  };

  const handleAddMethod = async (name: string) => { 
    if (!activeCompany) return;
    setSyncing(true);
    try {
      const newMethod = { id: crypto.randomUUID(), name };
      await datastore.upsertOne('payment_methods', newMethod, activeCompany.id);
      setPaymentMethods(prev => [...prev, newMethod]); 
    } catch (err) {
      alert("Erro ao salvar no servidor.");
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteMethod = async (id: string) => { 
    if (!activeCompany) return;
    setSyncing(true);
    try {
      await datastore.deleteOne('payment_methods', id, activeCompany.id);
      setPaymentMethods(prev => prev.filter(m => m.id !== id)); 
    } catch (err) {
      alert("Erro ao excluir no servidor.");
    } finally {
      setSyncing(false);
    }
  };

  const handleAddFavored = async (name: string) => { 
    if (!activeCompany) return;
    setSyncing(true);
    try {
      const newFavored = { id: crypto.randomUUID(), name, type: 'AMBOS' as const };
      await datastore.upsertOne('favored', newFavored, activeCompany.id);
      setFavored(prev => [...prev, newFavored]); 
    } catch (err) {
      alert("Erro ao salvar no servidor.");
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteFavored = async (id: string) => { 
    if (!activeCompany) return;
    setSyncing(true);
    try {
      await datastore.deleteOne('favored', id, activeCompany.id);
      setFavored(prev => prev.filter(f => f.id !== id)); 
    } catch (err) {
      alert("Erro ao excluir no servidor.");
    } finally {
      setSyncing(false);
    }
  };

  const handleAddAccount = async (name: string, subgroupId: string, groupId: MainGroup) => { 
    if (!activeCompany) return;
    setSyncing(true);
    try {
      const newAccount = { id: crypto.randomUUID(), name: name.toUpperCase(), subgroupId, groupId };
      await datastore.upsertOne('accounts', newAccount, activeCompany.id);
      setAccounts(prev => [...prev, newAccount]); 
    } catch (err) {
      alert("Erro ao salvar no servidor.");
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteAccount = async (id: string) => { 
    if (!activeCompany) return;
    setSyncing(true);
    try {
      await datastore.deleteOne('accounts', id, activeCompany.id);
      setAccounts(prev => prev.filter(a => a.id !== id || a.isFixed)); 
    } catch (err) {
      alert("Erro ao excluir no servidor.");
    } finally {
      setSyncing(false);
    }
  };

  const handleSavePosting = async (postingData: Omit<FinancialPosting, 'id'>) => {
    if (!activeCompany) return;
    setSyncing(true);
    try {
      let toUpsert: FinancialPosting;
      if (editingPosting) { 
        toUpsert = { ...postingData, id: editingPosting.id };
      } else { 
        toUpsert = { ...postingData, id: crypto.randomUUID() };
      }
      
      await datastore.upsertOne('postings', toUpsert, activeCompany.id);
      
      if (editingPosting) {
        setPostings(prev => prev.map(p => p.id === editingPosting.id ? toUpsert : p));
        setEditingPosting(null);
      } else {
        setPostings(prev => [toUpsert, ...prev]);
      }
    } catch (err) {
      alert("Erro ao salvar lançamento no servidor.");
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveXmlMappings = async (newMappings: XmlMapping[]) => {
    if (!activeCompany) return;
    setSyncing(true);
    try {
      for (const m of newMappings) {
        await datastore.upsertOne('xml_item_mappings', m, activeCompany.id);
      }
      setXmlMappings(prev => [...prev, ...newMappings]);
    } catch (err) {
      alert("Erro ao salvar mapeamentos no servidor.");
    } finally {
      setSyncing(false);
    }
  };

  const handleAddMultiplePostings = async (newPostings: Omit<FinancialPosting, 'id'>[]) => {
    if (!activeCompany) return;
    setSyncing(true);
    try {
      const withIds = newPostings.map(p => ({ ...p, id: crypto.randomUUID() }));
      for (const p of withIds) {
        await datastore.upsertOne('postings', p, activeCompany.id);
      }
      setPostings(prev => [...withIds, ...prev]);
      alert(`${newPostings.length} lançamentos criados com sucesso!`);
    } catch (err) {
      alert("Erro ao salvar múltiplos lançamentos.");
    } finally {
      setSyncing(false);
    }
  };

  const handleEditPosting = useCallback((posting: FinancialPosting) => { 
    setEditingPosting(posting); 
    setCurrentPage('lancamentos'); 
  }, []);

  const handleDeletePosting = useCallback(async (id: string) => { 
    if (!activeCompany) return;
    if (window.confirm("Deseja realmente excluir este lançamento?")) { 
      setSyncing(true);
      try {
        await datastore.deleteOne('postings', id, activeCompany.id);
        setPostings(prev => prev.filter(p => p.id !== id)); 
      } catch (err) {
        alert("Erro ao excluir lançamento.");
      } finally {
        setSyncing(false);
      }
    } 
  }, [activeCompany]);

  const handleShowAnalysis = (data: FinancialAnalysisData, period: string) => {
    setAnalysisData({ data, period });
    setCurrentPage('analise');
  };

  const handleNavigateToList = (filter: string) => {
    setGlobalSearchFilter(filter);
    setCurrentPage('lista');
  };

  const handleExportData = () => {
    const fullData: AppState = { banks, paymentMethods, favored, accounts, postings, xmlMappings };
    const blob = new Blob([JSON.stringify(fullData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `profit_food_backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportData = (file: File) => {
    if (!activeCompany) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data.postings && data.accounts) {
          const newState: AppState = {
            banks: data.banks || [],
            paymentMethods: data.paymentMethods || [],
            favored: data.favored || [],
            accounts: data.accounts,
            postings: data.postings,
            xmlMappings: data.xmlMappings || []
          };
          
          setSyncing(true);
          await datastore.saveAll(newState, activeCompany.id);
          
          // Refresh UI from Supabase to be sure
          const freshState = await datastore.loadAll(activeCompany.id);
          setBanks(freshState.banks);
          setPaymentMethods(freshState.paymentMethods);
          setFavored(freshState.favored);
          setAccounts(freshState.accounts);
          setPostings(freshState.postings);
          setXmlMappings(freshState.xmlMappings);
          
          setSyncing(false);
          alert(`Backup restaurado com sucesso!\n\nRegistros:\nBancos: ${newState.banks.length}\nMétodos: ${newState.paymentMethods.length}\nFavorecidos: ${newState.favored.length}\nContas: ${newState.accounts.length}\nLançamentos: ${newState.postings.length}`);
        }
      } catch (err) { 
        setSyncing(false);
        alert("Erro ao importar backup."); 
      }
    };
    reader.readAsText(file);
  };

  const handleReloadData = async () => {
    if (!activeCompany) return;
    setSyncing(true);
    try {
      const state = await datastore.loadAll(activeCompany.id);
      setBanks(state.banks);
      setPaymentMethods(state.paymentMethods);
      setFavored(state.favored);
      setAccounts(state.accounts);
      setPostings(state.postings);
      setXmlMappings(state.xmlMappings);
      alert("Dados recarregados do servidor!");
    } catch (err) {
      alert("Erro ao recarregar dados.");
    } finally {
      setSyncing(false);
    }
  };

  const handleResetData = async () => {
    if (confirm("Isso apagará sua sessão. Deseja sair?")) {
      await supabase.auth.signOut();
    }
  };

  if (companyLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-6">
        <div className="w-16 h-16 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin"></div>
        <p className="text-slate-400 font-bold uppercase tracking-widest text-xs animate-pulse">
          Identificando Empresa...
        </p>
      </div>
    );
  }

  if (companyError || error) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-rose-500/10 rounded-3xl flex items-center justify-center border border-rose-500/20 mb-6">
          <svg className="text-rose-500" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
        </div>
        <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">NÃO CONSEGUIMOS CARREGAR SEUS DADOS</h2>
        <p className="text-slate-400 max-w-md mb-8 font-medium">
          Isso pode acontecer após atualização do sistema.<br /><br />
          Clique em "Atualizar sessão" para continuar.
        </p>
        <button 
          onClick={(e) => { onLogout(e); window.location.reload(); }}
          className="bg-rose-600 hover:bg-rose-500 text-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest transition-all shadow-lg shadow-rose-600/20"
        >
          ATUALIZAR SESSÃO
        </button>
      </div>
    );
  }

  if (!activeCompany) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-rose-500/10 rounded-3xl flex items-center justify-center border border-rose-500/20 mb-6">
          <svg className="text-rose-500" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
        </div>
        <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">NÃO CONSEGUIMOS CARREGAR SEUS DADOS</h2>
        <p className="text-slate-400 max-w-md mb-8 font-medium">
          Isso pode acontecer após atualização do sistema.<br /><br />
          Clique em "Atualizar sessão" para continuar.
        </p>
        <button 
          onClick={(e) => { onLogout(e); window.location.reload(); }}
          className="bg-rose-600 hover:bg-rose-500 text-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest transition-all shadow-lg shadow-rose-600/20"
        >
          ATUALIZAR SESSÃO
        </button>
      </div>
    );
  }

  if (!canAccessCompany(activeCompany)) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-rose-500/10 rounded-3xl flex items-center justify-center border border-rose-500/20 mb-6">
          <svg className="text-rose-500" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-tight text-balance">SEU PERÍODO DE TESTE TERMINOU</h2>
        <p className="text-slate-400 max-w-md mb-8 font-medium">
          O acesso desta empresa ao Profit Food está temporariamente indisponível.<br /><br />
          Para continuar utilizando o sistema, entre em contato para ativação do seu plano.
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <a 
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-600/20 inline-flex items-center justify-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            FALAR NO WHATSAPP
          </a>
          <button 
            onClick={onLogout}
            className="bg-slate-800 hover:bg-slate-700 text-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest transition-all border border-slate-700"
          >
            SAIR
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-6">
        <div className="w-16 h-16 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin"></div>
        <p className="text-slate-400 font-bold uppercase tracking-widest text-xs animate-pulse">
          Carregando dados do Profit Food...
        </p>
      </div>
    );
  }

  const getTrialBadge = (company: Company) => {
    if (company.subscription_status !== 'trial' || !company.trial_ends_at) return null;

    const end = new Date(company.trial_ends_at);
    const now = new Date();
    
    // Reset time to compare only dates
    const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const diffTime = endDate.getTime() - nowDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return null;

    let text = "";
    if (diffDays > 1) {
      text = `FALTAM ${diffDays} DIAS`;
    } else if (diffDays === 1) {
      text = "ÚLTIMO DIA DE TESTE";
    } else {
      text = "TESTE ENCERRA HOJE";
    }

    const dateStr = end.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    
    return {
      text,
      subtext: diffDays > 0 ? `até ${dateStr}` : null,
      isUrgent: diffDays <= 3
    };
  };

  const trialInfo = activeCompany ? getTrialBadge(activeCompany) : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20 selection:bg-rose-500/30">
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-2 flex flex-col gap-2">
          {/* Linha 1: Logo, Empresa, Trial e Botão Painel do Dono */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center pointer-events-none">
                <svg viewBox="0 0 100 100" className="w-full h-full text-rose-500 fill-current">
                   <path d="M20,10 L70,10 C85,10 95,25 95,40 C95,55 85,70 70,70 L40,70 L40,95 L20,95 L20,10 Z M40,30 L40,50 L70,50 C75,50 80,45 80,40 C80,35 75,30 70,30 L40,30 Z" />
                </svg>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-black text-white leading-none tracking-tight uppercase whitespace-nowrap">PROFIT FOOD</span>
                <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest bg-rose-500/10 px-2 py-0.5 rounded-lg border border-rose-500/20 whitespace-nowrap">
                  {activeCompany.name}
                </span>
                {trialInfo && (
                  <div className={`flex flex-col items-start px-2 py-1 rounded border whitespace-nowrap leading-none ${trialInfo.isUrgent ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'}`}>
                    <span className="text-[9px] font-black uppercase tracking-widest">
                      {trialInfo.text}
                    </span>
                    {trialInfo.subtext && (
                      <span className="text-[8px] font-bold opacity-80 mt-0.5">
                        {trialInfo.subtext}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[9px] font-medium text-slate-500 uppercase tracking-widest hidden md:block">
                Olá, {user.name.split(' ')[0]} {syncing && <span className="inline-block w-1 h-1 bg-rose-500 rounded-full animate-ping ml-1"></span>}
              </span>
              <button 
                type="button"
                onClick={() => setCurrentPage('dashboard')}
                className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition-all border ${currentPage === 'dashboard' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-sm' : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'}`}
              >
                Painel do Dono
              </button>
              <button onClick={onLogout} className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-500 transition-all shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
              </button>
            </div>
          </div>

          {/* Linha 2: Menu de Navegação */}
          <div className="w-full">
            <nav className="flex bg-slate-950/50 p-1 rounded-xl border border-slate-800 overflow-x-auto no-scrollbar">
              {['dre', 'lancamentos', 'lista', 'conciliacao', 'contas', 'cadastros', 'configuracoes'].map(id => (
                <button 
                  key={id} type="button" onClick={() => {
                    if (id === 'lista') setGlobalSearchFilter('');
                    setCurrentPage(id as any);
                  }} 
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap transition-all ${currentPage === id ? 'bg-slate-800 text-rose-500 shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {id === 'contas' ? 'Plano' : id === 'lista' ? 'Registros' : id === 'conciliacao' ? 'Conciliação' : id === 'configuracoes' ? 'Configurações' : id === 'lancamentos' ? 'Lançamentos' : id}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {currentPage === 'dashboard' && <Dashboard postings={postings} accounts={accounts} banks={banks} onLiquidar={handleEditPosting} />}
        {currentPage === 'dre' && <DRE postings={postings} accounts={accounts} subgroups={subgroups} onShowAnalysis={handleShowAnalysis} />}
        {currentPage === 'analise' && analysisData && <FinancialAnalysis data={analysisData.data} period={analysisData.period} onBack={() => setCurrentPage('dre')} />}
        {currentPage === 'lancamentos' && (
          <FinancialPostings 
            accounts={accounts} 
            banks={banks} 
            paymentMethods={paymentMethods} 
            entities={favored} 
            onAddPosting={handleSavePosting} 
            editingPosting={editingPosting} 
            onCancelEdit={() => setEditingPosting(null)}
            xmlMappings={xmlMappings}
            onSaveXmlMappings={handleSaveXmlMappings}
            onAddMultiplePostings={handleAddMultiplePostings}
            onAddFavored={(newFavored) => setFavored(prev => [...prev, newFavored])}
            onRefresh={initData}
          />
        )}
        {currentPage === 'lista' && <PostingsList initialSearch={globalSearchFilter} postings={postings} accounts={accounts} banks={banks} paymentMethods={paymentMethods} entities={favored} onDeletePosting={handleDeletePosting} onEditPosting={handleEditPosting} />}
        {currentPage === 'conciliacao' && <Reconciliation banks={banks} onRefresh={initData} />}
        {currentPage === 'contas' && <AccountRegistration subgroups={subgroups} accounts={accounts} onAddAccount={handleAddAccount} onDeleteAccount={handleDeleteAccount} />}
        {currentPage === 'cadastros' && <GeneralRegistry banks={banks} paymentMethods={paymentMethods} favored={favored} onAddBank={handleAddBank} onDeleteBank={handleDeleteBank} onAddMethod={handleAddMethod} onDeleteMethod={handleDeleteMethod} onAddFavored={handleAddFavored} onDeleteFavored={handleDeleteFavored} onExport={handleExportData} onImport={handleImportData} onReload={handleReloadData} onReset={handleResetData} />}
        {currentPage === 'configuracoes' && <FinancialAssumptions banks={banks} />}
      </main>
      <footer className="fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-md border-t border-slate-800 py-3 text-center flex flex-col items-center justify-center gap-1">
        <p className="text-slate-500 text-[10px] tracking-widest font-bold uppercase">&copy; 2026 PROFIT FOOD</p>
      </footer>
    </div>
  );
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser({
          id: session.user.id,
          name: session.user.user_metadata?.name || session.user.email || '',
          email: session.user.email || '',
        });
      }
      setLoading(false);
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          name: session.user.user_metadata?.name || session.user.email || '',
          email: session.user.email || '',
        });
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = (loggedUser: User) => {
    setUser(loggedUser);
  };

  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    await supabase.auth.signOut();
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-6">
        <div className="w-16 h-16 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin"></div>
        <p className="text-slate-400 font-bold uppercase tracking-widest text-xs animate-pulse">Iniciando Profit Food...</p>
      </div>
    );
  }

  if (!user) return <Auth onLogin={handleLogin} />;

  return (
    <CompanyProvider user={user}>
      <AppContent user={user} onLogout={handleLogout} />
    </CompanyProvider>
  );
};

export default App;
