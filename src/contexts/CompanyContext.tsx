import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Company, User } from '../../types';

type PlanInfo = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
};

type FeatureCode = string;

interface CompanyContextType {
  activeCompany: Company | null;
  plan: PlanInfo | null;
  features: FeatureCode[];
  loading: boolean;
  error: string | null;
  refreshCompany: () => Promise<void>;
  hasFeature: (featureCode: FeatureCode) => boolean;
  isBasicPlan: boolean;
  isAdvancedPlan: boolean;
  isSystemAdmin: boolean;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export const CompanyProvider: React.FC<{ children: React.ReactNode; user: User | null }> = ({ children, user }) => {
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [features, setFeatures] = useState<FeatureCode[]>([]);
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resetContext = () => {
    setActiveCompany(null);
    setPlan(null);
    setFeatures([]);
    setIsSystemAdmin(false);
  };

  const fetchPlanFeatures = async (planId: string): Promise<FeatureCode[]> => {
    const { data, error: featuresError } = await supabase
      .from('plan_features')
      .select('features(code)')
      .eq('plan_id', planId);

    if (featuresError) {
      console.error('[CompanyContext] Error querying plan_features:', featuresError);
      throw featuresError;
    }

    return (data || [])
      .map((row: any) => row.features?.code)
      .filter((code: any): code is string => typeof code === 'string' && code.trim().length > 0);
  };

  const fetchSystemAdminStatus = async (userId: string): Promise<boolean> => {
    const { data, error: adminError } = await supabase
      .from('system_admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (adminError) {
      console.warn('[CompanyContext] Could not check system admin status:', adminError);
      return false;
    }

    return !!data;
  };

  const fetchActiveCompany = async () => {
    if (!user) {
      resetContext();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const adminStatus = await fetchSystemAdminStatus(user.id);
      setIsSystemAdmin(adminStatus);

      // 1. Get company link from company_users (LIMIT 1)
      const { data: links, error: linkError } = await supabase
        .from('company_users')
        .select('company_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1);

      if (linkError) {
        console.error('[CompanyContext] Error querying company_users:', linkError);
        throw linkError;
      }

      if (!links || links.length === 0) {
        console.warn('[CompanyContext] No company link found for user:', user.id);
        setActiveCompany(null);
        setPlan(null);
        setFeatures([]);
        setError('Usuário não vinculado a nenhuma empresa.');
        setLoading(false);
        return;
      }

      const companyId = links[0].company_id;

      // 2. Get company details from companies, including plan_id
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
        setActiveCompany(null);
        setPlan(null);
        setFeatures([]);
        setError('Detalhes da empresa não encontrados.');
        setLoading(false);
        return;
      }

      setActiveCompany(companyData as Company);

      const companyPlanId = (companyData as any).plan_id;

      if (!companyPlanId) {
        console.warn('[CompanyContext] Company has no plan_id:', companyId);
        setPlan(null);
        setFeatures([]);
        return;
      }

      // 3. Get plan details
      const { data: planData, error: planError } = await supabase
        .from('plans')
        .select('id, code, name, description')
        .eq('id', companyPlanId)
        .single();

      if (planError) {
        console.error('[CompanyContext] Error querying plans:', planError);
        throw planError;
      }

      if (!planData) {
        console.warn('[CompanyContext] Plan not found for company:', companyId);
        setPlan(null);
        setFeatures([]);
        return;
      }

      setPlan(planData as PlanInfo);

      // 4. Get allowed features for the plan
      const allowedFeatures = await fetchPlanFeatures(planData.id);
      setFeatures(allowedFeatures);
    } catch (err: any) {
      console.error('[CompanyContext] Critical error fetching company:', err);
      resetContext();
      setError(err.message || 'Erro ao carregar empresa ativa.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveCompany();
  }, [user?.id]);

  const hasFeature = (featureCode: FeatureCode): boolean => {
    return features.includes(featureCode);
  };

  const isBasicPlan = plan?.code === 'BASICO';
  const isAdvancedPlan = plan?.code === 'AVANCADO';

  return (
    <CompanyContext.Provider
      value={{
        activeCompany,
        plan,
        features,
        loading,
        error,
        refreshCompany: fetchActiveCompany,
        hasFeature,
        isBasicPlan,
        isAdvancedPlan,
        isSystemAdmin,
      }}
    >
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
