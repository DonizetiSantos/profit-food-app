
import { FinancialPosting, Account, MainGroup } from '../../types';

export interface DREData {
  faturamentoBruto: number;
  faturamentoBrutoDetails: { name: string, value: number }[];
  impostos: number;
  impostosDetails: { name: string, value: number }[];
  faturamentoLiquido: number;
  variaveisVendas: number;
  variaveisVendasDetails: { name: string, value: number }[];
  cmv: number;
  compras: number;
  comprasDetails: { name: string, value: number }[];
  estoqueInicial: number;
  estoqueFinal: number;
  lucroBruto: number;
  pessoal: number;
  pessoalDetails: { name: string, value: number }[];
  admin: number;
  adminDetails: { name: string, value: number }[];
  ocupacao: number;
  ocupacaoDetails: { name: string, value: number }[];
  totalDespesasFixas: number;
  lucroOperacional: number;
  despesasFinanceiras: number;
  despesasFinanceirasDetails: { name: string, value: number }[];
  resultadoLiquido: number;
  outrasEntradas: number;
  outrasEntradasDetails: { name: string, value: number }[];
  servicoDivida: number;
  servicoDividaDetails: { name: string, value: number }[];
  saidasNaoOperacionais: number;
  saidasNaoOperacionaisDetails: { name: string, value: number }[];
  investimentos: number;
  investimentosDetails: { name: string, value: number }[];
  resultadoAposAmortizacao: number;
}

export const calculateDRE = (
  postings: FinancialPosting[],
  accounts: Account[],
  selectedMonth: number,
  selectedYear: number
): DREData => {
  const isReceiptAccount = (accId: string) => {
    const acc = accounts.find(a => a.id === accId);
    return acc?.name.toUpperCase().includes('RECEBIMENTO') || false;
  };

  const filtered = postings.filter(p => {
    const [year, month, day] = p.occurrenceDate.split('-').map(Number);
    const localDate = new Date(year, month - 1, day, 12, 0, 0);
    const isPeriodMatch = localDate.getMonth() === selectedMonth && localDate.getFullYear() === selectedYear;
    return isPeriodMatch && !isReceiptAccount(p.accountId);
  });

  const getVal = (accId?: string, subId?: string) => {
    return filtered
      .filter(p => (accId ? p.accountId === accId : true) && (subId ? accounts.find(a => a.id === p.accountId)?.subgroupId === subId : true))
      .reduce((sum, p) => sum + p.amount, 0);
  };

  const getAccountDetails = (subId: string) => {
    const subAccounts = accounts.filter(a => a.subgroupId === subId);
    return subAccounts.map(acc => ({
      name: acc.name,
      value: filtered.filter(p => p.accountId === acc.id).reduce((sum, p) => sum + p.amount, 0)
    })).filter(acc => acc.value > 0);
  };

  const faturamentoBruto = getVal(undefined, 's-entradas-op');
  const faturamentoBrutoDetails = getAccountDetails('s-entradas-op');

  const impostos = getVal(undefined, 's-impostos');
  const impostosDetails = getAccountDetails('s-impostos');

  const variaveisVendas = getVal(undefined, 's-despesas-vendas');
  const variaveisVendasDetails = getAccountDetails('s-despesas-vendas');

  const estoqueInicial = filtered.filter(p => p.accountId === 'e-inicial').reduce((sum, p) => sum + p.amount, 0);
  const estoqueFinal = filtered.filter(p => p.accountId === 'e-final').reduce((sum, p) => sum + p.amount, 0);
  const compras = getVal(undefined, 's-despesas-compras');
  const comprasDetails = getAccountDetails('s-despesas-compras');
  const cmv = estoqueInicial + compras - estoqueFinal;

  const pessoal = getVal(undefined, 's-despesa-pessoal');
  const pessoalDetails = getAccountDetails('s-despesa-pessoal');

  const admin = getVal(undefined, 's-despesas-admin');
  const adminDetails = getAccountDetails('s-despesas-admin');

  const ocupacao = getVal(undefined, 's-despesas-ocupacao');
  const ocupacaoDetails = getAccountDetails('s-despesas-ocupacao');

  const totalDespesasFixas = pessoal + admin + ocupacao;

  const despesasFinanceiras = getVal(undefined, 's-despesas-financeiras');
  const despesasFinanceirasDetails = getAccountDetails('s-despesas-financeiras');

  const outrasEntradas = getVal(undefined, 's-entradas-nao-op');
  const outrasEntradasDetails = getAccountDetails('s-entradas-nao-op');

  const servicoDivida = getVal(undefined, 's-servico-divida');
  const servicoDividaDetails = getAccountDetails('s-servico-divida');

  const saidasNaoOperacionais = getVal(undefined, 's-saidas-nao-op');
  const saidasNaoOperacionaisDetails = getAccountDetails('s-saidas-nao-op');

  const investimentos = getVal(undefined, 's-investimentos');
  const investimentosDetails = getAccountDetails('s-investimentos');

  const faturamentoLiquido = faturamentoBruto - impostos;
  const lucroBruto = faturamentoLiquido - variaveisVendas - cmv;
  const lucroOperacional = lucroBruto - totalDespesasFixas;
  const resultadoLiquido = lucroOperacional - despesasFinanceiras;
  const resultadoAposAmortizacao = resultadoLiquido + outrasEntradas - servicoDivida - saidasNaoOperacionais - investimentos;

  return {
    faturamentoBruto, faturamentoBrutoDetails, impostos, impostosDetails, faturamentoLiquido, 
    variaveisVendas, variaveisVendasDetails, cmv, compras, comprasDetails, estoqueInicial, estoqueFinal, lucroBruto,
    pessoal, pessoalDetails, admin, adminDetails, ocupacao, ocupacaoDetails, totalDespesasFixas, 
    lucroOperacional, despesasFinanceiras, despesasFinanceirasDetails,
    resultadoLiquido, outrasEntradas, outrasEntradasDetails, servicoDivida, servicoDividaDetails,
    saidasNaoOperacionais, saidasNaoOperacionaisDetails, investimentos, investimentosDetails,
    resultadoAposAmortizacao
  };
};
