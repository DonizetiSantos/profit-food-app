import { supabase } from '../src/lib/supabase';
import { sha256 } from './hash';
import { detectPdvSource, PdvSource } from './pdvSourceDetector';
import { parseSaiposClosing } from './parsers/saiposParser';
import { parseTotvsChefClosing } from './parsers/totvsChefParser';
import { parseGenericClosing } from './parsers/genericSpreadsheetParser';
import {
  NormalizedPdvClosing,
  NormalizedPdvClosingBatch,
  PaymentSettlementRule,
} from '../types';
import { settlementService } from './settlementService';

export interface PdvImportPreview {
  source: PdvSource;
  batch: NormalizedPdvClosingBatch;
  fileHash: string;
}

const normalizeText = (value: string | null | undefined) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const IFOOD_TERMS = ['ifood', 'i food', 'i-food'];

const includesAny = (text: string, terms: string[]) =>
  terms.some((term) => text.includes(term));

const isIfoodPaymentRow = (
  row: NormalizedPdvClosing,
  rule: PaymentSettlementRule | null
): boolean => {
  const rawLabel = normalizeText(row.rawLabel);
  const paymentMethodName = normalizeText(rule?.payment_methods?.name);
  return includesAny(rawLabel, IFOOD_TERMS) || includesAny(paymentMethodName, IFOOD_TERMS);
};

const calculateIfoodWeeklySettlementDate = (occurrenceDate: string): string => {
  const date = new Date(`${occurrenceDate}T12:00:00`);
  const dayOfWeek = date.getDay(); // 0 = domingo, 6 = sábado
  const daysUntilSaturday = 6 - dayOfWeek;
  const settlementDate = new Date(date);
  settlementDate.setDate(date.getDate() + daysUntilSaturday + 4); // quarta-feira seguinte
  return settlementDate.toISOString().split('T')[0];
};

const buildRuleMaps = (rules: PaymentSettlementRule[]) => {
  const byPaymentMethodId = new Map<string, PaymentSettlementRule[]>();
  const byMethodName = new Map<string, PaymentSettlementRule[]>();

  for (const rule of rules) {
    if (rule.payment_method_id) {
      const existing = byPaymentMethodId.get(rule.payment_method_id) || [];
      byPaymentMethodId.set(rule.payment_method_id, [...existing, rule]);
    }

    const methodName = normalizeText(rule.payment_methods?.name);
    if (methodName) {
      const existing = byMethodName.get(methodName) || [];
      byMethodName.set(methodName, [...existing, rule]);
    }
  }

  return { byPaymentMethodId, byMethodName };
};

const resolveBestRule = (
  candidateRules: PaymentSettlementRule[],
  cardBrand?: string | null,
  acquirerName?: string | null
): PaymentSettlementRule | null => {
  if (candidateRules.length === 0) return null;

  const normalizedBrand = normalizeText(cardBrand);
  const normalizedAcquirer = normalizeText(acquirerName);

  const exactRule = candidateRules.find((rule) => {
    const ruleBrand = normalizeText(rule.card_brand);
    const ruleAcquirer = normalizeText(rule.acquirer_name);
    return (
      !!ruleBrand &&
      !!ruleAcquirer &&
      ruleBrand === normalizedBrand &&
      ruleAcquirer === normalizedAcquirer
    );
  });
  if (exactRule) return exactRule;

  const brandRule = candidateRules.find((rule) => {
    const ruleBrand = normalizeText(rule.card_brand);
    const ruleAcquirer = normalizeText(rule.acquirer_name);
    return !!ruleBrand && !ruleAcquirer && ruleBrand === normalizedBrand;
  });
  if (brandRule) return brandRule;

  const acquirerRule = candidateRules.find((rule) => {
    const ruleBrand = normalizeText(rule.card_brand);
    const ruleAcquirer = normalizeText(rule.acquirer_name);
    return !ruleBrand && !!ruleAcquirer && ruleAcquirer === normalizedAcquirer;
  });
  if (acquirerRule) return acquirerRule;

  const genericRule = candidateRules.find(
    (rule) =>
      !normalizeText(rule.card_brand) && !normalizeText(rule.acquirer_name)
  );
  if (genericRule) return genericRule;

  return candidateRules[0] || null;
};

const applyRuleToRow = (
  row: NormalizedPdvClosing,
  rule: PaymentSettlementRule | null,
  caixaEmpresaId?: string
): NormalizedPdvClosing => {
  const grossAmount = Number(row.grossAmount ?? row.amount ?? 0);
  const isCash = row.paymentMethodType === 'DINHEIRO';

  if (isCash) {
    const currentFeeAmount = Number(row.feeAmount ?? 0);

    return {
      ...row,
      grossAmount,
      feePercent: 0,
      feeFixed: 0,
      feeAmount: currentFeeAmount,
      netAmount: Number((grossAmount - currentFeeAmount).toFixed(2)),
      mappedStatus: 'LIQUIDADO',
      defaultBankId: caixaEmpresaId || row.defaultBankId || null,
      dueDate: row.closingDate,
      liquidationDate: row.closingDate,
      shouldGenerateFeePosting: currentFeeAmount > 0,
    };
  }

  if (!rule) {
    const currentFeeAmount = Number(row.feeAmount ?? 0);
    const fallbackStatus =
      (row.mappedStatus as 'LIQUIDADO' | 'PROVISIONADO') || 'PROVISIONADO';
    const fallbackDueDate = row.dueDate || row.closingDate;
    const fallbackLiquidationDate =
      fallbackStatus === 'LIQUIDADO'
        ? row.liquidationDate || row.closingDate
        : null;

    return {
      ...row,
      grossAmount,
      feePercent: Number(row.feePercent ?? 0),
      feeFixed: Number(row.feeFixed ?? 0),
      feeAmount: currentFeeAmount,
      netAmount: Number((grossAmount - currentFeeAmount).toFixed(2)),
      mappedStatus: fallbackStatus,
      dueDate: fallbackDueDate,
      liquidationDate: fallbackLiquidationDate,
      shouldGenerateFeePosting: currentFeeAmount > 0,
    };
  }

  const feePercent = Number(rule.fee_percent || 0);
  const feeFixed = Number(rule.fee_fixed || 0);
  const feeAmount = Number((grossAmount * (feePercent / 100) + feeFixed).toFixed(2));
  const netAmount = Number((grossAmount - feeAmount).toFixed(2));

  const settlementDays = Number(rule.settlement_days || 0);
  const receivesSameDay = !!rule.receives_same_day;
  const isIfoodPayment = isIfoodPaymentRow(row, rule);

  let mappedStatus: 'LIQUIDADO' | 'PROVISIONADO' =
    rule.default_status || 'PROVISIONADO';
  let dueDate = row.closingDate;
  let liquidationDate: string | null = null;

  if (isIfoodPayment) {
    mappedStatus = 'PROVISIONADO';
    dueDate = calculateIfoodWeeklySettlementDate(row.closingDate);
    liquidationDate = null;
  } else if (receivesSameDay) {
    mappedStatus = 'LIQUIDADO';
    dueDate = row.closingDate;
    liquidationDate = row.closingDate;
  } else {
    const date = new Date(`${row.closingDate}T12:00:00`);
    date.setDate(date.getDate() + settlementDays);
    dueDate = date.toISOString().split('T')[0];
    liquidationDate = mappedStatus === 'LIQUIDADO' ? dueDate : null;
  }

  return {
    ...row,
    paymentMethodId: row.paymentMethodId || rule.payment_method_id || null,
    mappedStatus,
    defaultBankId: row.defaultBankId || rule.default_bank_id || null,
    settlementDays,
    receivesSameDay,
    feePercent,
    feeFixed,
    grossAmount,
    feeAmount,
    netAmount,
    dueDate,
    liquidationDate,
    shouldGenerateFeePosting: feeAmount > 0,
  };
};

const recalculateRowsFromFinalMapping = (
  rows: NormalizedPdvClosing[],
  settlementRules: PaymentSettlementRule[],
  caixaEmpresaId?: string
): NormalizedPdvClosing[] => {
  const { byPaymentMethodId, byMethodName } = buildRuleMaps(settlementRules);

  return rows.map((row) => {
    if (row.paymentMethodType === 'DINHEIRO') {
      return applyRuleToRow(row, null, caixaEmpresaId);
    }

    let matchedRule: PaymentSettlementRule | null = null;

    if (row.paymentMethodId && byPaymentMethodId.has(row.paymentMethodId)) {
      matchedRule = resolveBestRule(
        byPaymentMethodId.get(row.paymentMethodId) || [],
        row.cardBrand,
        row.acquirerName
      );
    } else {
      const rawLabel = normalizeText(row.rawLabel);
      if (rawLabel && byMethodName.has(rawLabel)) {
        matchedRule = resolveBestRule(
          byMethodName.get(rawLabel) || [],
          row.cardBrand,
          row.acquirerName
        );
      }
    }

    return applyRuleToRow(row, matchedRule, caixaEmpresaId);
  });
};

const recalculateBatchTotals = (
  batch: NormalizedPdvClosingBatch
): NormalizedPdvClosingBatch => {
  const totalGrossAmount = batch.rows.reduce(
    (acc, row) => acc + Number(row.grossAmount || 0),
    0
  );
  const totalFeeAmount = batch.rows.reduce(
    (acc, row) => acc + Number(row.feeAmount || 0),
    0
  );
  const totalNetAmount = batch.rows.reduce(
    (acc, row) => acc + Number(row.netAmount || 0),
    0
  );

  return {
    ...batch,
    totalGrossAmount,
    totalFeeAmount,
    totalNetAmount,
  };
};

export const pdvImportService = {
  async preparePreview(file: File, companyId: string): Promise<PdvImportPreview> {
    const text = await file.text();
    const fileHash = await sha256(text);

    const { data: existing } = await supabase
      .from('pdv_imports')
      .select('id')
      .eq('company_id', companyId)
      .eq('file_hash', fileHash)
      .maybeSingle();

    if (existing) {
      throw new Error('Este arquivo já foi importado anteriormente.');
    }

    const source = await detectPdvSource(file);

    const { data: rules } = await supabase
      .from('payment_settlement_rules')
      .select('*, payment_methods(name)')
      .eq('company_id', companyId)
      .eq('is_active', true);

    const settlementRules = (rules || []) as PaymentSettlementRule[];
    const today = new Date().toISOString().split('T')[0];

    let batch: NormalizedPdvClosingBatch;

    switch (source) {
      case 'saipos':
        batch = await parseSaiposClosing(file, companyId, today, settlementRules);
        break;
      case 'totvs_chef':
        batch = await parseTotvsChefClosing(file, companyId, today, settlementRules);
        break;
      case 'generic_spreadsheet':
        batch = await parseGenericClosing(file, companyId, today, settlementRules);
        break;
      default:
        batch = await parseGenericClosing(file, companyId, today, settlementRules);
        if (batch.rows.length === 0) {
          throw new Error(
            'Não foi possível reconhecer a estrutura do arquivo. Verifique se o arquivo contém colunas de forma de pagamento e valor.'
          );
        }
    }

    const labels = Array.from(new Set(batch.rows.map((r) => r.rawLabel)));
    const { data: mappings } = await supabase
      .from('pdv_payment_mapping')
      .select('*')
      .eq('company_id', companyId)
      .eq('source', source.toUpperCase())
      .in('raw_label', labels);

    if (mappings && mappings.length > 0) {
      const mappingMap = mappings.reduce((acc, m) => {
        acc[m.raw_label] = m;
        return acc;
      }, {} as Record<string, any>);

      batch.rows = batch.rows.map((row) => {
        const mapping = mappingMap[row.rawLabel];
        if (mapping) {
          return {
            ...row,
            paymentMethodId: row.paymentMethodId || mapping.payment_method_id,
            mappedStatus: row.mappedStatus || mapping.default_status,
            defaultBankId: row.defaultBankId || mapping.default_bank_id,
          };
        }
        return row;
      });
    }

    batch.rows = recalculateRowsFromFinalMapping(
      batch.rows,
      settlementRules
    );
    batch = recalculateBatchTotals(batch);

    return {
      source,
      batch,
      fileHash,
    };
  },

  async executeImport(
    preview: PdvImportPreview,
    companyId: string,
    caixaEmpresaId?: string
  ): Promise<{ warnings: string[] }> {
    let { batch, fileHash, source } = preview;
    const warnings: string[] = [];

    const accountId = await settlementService.resolveCompanyRevenueAccount(
      companyId
    );

    if (!accountId) {
      throw new Error('Não foi possível resolver a conta de Vendas Gerais.');
    }

    const { data: rules } = await supabase
      .from('payment_settlement_rules')
      .select('*, payment_methods(name)')
      .eq('company_id', companyId)
      .eq('is_active', true);

    const settlementRules = (rules || []) as PaymentSettlementRule[];

    batch.rows = recalculateRowsFromFinalMapping(
      batch.rows,
      settlementRules,
      caixaEmpresaId
    );
    batch = recalculateBatchTotals(batch);

    const importId = crypto.randomUUID();
    const { error: importError } = await supabase.from('pdv_imports').insert({
      id: importId,
      company_id: companyId,
      source: source.toUpperCase(),
      file_hash: fileHash,
      file_name: `Importação ${source} ${batch.closingDate}`,
      from_date: batch.closingDate,
      to_date: batch.closingDate,
      total_rows: batch.rows.length,
      status: 'IMPORTED',
    });

    if (importError) throw importError;

    const postings: any[] = [];
    const importItems: any[] = [];
    const mappingsToUpsert: any[] = [];
    const seenLabels = new Set<string>();

    for (const row of batch.rows) {
      const postingId = crypto.randomUUID();

      let bankId = row.defaultBankId;
      if (row.paymentMethodType === 'DINHEIRO') {
        bankId = caixaEmpresaId || row.defaultBankId || null;
      } else if (!bankId && row.mappedStatus === 'LIQUIDADO') {
        if (row.paymentMethodType === 'DINHEIRO') {
          bankId = caixaEmpresaId;
        }
      }

      const finalStatus: 'LIQUIDADO' | 'PROVISIONADO' =
        row.paymentMethodType === 'DINHEIRO'
          ? 'LIQUIDADO'
          : (row.mappedStatus || 'PROVISIONADO');

      const finalDueDate =
        row.paymentMethodType === 'DINHEIRO'
          ? row.closingDate
          : (row.dueDate || row.closingDate);

      const finalLiquidationDate =
        row.paymentMethodType === 'DINHEIRO'
          ? row.closingDate
          : row.liquidationDate;

      if (row.shouldGenerateRevenuePosting) {
        postings.push({
          id: postingId,
          company_id: companyId,
          status: finalStatus,
          competence_date: row.closingDate,
          occurrence_date: row.closingDate,
          due_date: finalDueDate,
          liquidation_date: finalLiquidationDate,
          group: 'RECEITAS',
          account_id: accountId,
          observations: `Venda PDV (${source}) - ${row.rawLabel}`,
          payment_method_id: row.paymentMethodId,
          amount: row.grossAmount,
          expected_net_amount: Number(row.netAmount ?? row.grossAmount ?? 0),
          bank_id: bankId || null,
        });
      }

      if (row.shouldGenerateFeePosting) {
        const feeAccountId =
          await settlementService.resolveCompanyFeeAccountByPaymentMethod(
            companyId,
            row.paymentMethodId || null,
            row.rawLabel
          );

        if (feeAccountId) {
          postings.push({
            id: crypto.randomUUID(),
            company_id: companyId,
            status: finalStatus,
            competence_date: row.closingDate,
            occurrence_date: row.closingDate,
            due_date: finalDueDate,
            liquidation_date: finalLiquidationDate,
            group: 'DESPESAS',
            account_id: feeAccountId,
            observations: `Taxa PDV (${source}) - ${row.rawLabel}`,
            payment_method_id: row.paymentMethodId,
            amount: row.feeAmount,
            bank_id: bankId || null,
          });
        } else {
          warnings.push(
            `Conta de taxa não encontrada para o meio "${row.rawLabel}". A taxa não foi lançada separadamente.`
          );
        }
      }

      importItems.push({
        company_id: companyId,
        pdv_import_id: importId,
        posting_id: postingId,
        raw_label: row.rawLabel,
        amount: row.grossAmount,
        day: row.closingDate,
      });

      if (!seenLabels.has(row.rawLabel)) {
        mappingsToUpsert.push({
          company_id: companyId,
          source: source.toUpperCase(),
          raw_label: row.rawLabel,
          payment_method_id: row.paymentMethodId,
          default_status:
            row.paymentMethodType === 'DINHEIRO'
              ? 'LIQUIDADO'
              : (row.mappedStatus || 'PROVISIONADO'),
          default_bank_id:
            row.paymentMethodType === 'DINHEIRO'
              ? (caixaEmpresaId || row.defaultBankId || null)
              : (row.defaultBankId || null),
        });
        seenLabels.add(row.rawLabel);
      }
    }

    if (mappingsToUpsert.length > 0) {
      await supabase
        .from('pdv_payment_mapping')
        .upsert(mappingsToUpsert, {
          onConflict: 'company_id, source, raw_label',
        });
    }

    if (postings.length > 0) {
      const { error: postError } = await supabase
        .from('postings')
        .insert(postings);
      if (postError) throw postError;
    }

    if (importItems.length > 0) {
      await supabase.from('pdv_import_items').insert(importItems);
    }

    return { warnings };
  },
};