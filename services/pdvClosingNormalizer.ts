import { NormalizedPdvClosing, ProfitFoodPaymentType, PaymentSettlementRule } from '../types';

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Detects the Profit Food payment type based on a raw label from PDV.
 */
export function detectPaymentType(rawLabel: string): ProfitFoodPaymentType {
  const label = normalizeText(rawLabel);

  if (label.includes('pix')) return 'PIX';
  if (label.includes('dinheiro')) return 'DINHEIRO';
  if (label.includes('debito') || label.includes('débito')) return 'CARTAO_DEBITO';
  if (label.includes('credito') || label.includes('crédito')) return 'CARTAO_CREDITO';
  if (label.includes('voucher')) return 'VOUCHER';
  if (label.includes('ifood') || label.includes('app')) return 'APLICATIVO';

  return 'OUTROS';
}

function extractBrand(rawLabel: string, explicitBrand?: string): string | null {
  const informed = normalizeText(explicitBrand);
  if (informed) return informed;

  const label = normalizeText(rawLabel);

  const brands = [
    'visa',
    'master',
    'mastercard',
    'elo',
    'hipercard',
    'amex',
    'american express',
    'cabal',
    'sodexo',
    'alelo',
    'ticket'
  ];

  for (const brand of brands) {
    if (label.includes(brand)) {
      if (brand === 'american express') return 'amex';
      if (brand === 'mastercard') return 'master';
      return brand;
    }
  }

  return null;
}

function extractAcquirer(rawLabel: string, explicitAcquirer?: string): string | null {
  const informed = normalizeText(explicitAcquirer);
  if (informed) return informed;

  const label = normalizeText(rawLabel);

  const acquirers = [
    'stone',
    'rede',
    'cielo',
    'getnet',
    'pagseguro',
    'mercado pago',
    'mercadopago',
    'sumup',
    'infinitepay',
    'bin',
    'sicredi',
    'bradesco',
    'itau',
    'ielo',
    'sipag'
  ];

  for (const acquirer of acquirers) {
    if (label.includes(acquirer)) {
      if (acquirer === 'mercadopago') return 'mercado pago';
      return acquirer;
    }
  }

  return null;
}

function findPaymentMethodIdByType(
  paymentMethodType: ProfitFoodPaymentType,
  settlementRules: PaymentSettlementRule[]
): string | null {
  const normalizedTarget = normalizeText(paymentMethodType);

  const matched = settlementRules.find((rule) => {
    const methodName = normalizeText(rule.payment_methods?.name);
    return methodName === normalizedTarget;
  });

  return matched?.payment_method_id || null;
}

function resolveSettlementRule(
  rawLabel: string,
  paymentMethodType: ProfitFoodPaymentType,
  paymentMethodId: string | null | undefined,
  cardBrand: string | null,
  acquirerName: string | null,
  settlementRules: PaymentSettlementRule[]
): PaymentSettlementRule | undefined {
  const normalizedRawLabel = normalizeText(rawLabel);
  const normalizedBrand = normalizeText(cardBrand);
  const normalizedAcquirer = normalizeText(acquirerName);

  const resolvedPaymentMethodId =
    paymentMethodId ||
    findPaymentMethodIdByType(paymentMethodType, settlementRules);

  if (!resolvedPaymentMethodId) {
    return settlementRules.find((rule) =>
      normalizeText(rule.payment_methods?.name) === normalizedRawLabel
    );
  }

  const activeRules = settlementRules.filter(
    (rule) => rule.payment_method_id === resolvedPaymentMethodId
  );

  const exactRule = activeRules.find((rule) => {
    const ruleBrand = normalizeText(rule.card_brand);
    const ruleAcquirer = normalizeText(rule.acquirer_name);

    return !!ruleBrand && !!ruleAcquirer && ruleBrand === normalizedBrand && ruleAcquirer === normalizedAcquirer;
  });

  if (exactRule) return exactRule;

  const brandRule = activeRules.find((rule) => {
    const ruleBrand = normalizeText(rule.card_brand);
    const ruleAcquirer = normalizeText(rule.acquirer_name);

    return !!ruleBrand && !ruleAcquirer && ruleBrand === normalizedBrand;
  });

  if (brandRule) return brandRule;

  const acquirerRule = activeRules.find((rule) => {
    const ruleBrand = normalizeText(rule.card_brand);
    const ruleAcquirer = normalizeText(rule.acquirer_name);

    return !ruleBrand && !!ruleAcquirer && ruleAcquirer === normalizedAcquirer;
  });

  if (acquirerRule) return acquirerRule;

  const genericRule = activeRules.find((rule) => {
    const ruleBrand = normalizeText(rule.card_brand);
    const ruleAcquirer = normalizeText(rule.acquirer_name);

    return !ruleBrand && !ruleAcquirer;
  });

  if (genericRule) return genericRule;

  return settlementRules.find((rule) =>
    normalizeText(rule.payment_methods?.name) === normalizedRawLabel
  );
}

/**
 * Normalizes a single row from a PDV closing export.
 */
export function normalizePdvClosingRow(
  rawRow: any,
  source: string,
  companyId: string,
  closingDate: string,
  settlementRules: PaymentSettlementRule[] = []
): NormalizedPdvClosing {
  const rawLabel = String(rawRow.label || rawRow.paymentMethod || '').trim();
  const amount = Number(rawRow.amount) || 0;

  const paymentMethodType = detectPaymentType(rawLabel);
  const detectedCardBrand = extractBrand(rawLabel, rawRow.brand);
  const detectedAcquirerName = extractAcquirer(rawLabel, rawRow.acquirer);

  const informedPaymentMethodId = rawRow.paymentMethodId || null;
  const resolvedPaymentMethodId =
    informedPaymentMethodId ||
    findPaymentMethodIdByType(paymentMethodType, settlementRules);

  const rule = resolveSettlementRule(
    rawLabel,
    paymentMethodType,
    resolvedPaymentMethodId,
    detectedCardBrand,
    detectedAcquirerName,
    settlementRules
  );

  const feePercent = Number(rule?.fee_percent || 0);
  const feeFixed = Number(rule?.fee_fixed || 0);
  const settlementDays = rule?.settlement_days ?? null;
  const receivesSameDay = rule?.receives_same_day ?? null;
  const defaultBankId = rule?.default_bank_id || null;

  const grossAmount = amount;
  const feeAmount = Number(((grossAmount * (feePercent / 100)) + feeFixed).toFixed(2));
  const netAmount = Number((grossAmount - feeAmount).toFixed(2));

  let mappedStatus: 'LIQUIDADO' | 'PROVISIONADO' | null = rule?.default_status || null;
  let dueDate: string | null = null;
  let liquidationDate: string | null = null;

  if (receivesSameDay === true) {
    mappedStatus = 'LIQUIDADO';
    dueDate = closingDate;
    liquidationDate = closingDate;
  } else if (settlementDays !== null) {
    mappedStatus = mappedStatus || 'PROVISIONADO';
    const date = new Date(closingDate + 'T12:00:00');
    date.setDate(date.getDate() + settlementDays);
    dueDate = date.toISOString().split('T')[0];

    if (mappedStatus === 'LIQUIDADO') {
      liquidationDate = dueDate;
    }
  }

  return {
    source,
    companyId,
    closingDate,
    rawLabel,
    normalizedLabel: rawLabel,
    paymentMethodType,
    amount,
    quantity: rawRow.quantity,
    percentage: rawRow.percentage,
    acquirerName: detectedAcquirerName || undefined,
    cardBrand: detectedCardBrand || undefined,
    channelName: rawRow.channel,
    paymentMethodId: rule?.payment_method_id || resolvedPaymentMethodId || null,
    mappedStatus,
    defaultBankId,
    settlementDays,
    receivesSameDay,
    feePercent,
    feeFixed,
    grossAmount,
    feeAmount,
    netAmount,
    dueDate,
    liquidationDate,
    shouldGenerateRevenuePosting: true,
    shouldGenerateFeePosting: feeAmount > 0,
    shouldGenerateReceiptPosting: false,
    notes: rawRow.notes
  };
}
