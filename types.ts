export enum MainGroup {
  DESPESAS = 'DESPESAS',
  RECEITAS = 'RECEITAS',
  ESTOQUE = 'ESTOQUE'
}

export enum TransactionType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE'
}

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
}

export interface Company {
  id: string;
  name: string;
  document?: string;
  created_at?: string;
  subscription_status?: 'trial' | 'active' | 'expired' | 'blocked';
  trial_ends_at?: string;
  paid_until?: string;
}

export interface CompanyUser {
  id: string;
  company_id: string;
  user_id: string;
  role: string;
}

export interface Category {
  id: string;
  name: string;
  subgroupId: string;
  groupId: MainGroup;
  isFixed?: boolean;
  icon?: string;
  color?: string;
}

export interface Account extends Category {}

export interface Subgroup {
  id: string;
  name: string;
  groupId: MainGroup;
}

export interface Bank {
  id: string;
  name: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
}

export interface Entity {
  id: string;
  name: string;
  type: 'FORNECEDOR' | 'CLIENTE' | 'AMBOS';
  document?: string;
}

export interface FinancialPosting {
  id: string;
  status: 'LIQUIDADO' | 'PROVISIONADO';
  competenceDate: string;
  occurrenceDate: string;
  dueDate: string;
  group: MainGroup;
  accountId: string;
  accountName?: string;
  observations: string;
  paymentMethodId: string;
  entityId: string;
  entityName?: string;
  liquidationDate?: string;
  bankId?: string;
  amount: number;
  invoiceNumber?: string;
}

export interface Transaction {
  id: string;
  date: string;
  amount: number;
  description: string;
  categoryId: string;
  type: TransactionType;
}

export interface FinancialSummary {
  balance: number;
  totalIncome: number;
  totalExpenses: number;
}

export interface XmlItem {
  cProd: string;
  xProd: string;
  vProd: number;
  qCom: number;
  uCom: string;
  vUnCom: number;
  gtin: string;
}

export interface XmlMapping {
  id: string;
  supplierCnpj: string;
  matchType: 'GTIN' | 'SUPPLIER_CODE' | 'NAME_NORMALIZED';
  matchKey: string;
  accountId: string;
  updatedAt: string;
}

export interface BankTransaction {
  id: string;
  bankId: string;
  postedDate: string;
  amount: number;
  description: string;
  fitId?: string;
  checkNumber?: string;
  ofxFileHash: string;
  raw?: any;
  createdAt?: string;
}

export interface Reconciliation {
  id: string;
  bankTransactionId: string;
  postingId: string;
  matchType: 'AUTO' | 'MANUAL';
  matchScore?: number;
  matchedAmount?: number;
  status?: string;
  notes?: string;
  createdAt?: string;
}

export interface OfxImport {
  id: string;
  bankId: string;
  fileHash: string;
  fileName: string;
  importedAt: string;
  fromDate: string;
  toDate: string;
  totalTransactions: number;
  status: 'IMPORTED' | 'PARTIAL' | 'ERROR';
  errorMessage?: string;
}

export interface PaymentSettlementRule {
  id: string;
  company_id: string;
  payment_method_id: string;
  settlement_days: number;
  receives_same_day: boolean;
  default_status: 'LIQUIDADO' | 'PROVISIONADO';
  fee_percent: number;
  fee_fixed: number;
  default_bank_id?: string | null;
  card_brand?: string | null;
  acquirer_name?: string | null;
  notes?: string;
  is_active: boolean;
  payment_methods?: {
    name: string;
  };
}

export type ProfitFoodPaymentType =
  | 'DINHEIRO'
  | 'PIX'
  | 'CARTAO_DEBITO'
  | 'CARTAO_CREDITO'
  | 'VOUCHER'
  | 'APLICATIVO'
  | 'OUTROS';

export interface NormalizedPdvClosing {
  source: string;
  companyId: string;

  closingDate: string;

  rawLabel: string;
  normalizedLabel: string;

  paymentMethodType: ProfitFoodPaymentType;

  amount: number;
  quantity?: number;
  percentage?: number;

  acquirerName?: string;
  cardBrand?: string;
  channelName?: string;

  paymentMethodId?: string | null;

  mappedStatus?: 'LIQUIDADO' | 'PROVISIONADO' | null;

  defaultBankId?: string | null;

  settlementDays?: number | null;
  receivesSameDay?: boolean | null;

  feePercent?: number | null;
  feeFixed?: number | null;

  grossAmount: number;
  feeAmount: number;
  netAmount: number;

  dueDate?: string | null;
  liquidationDate?: string | null;

  shouldGenerateRevenuePosting: boolean;
  shouldGenerateFeePosting: boolean;
  shouldGenerateReceiptPosting: boolean;

  notes?: string;
}

export interface NormalizedPdvClosingBatch {
  source: string;
  companyId: string;
  closingDate: string;

  rows: NormalizedPdvClosing[];

  totalGrossAmount: number;
  totalFeeAmount: number;
  totalNetAmount: number;

  importedAt?: string;
  notes?: string;
}