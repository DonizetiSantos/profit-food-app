import React, { useEffect, useMemo, useState } from 'react';
import { PaymentSettlementRule, Bank } from '../types';
import { supabase } from '../src/lib/supabase';
import { useActiveCompany } from '../src/contexts/CompanyContext';
import BankOpeningBalances from './BankOpeningBalances';

interface Props {
  banks: Bank[];
}

type PaymentMethodRow = {
  id: string;
  name: string;
};

type RuleRow = PaymentSettlementRule & {
  payment_methods?: {
    name: string;
  } | null;
  isNew?: boolean;
  isSpecificDraft?: boolean;
};

type TabKey = 'general' | 'cards' | 'balances';

const TAB_LABELS: Record<TabKey, string> = {
  general: 'Premissas Gerais',
  cards: 'Regras de Cartões',
  balances: 'Saldos Iniciais',
};

const normalizeText = (value: string | null | undefined) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const CARD_CORE_METHOD_SET = new Set([
  normalizeText('CARTÃO CRÉDITO'),
  normalizeText('CARTÃO DÉBITO'),
]);

const sortRules = (items: RuleRow[]) => {
  return [...items].sort((a, b) => {
    const methodCompare = (a.payment_methods?.name || '').localeCompare(
      b.payment_methods?.name || '',
      'pt-BR'
    );
    if (methodCompare !== 0) return methodCompare;

    const aSpecificity = `${a.card_brand || ''} ${a.acquirer_name || ''}`.trim();
    const bSpecificity = `${b.card_brand || ''} ${b.acquirer_name || ''}`.trim();

    if (!aSpecificity && bSpecificity) return -1;
    if (aSpecificity && !bSpecificity) return 1;

    return aSpecificity.localeCompare(bSpecificity, 'pt-BR');
  });
};

const ScrollTableShell: React.FC<{ children: React.ReactNode; minWidth: string }> = ({ children, minWidth }) => {
  return (
    <div className="bg-slate-900 rounded-[2rem] border border-slate-800 overflow-hidden shadow-2xl">
      <div className="overflow-auto custom-scrollbar max-h-[68vh]">
        <div style={{ minWidth }}>{children}</div>
      </div>
    </div>
  );
};

export const FinancialAssumptions: React.FC<Props> = ({ banks }) => {
  const { activeCompany } = useActiveCompany();
  const [activeTab, setActiveTab] = useState<TabKey>('general');
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cleaningLegacy, setCleaningLegacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const getMethodName = (rule: RuleRow) =>
    rule.payment_methods?.name ||
    paymentMethods.find((method) => method.id === rule.payment_method_id)?.name ||
    'Desconhecido';

  const hasKnownPaymentMethod = (rule: RuleRow) => {
    const methodName = getMethodName(rule);
    return !!rule.payment_method_id && normalizeText(methodName) !== normalizeText('Desconhecido');
  };

  const isCardMethodRule = (rule: RuleRow) => CARD_CORE_METHOD_SET.has(normalizeText(getMethodName(rule)));

  const isSpecificCardRule = (rule: RuleRow) =>
    isCardMethodRule(rule) &&
    (
      !!normalizeText(rule.card_brand) ||
      !!normalizeText(rule.acquirer_name) ||
      !!rule.isSpecificDraft
    );

  useEffect(() => {
    const loadData = async () => {
      if (!activeCompany) {
        setRules([]);
        setPaymentMethods([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const { data: rulesData, error: rulesError } = await supabase
          .from('payment_settlement_rules')
          .select('*, payment_methods(name)')
          .eq('company_id', activeCompany.id)
          .eq('is_active', true)
          .order('created_at', { ascending: true });

        if (rulesError) throw rulesError;

        const { data: methodsData, error: methodsError } = await supabase
          .from('payment_methods')
          .select('id, name')
          .eq('company_id', activeCompany.id)
          .order('name', { ascending: true });

        if (methodsError) throw methodsError;

        const loadedMethods: PaymentMethodRow[] = (methodsData as PaymentMethodRow[]) || [];
        setPaymentMethods(loadedMethods);

        const existingRules: RuleRow[] = ((rulesData as RuleRow[]) || []).map((rule) => ({
          ...rule,
          card_brand: rule.card_brand || '',
          acquirer_name: rule.acquirer_name || '',
          notes: rule.notes || '',
          payment_methods: rule.payment_methods || { name: 'Desconhecido' },
          isNew: false,
          isSpecificDraft: false,
        }));

        const baseMethods = loadedMethods;
        const genericRuleMethodIds = new Set(
          existingRules
            .filter((rule) => !rule.card_brand && !rule.acquirer_name)
            .map((rule) => rule.payment_method_id)
        );

        const missingGenericRules: RuleRow[] = baseMethods
          .filter((method) => !genericRuleMethodIds.has(method.id))
          .map((method) => ({
            id: crypto.randomUUID(),
            company_id: activeCompany.id,
            payment_method_id: method.id,
            settlement_days: 0,
            receives_same_day: false,
            default_status: 'PROVISIONADO',
            fee_percent: 0,
            fee_fixed: 0,
            default_bank_id: null,
            card_brand: '',
            acquirer_name: '',
            notes: '',
            is_active: true,
            payment_methods: { name: method.name },
            isNew: true,
            isSpecificDraft: false,
          }));

        setRules(sortRules([...existingRules, ...missingGenericRules]));
      } catch (err: any) {
        console.error('Erro ao carregar premissas:', err);
        setError(err?.message || 'Não foi possível carregar as premissas financeiras.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [activeCompany]);

  const genericRules = useMemo(() => {
    return sortRules(
      rules.filter(
        (rule) =>
          hasKnownPaymentMethod(rule) &&
          !normalizeText(rule.card_brand) &&
          !normalizeText(rule.acquirer_name) &&
          !rule.isSpecificDraft
      )
    );
  }, [rules, paymentMethods]);

  const genericCardRules = useMemo(() => {
    return sortRules(genericRules.filter((rule) => isCardMethodRule(rule)));
  }, [genericRules]);

  const cardSpecificRules = useMemo(() => {
    return sortRules(
      rules.filter((rule) => hasKnownPaymentMethod(rule) && isSpecificCardRule(rule))
    );
  }, [rules, paymentMethods]);

  const legacyRules = useMemo(() => {
    return sortRules(
      rules.filter(
        (rule) =>
          hasKnownPaymentMethod(rule) &&
          !isCardMethodRule(rule) &&
          (
            !!normalizeText(rule.card_brand) ||
            !!normalizeText(rule.acquirer_name) ||
            !!rule.isSpecificDraft
          )
      )
    );
  }, [rules, paymentMethods]);

  const legacyGenericRules = useMemo(() => {
    return legacyRules.filter(
      (rule) => !normalizeText(rule.card_brand) && !normalizeText(rule.acquirer_name)
    );
  }, [legacyRules]);

  const handleUpdateRule = (id: string, field: keyof RuleRow, value: any) => {
    setRules((prev) =>
      prev.map((rule) => {
        if (rule.id !== id) return rule;

        const nextRule = { ...rule, [field]: value };
        if (field === 'card_brand' || field === 'acquirer_name') {
          const hasSpecificData =
            !!normalizeText(field === 'card_brand' ? value : nextRule.card_brand) ||
            !!normalizeText(field === 'acquirer_name' ? value : nextRule.acquirer_name);
          nextRule.isSpecificDraft = hasSpecificData ? true : !!rule.isSpecificDraft;
        }
        return nextRule;
      })
    );
    setSuccess(false);
    setError(null);
  };

  const handleAddSpecificRule = (baseRule: RuleRow) => {
    if (!activeCompany) return;

    const methodName = getMethodName(baseRule);
    const alreadyHasBlankDraft = rules.some(
      (rule) =>
        rule.payment_method_id === baseRule.payment_method_id &&
        !!rule.isSpecificDraft &&
        !normalizeText(rule.card_brand) &&
        !normalizeText(rule.acquirer_name)
    );

    if (alreadyHasBlankDraft) {
      setActiveTab('cards');
      setError('Já existe uma nova regra específica em aberto para esse meio. Preencha bandeira e/ou operadora antes de criar outra.');
      setSuccess(false);
      return;
    }

    const newRule: RuleRow = {
      id: crypto.randomUUID(),
      company_id: activeCompany.id,
      payment_method_id: baseRule.payment_method_id,
      settlement_days: Number(baseRule.settlement_days) || 0,
      receives_same_day: !!baseRule.receives_same_day,
      default_status: baseRule.default_status || 'PROVISIONADO',
      fee_percent: Number(baseRule.fee_percent) || 0,
      fee_fixed: Number(baseRule.fee_fixed) || 0,
      default_bank_id: baseRule.default_bank_id || null,
      card_brand: '',
      acquirer_name: '',
      notes: '',
      is_active: true,
      payment_methods: { name: methodName },
      isNew: true,
      isSpecificDraft: true,
    };

    setRules((prev) => sortRules([...prev, newRule]));
    setActiveTab('cards');
    setSuccess(false);
    setError('Nova regra específica criada. Preencha a bandeira e/ou a operadora antes de salvar.');
  };

  const handleRemoveUnsavedRule = (id: string) => {
    setRules((prev) => prev.filter((rule) => rule.id !== id));
    setSuccess(false);
    setError(null);
  };

  const handleDeleteSavedRule = async (id: string) => {
    const confirmed = window.confirm('Deseja desativar esta regra salva?');
    if (!confirmed) return;

    setRules((prev) => prev.filter((rule) => rule.id !== id));
    setSuccess(false);
    setError(null);

    try {
      const { error: deactivateError } = await supabase
        .from('payment_settlement_rules')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (deactivateError) throw deactivateError;
    } catch (err: any) {
      console.error('Erro ao desativar regra:', err);
      setError(err?.message || 'Não foi possível desativar a regra.');
    }
  };

  const handleDeactivateLegacyRules = async () => {
    if (!activeCompany || legacyRules.length === 0) return;

    const confirmed = window.confirm(
      'Isso vai desativar todas as regras fora do padrão atual. Deseja continuar?'
    );
    if (!confirmed) return;

    setCleaningLegacy(true);
    setError(null);
    setSuccess(false);

    try {
      const savedLegacyIds = legacyRules.filter((rule) => !rule.isNew).map((rule) => rule.id);

      if (savedLegacyIds.length > 0) {
        const { error: deactivateError } = await supabase
          .from('payment_settlement_rules')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .in('id', savedLegacyIds);

        if (deactivateError) throw deactivateError;
      }

      setRules((prev) => prev.filter((rule) => !legacyRules.some((legacyRule) => legacyRule.id === rule.id)));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error('Erro ao limpar regras legadas:', err);
      setError(err?.message || 'Não foi possível desativar as regras legadas.');
    } finally {
      setCleaningLegacy(false);
    }
  };

  const validateRules = (rows: RuleRow[]) => {
    const duplicateKeys = new Set<string>();
    const seenKeys = new Set<string>();

    for (const rule of rows) {
      if (!hasKnownPaymentMethod(rule)) continue;

      const ruleIsSpecificCard = isSpecificCardRule(rule);

      if (ruleIsSpecificCard) {
        const hasBrand = !!normalizeText(rule.card_brand);
        const hasAcquirer = !!normalizeText(rule.acquirer_name);

        if (!hasBrand && !hasAcquirer) {
          throw new Error(
            `A regra específica de ${getMethodName(rule)} precisa ter pelo menos bandeira ou operadora preenchida.`
          );
        }
      }

      if (!isCardMethodRule(rule) && (!!normalizeText(rule.card_brand) || !!normalizeText(rule.acquirer_name))) {
        throw new Error(
          `O meio ${getMethodName(rule)} não aceita bandeira ou operadora. Regras específicas são apenas para cartões.`
        );
      }

      const key = [
        rule.payment_method_id,
        normalizeText(rule.card_brand),
        normalizeText(rule.acquirer_name),
      ].join('|');

      if (seenKeys.has(key)) {
        duplicateKeys.add(key);
      }
      seenKeys.add(key);
    }

    if (duplicateKeys.size > 0) {
      throw new Error('Existem regras duplicadas com o mesmo meio, bandeira e operadora.');
    }
  };

  const handleSave = async () => {
    if (!activeCompany) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      validateRules(rules);
      const now = new Date().toISOString();

      const { data: existingRows, error: existingRowsError } = await supabase
        .from('payment_settlement_rules')
        .select('id, payment_method_id, card_brand, acquirer_name, created_at')
        .eq('company_id', activeCompany.id);

      if (existingRowsError) throw existingRowsError;

      const buildRuleKey = (paymentMethodId: string, cardBrand?: string | null, acquirerName?: string | null) =>
        [
          paymentMethodId,
          normalizeText(cardBrand),
          normalizeText(acquirerName),
        ].join('|');

      type ExistingRuleRow = {
        id: string;
        payment_method_id: string;
        card_brand: string | null;
        acquirer_name: string | null;
        created_at: string | null;
      };

      const existingRowsTyped: ExistingRuleRow[] = (existingRows as ExistingRuleRow[]) || [];

      const existingById = new Map(
        existingRowsTyped.map((row) => [row.id, row])
      );

      const existingIdByCompositeKey = new Map(
        existingRowsTyped.map((row) => [
          buildRuleKey(row.payment_method_id, row.card_brand, row.acquirer_name),
          row.id,
        ])
      );

      const payload = rules
        .filter((rule) => hasKnownPaymentMethod(rule) && !legacyRules.some((legacyRule) => legacyRule.id === rule.id))
        .map(({ payment_methods, isNew, isSpecificDraft, ...rule }) => {
          const isCardRule = isCardMethodRule({ ...rule, payment_methods } as RuleRow);

          const normalizedCardBrand = isCardRule
            ? ((rule.card_brand || '').trim() || null)
            : null;

          const normalizedAcquirerName = isCardRule
            ? ((rule.acquirer_name || '').trim() || null)
            : null;

          const compositeKey = buildRuleKey(
            rule.payment_method_id,
            normalizedCardBrand,
            normalizedAcquirerName
          );

          const existingIdForSameComposite = existingIdByCompositeKey.get(compositeKey);

          const persistedId =
            existingById.has(rule.id)
              ? rule.id
              : (existingIdForSameComposite || rule.id);

          const existingPersistedRow = existingById.get(persistedId);

          return {
            id: persistedId,
            company_id: activeCompany.id,
            payment_method_id: rule.payment_method_id,
            settlement_days: Number(rule.settlement_days) || 0,
            receives_same_day: !!rule.receives_same_day,
            default_status: rule.default_status,
            fee_percent: Number(rule.fee_percent) || 0,
            fee_fixed: Number(rule.fee_fixed) || 0,
            default_bank_id: rule.default_bank_id || null,
            card_brand: normalizedCardBrand,
            acquirer_name: normalizedAcquirerName,
            notes: rule.notes || '',
            is_active: rule.is_active ?? true,
            created_at: existingPersistedRow?.created_at || now,
            updated_at: now,
          };
        });

      if (payload.length > 0) {
        const { error: saveError } = await supabase
          .from('payment_settlement_rules')
          .upsert(payload, { onConflict: 'id' });

        if (saveError) throw saveError;
      }

      const refreshedExistingById = new Map(
        payload.map((row) => [
          row.id,
          {
            id: row.id,
            payment_method_id: row.payment_method_id,
            card_brand: row.card_brand,
            acquirer_name: row.acquirer_name,
            created_at: row.created_at,
          },
        ])
      );

      const refreshedExistingIdByCompositeKey = new Map(
        payload.map((row) => [
          buildRuleKey(row.payment_method_id, row.card_brand, row.acquirer_name),
          row.id,
        ])
      );

      setRules((prev) =>
        sortRules(
          prev
            .filter((rule) => hasKnownPaymentMethod(rule) && !legacyRules.some((legacyRule) => legacyRule.id === rule.id))
            .map((rule) => {
              const isCardRule = isCardMethodRule(rule);
              const normalizedCardBrand = isCardRule ? ((rule.card_brand || '').trim() || null) : null;
              const normalizedAcquirerName = isCardRule ? ((rule.acquirer_name || '').trim() || null) : null;

              const compositeKey = buildRuleKey(
                rule.payment_method_id,
                normalizedCardBrand,
                normalizedAcquirerName
              );

              const persistedId =
                refreshedExistingById.has(rule.id)
                  ? rule.id
                  : (refreshedExistingIdByCompositeKey.get(compositeKey) || rule.id);

              return {
                ...rule,
                id: persistedId,
                card_brand: normalizedCardBrand || '',
                acquirer_name: normalizedAcquirerName || '',
                isNew: false,
                isSpecificDraft: false,
              };
            })
        )
      );

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error('Erro ao salvar premissas:', err);
      const databaseMessage = err?.message || err?.details || err?.hint || 'Erro desconhecido ao salvar premissas financeiras.';
      setError(`Erro ao salvar as alterações: ${databaseMessage}`);
    } finally {
      setSaving(false);
    }
  };

  const renderGeneralTable = () => (
    <div className="space-y-4">
      {legacyGenericRules.length > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-400 mb-2">Cadastros fora do padrão</p>
            <p className="text-sm text-amber-100 leading-relaxed">
              Existem regras fora do padrão atual. Regras específicas com bandeira e operadora devem existir apenas para cartão crédito e cartão débito. Os demais meios ficam aqui mesmo como regra genérica configurável.
            </p>
          </div>
          <button
            onClick={handleDeactivateLegacyRules}
            disabled={cleaningLegacy}
            className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
              cleaningLegacy ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30'
            }`}
          >
            {cleaningLegacy ? 'Limpando...' : 'Desativar regras fora do padrão'}
          </button>
        </div>
      )}

      <ScrollTableShell minWidth="980px">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-20">
            <tr className="bg-slate-950 text-slate-500 text-[8px] uppercase tracking-[0.18em] font-black border-b border-slate-800">
              <th className="px-6 py-4">Meio de Pagamento</th>
              <th className="px-3 py-4 text-center">Prazo</th>
              <th className="px-3 py-4 text-center">Mesmo Dia?</th>
              <th className="px-3 py-4 text-center">Status</th>
              <th className="px-3 py-4 text-center">Taxa %</th>
              <th className="px-3 py-4 text-center">Taxa Fixa</th>
              <th className="px-4 py-4">Observações</th>
              <th className="px-4 py-4 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {genericRules.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-10 text-center text-sm font-semibold text-slate-500">
                  Nenhum meio de pagamento configurável encontrado ainda.
                </td>
              </tr>
            ) : genericRules.map((rule) => (
              <tr key={rule.id} className="hover:bg-slate-800/20 transition-colors">
                <td className="px-6 py-4 align-middle">
                  <div className="flex flex-col gap-0.5 leading-tight">
                    <span className="text-[11px] font-black text-slate-200 uppercase tracking-tight">{getMethodName(rule)}</span>
                    <span className="text-[8px] font-black uppercase tracking-widest text-cyan-400">Regra Genérica</span>
                  </div>
                </td>

                <td className="px-3 py-4 text-center">
                  <input
                    type="number"
                    value={rule.settlement_days}
                    onChange={(e) => handleUpdateRule(rule.id, 'settlement_days', parseInt(e.target.value, 10) || 0)}
                    className="w-16 bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-[11px] font-bold text-slate-300 outline-none focus:border-rose-500 transition-all text-center"
                  />
                </td>

                <td className="px-3 py-4 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <button
                      onClick={() => handleUpdateRule(rule.id, 'receives_same_day', !rule.receives_same_day)}
                      className={`w-11 h-5 rounded-full p-0.5 transition-all duration-300 relative ${rule.receives_same_day ? 'bg-rose-600' : 'bg-slate-800'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 ${rule.receives_same_day ? 'translate-x-6' : 'translate-x-0'}`}></div>
                    </button>
                    {rule.receives_same_day && <span className="text-[7px] font-black text-rose-500 uppercase tracking-tighter">D+0</span>}
                  </div>
                </td>

                <td className="px-3 py-4 text-center">
                  <select
                    value={rule.default_status}
                    onChange={(e) => handleUpdateRule(rule.id, 'default_status', e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-[9px] font-black text-slate-300 outline-none focus:border-rose-500 transition-all uppercase tracking-wider w-[132px]"
                  >
                    <option value="LIQUIDADO">LIQUIDADO</option>
                    <option value="PROVISIONADO">PROVISIONADO</option>
                  </select>
                </td>

                <td className="px-3 py-4 text-center">
                  <input
                    type="number"
                    step="0.01"
                    value={rule.fee_percent}
                    onChange={(e) => handleUpdateRule(rule.id, 'fee_percent', parseFloat(e.target.value) || 0)}
                    className="w-16 bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-[11px] font-bold text-slate-300 outline-none focus:border-rose-500 transition-all text-center"
                  />
                </td>

                <td className="px-3 py-4 text-center">
                  <input
                    type="number"
                    step="0.01"
                    value={rule.fee_fixed}
                    onChange={(e) => handleUpdateRule(rule.id, 'fee_fixed', parseFloat(e.target.value) || 0)}
                    className="w-16 bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-[11px] font-bold text-slate-300 outline-none focus:border-rose-500 transition-all text-center"
                  />
                </td>

                <td className="px-4 py-4">
                  <input
                    type="text"
                    value={rule.notes || ''}
                    onChange={(e) => handleUpdateRule(rule.id, 'notes', e.target.value)}
                    placeholder="Notas..."
                    className="w-full min-w-[150px] bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-[11px] font-medium text-slate-400 outline-none focus:border-rose-500 transition-all"
                  />
                </td>

                <td className="px-4 py-4 text-center">
                  {isCardMethodRule(rule) ? (
                    <button
                      onClick={() => handleAddSpecificRule(rule)}
                      className="px-2.5 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest bg-slate-800 hover:bg-slate-700 text-cyan-400 transition-all whitespace-nowrap"
                    >
                      + Regra específica
                    </button>
                  ) : (
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollTableShell>
    </div>
  );

  const renderCardsTable = () => (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 px-5 py-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-400 mb-2">Atalhos para criar regras específicas</p>
            <p className="text-sm text-slate-300 leading-relaxed">
              Use os botões abaixo para abrir uma nova regra específica a partir da regra genérica do cartão. Depois preencha bandeira, operadora e ajuste o que precisar.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {genericCardRules.length === 0 ? (
              <span className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-500">
                Cadastre primeiro a regra genérica dos cartões
              </span>
            ) : (
              genericCardRules.map((rule) => (
                <button
                  key={rule.id}
                  onClick={() => handleAddSpecificRule(rule)}
                  className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-black uppercase tracking-wider transition-all"
                >
                  + {getMethodName(rule)}
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      <ScrollTableShell minWidth="1280px">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-20">
            <tr className="bg-slate-950 text-slate-500 text-[8px] uppercase tracking-[0.18em] font-black border-b border-slate-800">
              <th className="px-6 py-4">Meio</th>
              <th className="px-3 py-4 text-center">Bandeira</th>
              <th className="px-3 py-4 text-center">Operadora</th>
              <th className="px-3 py-4 text-center">Prazo</th>
              <th className="px-3 py-4 text-center">Mesmo Dia?</th>
              <th className="px-3 py-4 text-center">Status</th>
              <th className="px-3 py-4 text-center">Taxa %</th>
              <th className="px-3 py-4 text-center">Taxa Fixa</th>
              <th className="px-4 py-4">Observações</th>
              <th className="px-4 py-4 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {cardSpecificRules.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-6 py-10 text-center text-sm font-semibold text-slate-500">
                  Nenhuma regra específica de cartão cadastrada ainda. Use os atalhos acima para criar a primeira.
                </td>
              </tr>
            ) : (
              cardSpecificRules.map((rule) => (
                <tr key={rule.id} className="hover:bg-slate-800/20 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-0.5 leading-tight">
                      <span className="text-[11px] font-black text-slate-200 uppercase tracking-tight">{getMethodName(rule)}</span>
                      <span className="text-[8px] font-black uppercase tracking-widest text-amber-400">Regra Específica</span>
                    </div>
                  </td>

                  <td className="px-3 py-4 text-center">
                    <input
                      type="text"
                      value={rule.card_brand || ''}
                      onChange={(e) => handleUpdateRule(rule.id, 'card_brand', e.target.value.toUpperCase())}
                      autoComplete="off"
                      name={`card-brand-${rule.id}`}
                      className="w-24 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-[11px] font-bold text-slate-300 outline-none focus:border-rose-500 transition-all text-center uppercase"
                    />
                  </td>

                  <td className="px-3 py-4 text-center">
                    <input
                      type="text"
                      value={rule.acquirer_name || ''}
                      onChange={(e) => handleUpdateRule(rule.id, 'acquirer_name', e.target.value.toUpperCase())}
                      autoComplete="off"
                      name={`acquirer-name-${rule.id}`}
                      className="w-28 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-[11px] font-bold text-slate-300 outline-none focus:border-rose-500 transition-all text-center uppercase"
                    />
                  </td>

                  <td className="px-3 py-4 text-center">
                    <input
                      type="number"
                      value={rule.settlement_days}
                      onChange={(e) => handleUpdateRule(rule.id, 'settlement_days', parseInt(e.target.value, 10) || 0)}
                      className="w-16 bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-[11px] font-bold text-slate-300 outline-none focus:border-rose-500 transition-all text-center"
                    />
                  </td>

                  <td className="px-3 py-4 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <button
                        onClick={() => handleUpdateRule(rule.id, 'receives_same_day', !rule.receives_same_day)}
                        className={`w-11 h-5 rounded-full p-0.5 transition-all duration-300 relative ${rule.receives_same_day ? 'bg-rose-600' : 'bg-slate-800'}`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 ${rule.receives_same_day ? 'translate-x-6' : 'translate-x-0'}`}></div>
                      </button>
                      {rule.receives_same_day && <span className="text-[7px] font-black text-rose-500 uppercase tracking-tighter">D+0</span>}
                    </div>
                  </td>

                  <td className="px-3 py-4 text-center">
                    <select
                      value={rule.default_status}
                      onChange={(e) => handleUpdateRule(rule.id, 'default_status', e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-[9px] font-black text-slate-300 outline-none focus:border-rose-500 transition-all uppercase tracking-wider w-[132px]"
                    >
                      <option value="LIQUIDADO">LIQUIDADO</option>
                      <option value="PROVISIONADO">PROVISIONADO</option>
                    </select>
                  </td>

                  <td className="px-3 py-4 text-center">
                    <input
                      type="number"
                      step="0.01"
                      value={rule.fee_percent}
                      onChange={(e) => handleUpdateRule(rule.id, 'fee_percent', parseFloat(e.target.value) || 0)}
                      className="w-16 bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-[11px] font-bold text-slate-300 outline-none focus:border-rose-500 transition-all text-center"
                    />
                  </td>

                  <td className="px-3 py-4 text-center">
                    <input
                      type="number"
                      step="0.01"
                      value={rule.fee_fixed}
                      onChange={(e) => handleUpdateRule(rule.id, 'fee_fixed', parseFloat(e.target.value) || 0)}
                      className="w-16 bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-[11px] font-bold text-slate-300 outline-none focus:border-rose-500 transition-all text-center"
                    />
                  </td>

                  <td className="px-4 py-4">
                    <input
                      type="text"
                      value={rule.notes || ''}
                      onChange={(e) => handleUpdateRule(rule.id, 'notes', e.target.value)}
                      placeholder="Notas..."
                      className="w-full min-w-[150px] bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-[11px] font-medium text-slate-400 outline-none focus:border-rose-500 transition-all"
                    />
                  </td>

                  <td className="px-4 py-4 text-center">
                    {rule.isNew ? (
                      <button
                        onClick={() => handleRemoveUnsavedRule(rule.id)}
                        className="px-2.5 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest bg-slate-950 hover:bg-slate-900 text-rose-400 transition-all whitespace-nowrap border border-slate-800"
                      >
                        Remover
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDeleteSavedRule(rule.id)}
                        className="px-2.5 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest bg-slate-950 hover:bg-slate-900 text-rose-400 transition-all whitespace-nowrap border border-slate-800"
                      >
                        Excluir
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ScrollTableShell>
    </div>
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-14 h-14 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin"></div>
        <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest animate-pulse">Carregando premissas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight uppercase">Premissas Financeiras</h2>
          <p className="text-slate-500 text-sm font-medium">Configure regras gerais, regras específicas de cartões e saldos iniciais sem misturar contextos.</p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || rules.length === 0}
          className={`flex items-center gap-2 px-7 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-xl ${saving || rules.length === 0 ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20'}`}
        >
          {saving ? (
            <>
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              Salvando...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              Salvar Alterações
            </>
          )}
        </button>
      </header>

      {error && <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-500 text-xs font-bold flex items-center gap-3 animate-shake">{error}</div>}
      {success && <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-500 text-xs font-bold flex items-center gap-3 animate-fade-in">Configurações salvas com sucesso!</div>}

      {legacyRules.length > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-400 mb-2">Atenção à base antiga</p>
          <p className="text-sm text-amber-100 leading-relaxed">
            O app agora trabalha com <strong>todos os meios cadastrados em Cadastros</strong> na aba geral e deixa <strong>bandeira/operadora</strong> apenas em <strong>Regras de Cartões</strong>. Existem {legacyRules.length} regra(s) fora desse padrão.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(Object.keys(TAB_LABELS) as TabKey[]).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-[0.18em] transition-all ${isActive ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/20' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'}`}
            >
              {TAB_LABELS[tab]}
            </button>
          );
        })}
      </div>

      {activeTab === 'general' && renderGeneralTable()}
      {activeTab === 'cards' && renderCardsTable()}
      {activeTab === 'balances' && activeCompany && <BankOpeningBalances companyId={activeCompany.id} banks={banks} />}
    </div>
  );
};

export default FinancialAssumptions;