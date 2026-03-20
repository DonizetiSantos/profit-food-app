import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../src/lib/supabase';
import { Bank } from '../types';

interface BankOpeningBalanceRecord {
  id: string;
  company_id: string;
  bank_id: string;
  opening_balance: number;
  reference_date: string;
  created_at?: string;
}

interface BankOpeningBalancesProps {
  companyId: string;
  banks: Bank[];
  onSaved?: () => void;
}

interface BankOpeningBalanceFormRow {
  bankId: string;
  bankName: string;
  openingBalance: string;
  referenceDate: string;
}

const getTodayISO = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatCurrencyInput = (value: string): string => {
  return value.replace(',', '.').replace(/[^\d.-]/g, '');
};

const parseCurrency = (value: string): number => {
  const parsed = Number(formatCurrencyInput(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrencyBRL = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);
};

export const BankOpeningBalances: React.FC<BankOpeningBalancesProps> = ({
  companyId,
  banks,
  onSaved,
}) => {
  const [rows, setRows] = useState<BankOpeningBalanceFormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<'success' | 'error' | null>(null);

  const sortedBanks = useMemo(() => {
    return [...banks].sort((a, b) => a.name.localeCompare(b.name));
  }, [banks]);

  useEffect(() => {
    const loadOpeningBalances = async () => {
      if (!companyId) {
        setRows([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setMessage(null);

      try {
        const { data, error } = await supabase
          .from('bank_opening_balances')
          .select('id, company_id, bank_id, opening_balance, reference_date, created_at')
          .eq('company_id', companyId);

        if (error) {
          throw error;
        }

        const existingByBankId = new Map<string, BankOpeningBalanceRecord>();
        (data || []).forEach((item: BankOpeningBalanceRecord) => {
          existingByBankId.set(item.bank_id, item);
        });

        const initialRows: BankOpeningBalanceFormRow[] = sortedBanks.map((bank) => {
          const existing = existingByBankId.get(bank.id);

          return {
            bankId: bank.id,
            bankName: bank.name,
            openingBalance:
              existing && typeof existing.opening_balance === 'number'
                ? String(existing.opening_balance)
                : '0',
            referenceDate: existing?.reference_date || getTodayISO(),
          };
        });

        setRows(initialRows);
      } catch (error) {
        console.error('Erro ao carregar saldos iniciais dos bancos:', error);
        setMessage('Não foi possível carregar os saldos iniciais dos bancos.');
        setMessageType('error');
      } finally {
        setLoading(false);
      }
    };

    loadOpeningBalances();
  }, [companyId, sortedBanks]);

  const handleRowChange = (
    bankId: string,
    field: keyof Omit<BankOpeningBalanceFormRow, 'bankId' | 'bankName'>,
    value: string
  ) => {
    setRows((prev) =>
      prev.map((row) =>
        row.bankId === bankId
          ? {
              ...row,
              [field]: field === 'openingBalance' ? formatCurrencyInput(value) : value,
            }
          : row
      )
    );
  };

  const handleSave = async () => {
    if (!companyId) {
      setMessage('Empresa não identificada para salvar os saldos iniciais.');
      setMessageType('error');
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const payload = rows.map((row) => ({
        company_id: companyId,
        bank_id: row.bankId,
        opening_balance: parseCurrency(row.openingBalance),
        reference_date: row.referenceDate || getTodayISO(),
      }));

      const { error } = await supabase
        .from('bank_opening_balances')
        .upsert(payload, {
          onConflict: 'company_id,bank_id',
        });

      if (error) {
        throw error;
      }

      setMessage('Saldos iniciais salvos com sucesso.');
      setMessageType('success');
      onSaved?.();
    } catch (error) {
      console.error('Erro ao salvar saldos iniciais dos bancos:', error);
      setMessage('Não foi possível salvar os saldos iniciais dos bancos.');
      setMessageType('error');
    } finally {
      setSaving(false);
    }
  };

  const totalOpeningBalance = useMemo(() => {
    return rows.reduce((acc, row) => acc + parseCurrency(row.openingBalance), 0);
  }, [rows]);

  return (
    <section className="space-y-4">
      <div className="rounded-[2rem] border border-slate-800 bg-slate-950/70 p-5 shadow-[0_0_40px_rgba(15,23,42,0.35)]">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight text-white">
              Saldos Iniciais dos Bancos
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Defina o saldo de partida de cada banco sem afetar DRE, receitas, despesas ou fluxo operacional do período.
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-right">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400">
              Total Inicial
            </p>
            <p className="mt-1 text-xl font-black text-white">
              {formatCurrencyBRL(totalOpeningBalance)}
            </p>
          </div>
        </div>

        {message && (
          <div
            className={`mb-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${
              messageType === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
            }`}
          >
            {message}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-10 text-center text-sm font-semibold text-slate-400">
            Carregando saldos iniciais...
          </div>
        ) : (
          <>
            <div className="rounded-[2rem] border border-slate-800 overflow-hidden shadow-2xl">
              <div className="overflow-auto custom-scrollbar max-h-[68vh]">
                <table className="w-full min-w-[920px] text-left border-collapse">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-slate-950 text-slate-500 text-[8px] uppercase tracking-[0.18em] font-black border-b border-slate-800">
                      <th className="px-5 py-3">Banco</th>
                      <th className="px-5 py-3">Saldo Inicial (R$)</th>
                      <th className="px-5 py-3">Data de Referência</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-800 bg-slate-900/60">
                    {rows.map((row) => (
                      <tr key={row.bankId} className="hover:bg-slate-900/90 transition-colors">
                        <td className="px-5 py-3 align-middle">
                          <div className="font-black uppercase text-white text-[11px]">
                            {row.bankName}
                          </div>
                        </td>

                        <td className="px-5 py-3 align-middle">
                          <input
                            type="text"
                            value={row.openingBalance}
                            onChange={(e) =>
                              handleRowChange(row.bankId, 'openingBalance', e.target.value)
                            }
                            placeholder="0.00"
                            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-[11px] font-bold text-white outline-none transition focus:border-emerald-500"
                          />
                        </td>

                        <td className="px-5 py-3 align-middle">
                          <input
                            type="date"
                            value={row.referenceDate}
                            onChange={(e) =>
                              handleRowChange(row.bankId, 'referenceDate', e.target.value)
                            }
                            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-[11px] font-bold text-white outline-none transition focus:border-emerald-500"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="max-w-3xl rounded-2xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-blue-200">
                Este cadastro serve apenas para iniciar a operação com os saldos corretos nos bancos.
                Ele não deve ser tratado como receita, despesa ou lançamento operacional.
              </div>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center justify-center rounded-2xl bg-rose-600 px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Salvando...' : 'Salvar Saldos Iniciais'}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default BankOpeningBalances;