
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
