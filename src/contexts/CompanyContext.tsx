import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Company, User } from '../../types';

interface CompanyContextType {
  activeCompany: Company | null;
  loading: boolean;
  error: string | null;
  refreshCompany: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export const CompanyProvider: React.FC<{ children: React.ReactNode; user: User | null }> = ({ children, user }) => {
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActiveCompany = async () => {
    if (!user) {
      console.log('[CompanyContext] No user provided to CompanyProvider');
      setActiveCompany(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      console.log('[CompanyContext] Fetching active company for user:', user.id);

      // 1. Get company link from company_users (LIMIT 1)
      const { data: links, error: linkError } = await supabase
        .from('company_users')
        .select('company_id')
        .eq('user_id', user.id)
        .limit(1);

      if (linkError) {
        console.error('[CompanyContext] Error querying company_users:', linkError);
        throw linkError;
      }

      if (!links || links.length === 0) {
        console.warn('[CompanyContext] No company link found for user:', user.id);
        setError('Usuário não vinculado a nenhuma empresa.');
        setLoading(false);
        return;
      }

      const companyId = links[0].company_id;
      console.log('[CompanyContext] Found company_id:', companyId);

      // 2. Get company details from companies
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single();

      if (companyError) {
        console.error('[CompanyContext] Error querying companies:', companyError);
        throw companyError;
      }

      if (!companyData) {
        console.error('[CompanyContext] Company details not found for id:', companyId);
        setError('Detalhes da empresa não encontrados.');
        setLoading(false);
        return;
      }

      console.log('[CompanyContext] Active company loaded:', companyData.name);
      setActiveCompany(companyData);
    } catch (err: any) {
      console.error('[CompanyContext] Critical error fetching company:', err);
      setError(err.message || 'Erro ao carregar empresa ativa.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveCompany();
  }, [user?.id]);

  return (
    <CompanyContext.Provider value={{ activeCompany, loading, error, refreshCompany: fetchActiveCompany }}>
      {children}
    </CompanyContext.Provider>
  );
};

export const useActiveCompany = () => {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useActiveCompany must be used within a CompanyProvider');
  }
  return context;
};
