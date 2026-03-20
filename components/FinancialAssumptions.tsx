import React, { useState, useEffect, useMemo } from 'react';
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

const isCardMethod = (rule: RuleRow) => {
  const methodName = normalizeText(rule.payment_methods?.name);
  return methodName.includes('cartao') || methodName.includes('cartão');
};

const sortRules = (items: RuleRow[]) => {
  return [...items].sort((a, b) => {
    const methodCompare = (a.payment_methods?.name || '').localeCompare(b.payment_methods?.name || '');
    if (methodCompare !== 0) return methodCompare;

    const aSpecificity = `${a.card_brand || ''} ${a.acquirer_name || ''}`.trim();
    const bSpecificity = `${b.card_brand || ''} ${b.acquirer_name || ''}`.trim();

    if (!aSpecificity && bSpecificity) return -1;
    if (aSpecificity && !bSpecificity) return 1;

    return aSpecificity.localeCompare(bSpecificity);
  });
};

const ScrollTableShell: React.FC<{
  children: React.ReactNode;
  minWidth: string;
}> = ({ children, minWidth }) => {
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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
        }));

        const genericRuleMethodIds = new Set(
          existingRules
            .filter((r) => !r.card_brand && !r.acquirer_name)
            .map((r) => r.payment_method_id)
        );

        const missingGenericRules: RuleRow[] = loadedMethods
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
    return sortRules(rules.filter((rule) => !rule.card_brand && !rule.acquirer_name));
  }, [rules]);

  const cardSpecificRules = useMemo(() => {
    return sortRules(
      rules.filter((rule) => (rule.card_brand || rule.acquirer_name) && isCardMethod(rule))
    );
  }, [rules]);

  const genericCardRules = useMemo(() => {
    return sortRules(
      rules.filter((rule) => !rule.card_brand && !rule.acquirer_name && isCardMethod(rule))
    );
  }, [rules]);

  const handleUpdateRule = (id: string, field: keyof RuleRow, value: any) => {
    setRules((prev) =>
      prev.map((rule) =>
        rule.id === id ? { ...rule, [field]: value } : rule
      )
    );
    setSuccess(false);
    setError(null);
  };

  const handleAddSpecificRule = (baseRule: RuleRow) => {
    if (!activeCompany) return;

    const methodName =
      baseRule.payment_methods?.name ||
      paymentMethods.find((m) => m.id === baseRule.payment_method_id)?.name ||
      'Desconhecido';

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
    };

    setRules((prev) => sortRules([...prev, newRule]));
    setActiveTab('cards');
    setSuccess(false);
    setError(null);
  };

  const handleRemoveUnsavedRule = (id: string) => {
    setRules((prev) => prev.filter((rule) => rule.id !== id));
    setSuccess(false);
    setError(null);
  };

  const handleSave = async () => {
    if (!activeCompany) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const now = new Date().toISOString();

      const { data: existingRows, error: existingRowsError } = await supabase
        .from('payment_settlement_rules')
        .select('id')
        .eq('company_id', activeCompany.id);

      if (existingRowsError) {
        throw existingRowsError;
      }

      const existingIds = new Set(
        ((existingRows as { id: string }[]) || []).map((row) => row.id)
      );

      const normalizedRules = rules.map(({ payment_methods, isNew, ...rule }) => {
        const cardMethod = isCardMethod({
          ...rule,
          payment_methods,
        } as RuleRow);

        return {
          ...rule,
          company_id: activeCompany.id,
          payment_method_id: rule.payment_method_id,
          settlement_days: Number(rule.settlement_days) || 0,
          receives_same_day: !!rule.receives_same_day,
          default_status: rule.default_status,
          fee_percent: Number(rule.fee_percent) || 0,
          fee_fixed: Number(rule.fee_fixed) || 0,
          default_bank_id: rule.default_bank_id || null,
          card_brand: cardMethod ? ((rule.card_brand || '').trim() || null) : null,
          acquirer_name: cardMethod ? ((rule.acquirer_name || '').trim() || null) : null,
          notes: rule.notes || '',
          is_active: rule.is_active ?? true,
        };
      });

      const rulesToInsert = normalizedRules
        .filter((rule) => !existingIds.has(rule.id))
        .map((rule) => ({
          ...rule,
          created_at: now,
        }));

      const rulesToUpdate = normalizedRules
        .filter((rule) => existingIds.has(rule.id))
        .map((rule) => ({
          ...rule,
          updated_at: now,
        }));

      if (rulesToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('payment_settlement_rules')
          .insert(rulesToInsert);

        if (insertError) throw insertError;
      }

      if (rulesToUpdate.length > 0) {
        const { error: updateError } = await supabase
          .from('payment_settlement_rules')
          .upsert(rulesToUpdate, { onConflict: 'id' });

        if (updateError) throw updateError;
      }

      setRules((prev) => prev.map((rule) => ({ ...rule, isNew: false })));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error('Erro ao salvar premissas:', err);

      const databaseMessage =
        err?.message ||
        err?.details ||
        err?.hint ||
        'Erro desconhecido ao salvar premissas financeiras.';

      setError(`Erro ao salvar as alterações: ${databaseMessage}`);
    } finally {
      setSaving(false);
    }
  };

  const renderGeneralTable = () => (
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
          {genericRules.map((rule) => {
            const cardMethod = isCardMethod(rule);

            return (
              <tr key={rule.id} className="hover:bg-slate-800/20 transition-colors">
                <td className="px-6 py-4 align-middle">
                  <div className="flex flex-col gap-0.5 leading-tight">
                    <span className="text-[11px] font-black text-slate-200 uppercase tracking-tight">
                      {rule.payment_methods?.name || 'Desconhecido'}
                    </span>
                    <span className="text-[8px] font-black uppercase tracking-widest text-cyan-400">
                      Regra Genérica
                    </span>
                  </div>
                </td>

                <td className="px-3 py-4 text-center">
                  <input
                    type="number"
                    value={rule.settlement_days}
                    onChange={(e) =>
                      handleUpdateRule(rule.id, 'settlement_days', parseInt(e.target.value, 10) || 0)
                    }
                    className="w-16 bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-[11px] font-bold text-slate-300 outline-none focus:border-rose-500 transition-all text-center"
                  />
                </td>

                <td className="px-3 py-4 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <button
                      onClick={() =>
                        handleUpdateRule(rule.id, 'receives_same_day', !rule.receives_same_day)
                      }
                      className={`w-11 h-5 rounded-full p-0.5 transition-all duration-300 relative ${
                        rule.receives_same_day ? 'bg-rose-600' : 'bg-slate-800'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 ${
                          rule.receives_same_day ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      ></div>
                    </button>
                    {rule.receives_same_day && (
                      <span className="text-[7px] font-black text-rose-500 uppercase tracking-tighter">
                        D+0
                      </span>
                    )}
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
                    onChange={(e) =>
                      handleUpdateRule(rule.id, 'fee_percent', parseFloat(e.target.value) || 0)
                    }
                    className="w-16 bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-[11px] font-bold text-slate-300 outline-none focus:border-rose-500 transition-all text-center"
                  />
                </td>

                <td className="px-3 py-4 text-center">
                  <input
                    type="number"
                    step="0.01"
                    value={rule.fee_fixed}
                    onChange={(e) =>
                      handleUpdateRule(rule.id, 'fee_fixed', parseFloat(e.target.value) || 0)
                    }
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
                  {cardMethod ? (
                    <button
                      onClick={() => handleAddSpecificRule(rule)}
                      className="px-2.5 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest bg-slate-800 hover:bg-slate-700 text-cyan-400 transition-all whitespace-nowrap"
                    >
                      + Regra específica
                    </button>
                  ) : (
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">
                      —
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollTableShell>
  );

  const renderCardsTable = () => (
    <div className="space-y-4">
      <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">
        Aqui ficam apenas as regras específicas de cartões. Preencha pelo menos <strong>bandeira</strong> ou <strong>operadora</strong>.
      </div>

      <ScrollTableShell minWidth="1180px">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-20">
            <tr className="bg-slate-950 text-slate-500 text-[8px] uppercase tracking-[0.18em] font-black border-b border-slate-800">
              <th className="px-6 py-4">Meio de Pagamento</th>
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
                  Nenhuma regra específica de cartão cadastrada ainda.
                </td>
              </tr>
            ) : (
              cardSpecificRules.map((rule) => (
                <tr key={rule.id} className="hover:bg-slate-800/20 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-0.5 leading-tight">
                      <span className="text-[11px] font-black text-slate-200 uppercase tracking-tight">
                        {rule.payment_methods?.name || 'Desconhecido'}
                      </span>
                      <span className="text-[8px] font-black uppercase tracking-widest text-amber-400">
                        Regra Específica
                      </span>
                    </div>
                  </td>

                  <td className="px-3 py-4 text-center">
                    <input
                      type="text"
                      value={rule.card_brand || ''}
                      onChange={(e) => handleUpdateRule(rule.id, 'card_brand', e.target.value)}
                      placeholder="VISA"
                      className="w-24 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-[11px] font-bold text-slate-300 outline-none focus:border-rose-500 transition-all text-center uppercase"
                    />
                  </td>

                  <td className="px-3 py-4 text-center">
                    <input
                      type="text"
                      value={rule.acquirer_name || ''}
                      onChange={(e) => handleUpdateRule(rule.id, 'acquirer_name', e.target.value)}
                      placeholder="STONE"
                      className="w-28 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-[11px] font-bold text-slate-300 outline-none focus:border-rose-500 transition-all text-center uppercase"
                    />
                  </td>

                  <td className="px-3 py-4 text-center">
                    <input
                      type="number"
                      value={rule.settlement_days}
                      onChange={(e) =>
                        handleUpdateRule(rule.id, 'settlement_days', parseInt(e.target.value, 10) || 0)
                      }
                      className="w-16 bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-[11px] font-bold text-slate-300 outline-none focus:border-rose-500 transition-all text-center"
                    />
                  </td>

                  <td className="px-3 py-4 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <button
                        onClick={() =>
                          handleUpdateRule(rule.id, 'receives_same_day', !rule.receives_same_day)
                        }
                        className={`w-11 h-5 rounded-full p-0.5 transition-all duration-300 relative ${
                          rule.receives_same_day ? 'bg-rose-600' : 'bg-slate-800'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 ${
                            rule.receives_same_day ? 'translate-x-6' : 'translate-x-0'
                          }`}
                        ></div>
                      </button>
                      {rule.receives_same_day && (
                        <span className="text-[7px] font-black text-rose-500 uppercase tracking-tighter">
                          D+0
                        </span>
                      )}
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
                      onChange={(e) =>
                        handleUpdateRule(rule.id, 'fee_percent', parseFloat(e.target.value) || 0)
                      }
                      className="w-16 bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-[11px] font-bold text-slate-300 outline-none focus:border-rose-500 transition-all text-center"
                    />
                  </td>

                  <td className="px-3 py-4 text-center">
                    <input
                      type="number"
                      step="0.01"
                      value={rule.fee_fixed}
                      onChange={(e) =>
                        handleUpdateRule(rule.id, 'fee_fixed', parseFloat(e.target.value) || 0)
                      }
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
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">
                        Salva
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ScrollTableShell>

      {genericCardRules.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500 mb-3">
            Atalhos para nova regra específica
          </p>
          <div className="flex flex-wrap gap-2">
            {genericCardRules.map((rule) => (
              <button
                key={rule.id}
                onClick={() => handleAddSpecificRule(rule)}
                className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-slate-800 hover:bg-slate-700 text-cyan-400 transition-all"
              >
                + {rule.payment_methods?.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-14 h-14 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin"></div>
        <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest animate-pulse">
          Carregando premissas...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight uppercase">
            Premissas Financeiras
          </h2>
          <p className="text-slate-500 text-sm font-medium">
            Configure regras gerais, regras específicas de cartões e saldos iniciais sem misturar contextos.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || rules.length === 0}
          className={`flex items-center gap-2 px-7 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-xl ${
            saving || rules.length === 0
              ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
              : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20'
          }`}
        >
          {saving ? (
            <>
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              Salvando...
            </>
          ) : (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              Salvar Alterações
            </>
          )}
        </button>
      </header>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-500 text-xs font-bold flex items-center gap-3 animate-shake">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-500 text-xs font-bold flex items-center gap-3 animate-fade-in">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Configurações salvas com sucesso!
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(Object.keys(TAB_LABELS) as TabKey[]).map((tab) => {
          const isActive = activeTab === tab;

          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-[0.18em] transition-all ${
                isActive
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/20'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          );
        })}
      </div>

      {activeTab === 'general' && renderGeneralTable()}
      {activeTab === 'cards' && renderCardsTable()}
      {activeTab === 'balances' && activeCompany && (
        <BankOpeningBalances
          companyId={activeCompany.id}
          banks={banks}
        />
      )}
    </div>
  );
};

export default FinancialAssumptions;