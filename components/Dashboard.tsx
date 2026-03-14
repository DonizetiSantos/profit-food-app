import React, { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';

import { FinancialPosting, MainGroup, Bank } from '../types';

interface DashboardProps {
  postings: FinancialPosting[];
  banks: Bank[];
}

const normalizeText = (value?: string) => {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
};

const isCardFee = (posting: FinancialPosting) => {
  const obs = normalizeText(posting.observations);

  return (
    posting.group === MainGroup.DESPESAS &&
    (obs.includes('TAXAS CARTOES') || obs.includes('TAXAS CARTOES'))
  );
};

const isDashboardPayableExpense = (posting: FinancialPosting) => {
  if (posting.group !== MainGroup.DESPESAS) return false;

  if (isCardFee(posting)) return false;

  return true;
};

export const Dashboard: React.FC<DashboardProps> = ({ postings, banks }) => {
  const today = new Date().toISOString().slice(0, 10);

  const stats = useMemo(() => {
    let realIncome = 0;
    let realExpense = 0;
    let provExpense = 0;

    postings.forEach(p => {
      if (p.status === 'LIQUIDADO') {
        if (p.group === MainGroup.RECEITAS) realIncome += p.amount;
        if (p.group === MainGroup.DESPESAS) realExpense += p.amount;
      } else {
        if (isDashboardPayableExpense(p)) {
          provExpense += p.amount;
        }
      }
    });

    const currentBalance = realIncome - realExpense;
    const projectedBalance = currentBalance - provExpense;

    const bankBalances: Record<string, number> = {};
    banks.forEach(b => {
      bankBalances[b.id] = 0;
    });

    postings.forEach(p => {
      if (p.status === 'LIQUIDADO' && p.bankId) {
        if (p.group === MainGroup.RECEITAS) {
          bankBalances[p.bankId] += p.amount;
        }

        if (p.group === MainGroup.DESPESAS) {
          bankBalances[p.bankId] -= p.amount;
        }
      }
    });

    return {
      currentBalance,
      provExpense,
      projectedBalance,
      bankBalances
    };
  }, [postings, banks]);

  const chartData = useMemo(() => {
    const dates: Record<string, { real: number; prov: number }> = {};

    postings.forEach(p => {
      const date =
        p.status === 'LIQUIDADO'
          ? p.liquidationDate || p.occurrenceDate
          : p.dueDate;

      if (!date) return;

      if (!dates[date]) {
        dates[date] = { real: 0, prov: 0 };
      }

      if (p.status === 'LIQUIDADO') {
        if (p.group === MainGroup.RECEITAS) {
          dates[date].real += p.amount;
        }

        if (p.group === MainGroup.DESPESAS) {
          dates[date].real -= p.amount;
        }
      } else {
        if (isDashboardPayableExpense(p)) {
          dates[date].prov -= p.amount;
        }
      }
    });

    return Object.entries(dates)
      .map(([date, vals]) => ({
        date,
        saldo: vals.real + vals.prov
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .reduce((acc: any[], curr, i) => {
        const prevSaldo = i > 0 ? acc[i - 1].acumulado : 0;

        acc.push({
          ...curr,
          acumulado: prevSaldo + curr.saldo
        });

        return acc;
      }, []);
  }, [postings]);

  const { overdue, upcoming, overdueTotal, upcomingTotal } = useMemo(() => {
    const expenses = postings
      .filter(
        p =>
          p.status === 'PROVISIONADO' &&
          !!p.dueDate &&
          isDashboardPayableExpense(p)
      )
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const overdueList = expenses.filter(p => p.dueDate < today);
    const upcomingList = expenses.filter(p => p.dueDate >= today);

    return {
      overdue: overdueList,
      upcoming: upcomingList.slice(0, 5),
      overdueTotal: overdueList.reduce((sum, p) => sum + p.amount, 0),
      upcomingTotal: upcomingList.reduce((sum, p) => sum + p.amount, 0)
    };
  }, [postings, today]);

  return (
    <div className="space-y-6">

      <div className="bg-gray-800 p-6 rounded-lg">
        <h2 className="text-lg font-semibold mb-4 text-white">
          Fluxo de Caixa Projetado
        </h2>

        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#444" />
            <XAxis dataKey="date" stroke="#ccc" />
            <YAxis stroke="#ccc" />
            <Tooltip />
            <Area
              type="monotone"
              dataKey="acumulado"
              stroke="#4ade80"
              fill="#4ade80"
              fillOpacity={0.2}
            />
            <ReferenceLine y={0} stroke="#888" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-6">

        <div className="bg-gray-800 p-6 rounded-lg">
          <h3 className="text-white font-semibold mb-4">
            Contas Vencidas
          </h3>

          {overdue.map(p => (
            <div key={p.id} className="flex justify-between text-sm text-red-400">
              <span>{p.observations}</span>
              <span>
                {p.amount.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL'
                })}
              </span>
            </div>
          ))}

          <div className="mt-4 text-red-400 font-bold">
            Total:
            {' '}
            {overdueTotal.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL'
            })}
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg">
          <h3 className="text-white font-semibold mb-4">
            Próximos Compromissos
          </h3>

          {upcoming.map(p => (
            <div key={p.id} className="flex justify-between text-sm text-gray-300">
              <span>{p.observations}</span>
              <span>
                {p.amount.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL'
                })}
              </span>
            </div>
          ))}

          <div className="mt-4 text-white font-bold">
            Total:
            {' '}
            {upcomingTotal.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL'
            })}
          </div>
        </div>

      </div>
    </div>
  );
};