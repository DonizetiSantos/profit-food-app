import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../src/lib/supabase';

type PlanRow = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
};

type CompanyUser = {
  email: string;
  role: string;
};

type AdminCompanyRow = {
  company_id: string;
  company_name: string;
  company_email: string | null;
  subscription_status: string;
  is_active: boolean;
  plan_id: string | null;
  plan_code: string | null;
  plan_name: string | null;
  users: CompanyUser[];
};

type Props = {
  onCompanyUpdated?: () => Promise<void> | void;
};

const statusLabel: Record<string, string> = {
  active: 'Ativo',
  trial: 'Teste',
  blocked: 'Bloqueado',
  expired: 'Expirado',
};

const statusClass: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  trial: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  blocked: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  expired: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

export const AdminCompanies: React.FC<Props> = ({ onCompanyUpdated }) => {
  const [companies, setCompanies] = useState<AdminCompanyRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCompanyId, setSavingCompanyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [{ data: companiesData, error: companiesError }, { data: plansData, error: plansError }] = await Promise.all([
        supabase.rpc('admin_list_companies'),
        supabase.from('plans').select('id, code, name, description').order('name'),
      ]);

      if (companiesError) throw companiesError;
      if (plansError) throw plansError;

      setCompanies((companiesData || []) as AdminCompanyRow[]);
      setPlans((plansData || []) as PlanRow[]);
    } catch (err: any) {
      console.error('[AdminCompanies] Erro ao carregar administração:', err);
      setError(err.message || 'Erro ao carregar empresas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredCompanies = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return companies;

    return companies.filter((company) => {
      const usersText = (company.users || []).map((user) => user.email).join(' ');
      return [company.company_name, company.company_email, company.plan_name, usersText]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalized);
    });
  }, [companies, search]);

  const handlePlanChange = async (companyId: string, newPlanId: string) => {
    if (!newPlanId) return;

    setSavingCompanyId(companyId);
    setError(null);

    try {
      const { error: updateError } = await supabase.rpc('admin_update_company_plan', {
        target_company_id: companyId,
        target_plan_id: newPlanId,
      });

      if (updateError) throw updateError;

      await loadData();
      await onCompanyUpdated?.();
    } catch (err: any) {
      console.error('[AdminCompanies] Erro ao alterar plano:', err);
      setError(err.message || 'Erro ao alterar plano da empresa.');
    } finally {
      setSavingCompanyId(null);
    }
  };

  const totalBasic = companies.filter((company) => company.plan_code === 'BASICO').length;
  const totalAdvanced = companies.filter((company) => company.plan_code === 'AVANCADO').length;
  const totalWithoutPlan = companies.filter((company) => !company.plan_id).length;

  if (loading) {
    return (
      <div className="min-h-[420px] flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
        <p className="text-slate-400 text-xs font-black uppercase tracking-widest">Carregando administração...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <p className="text-rose-500 text-xs font-black uppercase tracking-[0.25em] mb-2">Administração</p>
          <h1 className="text-3xl font-black text-white uppercase tracking-tight">Empresas e Planos</h1>
          <p className="text-slate-400 text-sm mt-2 max-w-3xl">
            Visualize as empresas cadastradas, os usuários vinculados e altere o plano contratado.
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all"
        >
          Atualizar
        </button>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-2xl px-4 py-3 text-sm font-bold">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5">
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Empresas</p>
          <p className="text-3xl font-black text-white mt-2">{companies.length}</p>
        </div>
        <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5">
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Plano Básico</p>
          <p className="text-3xl font-black text-emerald-400 mt-2">{totalBasic}</p>
        </div>
        <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5">
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Plano Avançado</p>
          <p className="text-3xl font-black text-sky-400 mt-2">{totalAdvanced}</p>
        </div>
        <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5">
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Sem Plano</p>
          <p className="text-3xl font-black text-amber-400 mt-2">{totalWithoutPlan}</p>
        </div>
      </div>

      <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-4">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por empresa, e-mail ou plano..."
          className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500/50"
        />
      </div>

      <div className="bg-slate-900/70 border border-slate-800 rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left">
            <thead className="bg-slate-950/70 border-b border-slate-800">
              <tr>
                <th className="px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Empresa</th>
                <th className="px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Usuários</th>
                <th className="px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                <th className="px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Plano</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredCompanies.map((company) => (
                <tr key={company.company_id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-4 align-top">
                    <div className="font-black text-white uppercase tracking-tight">{company.company_name}</div>
                    <div className="text-xs text-slate-500 mt-1">{company.company_email || 'Sem e-mail comercial'}</div>
                  </td>
                  <td className="px-5 py-4 align-top">
                    <div className="space-y-1">
                      {(company.users || []).length > 0 ? (
                        company.users.map((user, index) => (
                          <div key={`${company.company_id}-${user.email}-${index}`} className="text-xs">
                            <span className="text-slate-200 font-bold">{user.email}</span>
                            <span className="ml-2 text-[10px] text-slate-500 uppercase font-black">{user.role}</span>
                          </div>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500">Sem usuário vinculado</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 align-top">
                    <span className={`inline-flex px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${statusClass[company.subscription_status] || 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                      {statusLabel[company.subscription_status] || company.subscription_status}
                    </span>
                    <div className="text-[10px] text-slate-500 font-bold mt-2 uppercase">
                      {company.is_active ? 'Empresa ativa' : 'Empresa inativa'}
                    </div>
                  </td>
                  <td className="px-5 py-4 align-top">
                    <select
                      value={company.plan_id || ''}
                      disabled={savingCompanyId === company.company_id}
                      onChange={(event) => handlePlanChange(company.company_id, event.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-rose-500/50 disabled:opacity-50"
                    >
                      <option value="" disabled>Selecionar plano</option>
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>{plan.name}</option>
                      ))}
                    </select>
                    {savingCompanyId === company.company_id && (
                      <p className="text-[10px] text-rose-400 font-black uppercase mt-2">Salvando...</p>
                    )}
                  </td>
                </tr>
              ))}

              {filteredCompanies.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-slate-500 text-sm font-bold">
                    Nenhuma empresa encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
