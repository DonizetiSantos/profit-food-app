
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20 selection:bg-rose-500/30">
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col lg:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center pointer-events-none">
              <svg viewBox="0 0 100 100" className="w-full h-full text-rose-500 fill-current">
                 <path d="M20,10 L70,10 C85,10 95,25 95,40 C95,55 85,70 70,70 L40,70 L40,95 L20,95 L20,10 Z M40,30 L40,50 L70,50 C75,50 80,45 80,40 C80,35 75,30 70,30 L40,30 Z" />
              </svg>
            </div>
            <div className="flex flex-col">
              <div className="flex items-baseline gap-3">
                <span className="text-xl font-black text-white leading-none tracking-tight uppercase">PROFIT FOOD</span>
                <span className="text-[11px] font-black text-rose-500 uppercase tracking-widest bg-rose-500/10 px-3 py-1 rounded-lg border border-rose-500/20">
                  {activeCompany.name}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[9px] font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  Olá, {user.name.split(' ')[0]} {syncing && <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping"></span>}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <nav className="flex bg-slate-950/50 p-1 rounded-2xl border border-slate-800 overflow-x-auto no-scrollbar">
              {['dashboard', 'dre', 'lancamentos', 'lista', 'conciliacao', 'contas', 'cadastros', 'configuracoes'].map(id => (
                <button 
                  key={id} type="button" onClick={() => {
                    if (id === 'lista') setGlobalSearchFilter('');
                    setCurrentPage(id as any);
                  }} 
                  className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all ${currentPage === id ? 'bg-slate-800 text-rose-500 shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {id === 'dashboard' ? 'Painel do Dono' : id === 'contas' ? 'Plano' : id === 'lista' ? 'Registros' : id === 'conciliacao' ? 'Conciliação' : id === 'configuracoes' ? 'Configurações' : id === 'lancamentos' ? 'Lançamentos' : id}
                </button>
              ))}
            </nav>
            <button onClick={onLogout} className="relative z-[100] p-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-all cursor-pointer min-w-[50px] min-h-[50px] shadow-2xl">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
            </button>
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
