import { NormalizedPdvClosing, ProfitFoodPaymentType, PaymentSettlementRule } from '../types';

/**
 * Detects the Profit Food payment type based on a raw label from PDV.
 */
export function detectPaymentType(rawLabel: string): ProfitFoodPaymentType {
  const label = rawLabel.toLowerCase();
  if (label.includes('pix')) return 'PIX';
  if (label.includes('dinheiro')) return 'DINHEIRO';
  if (label.includes('debito') || label.includes('débito')) return 'CARTAO_DEBITO';
  if (label.includes('credito') || label.includes('crédito')) return 'CARTAO_CREDITO';
  if (label.includes('voucher')) return 'VOUCHER';
  if (label.includes('ifood') || label.includes('app')) return 'APLICATIVO';
  return 'OUTROS';
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
  const rawLabel = rawRow.label || rawRow.paymentMethod || '';
  const amount = Number(rawRow.amount) || 0;
  
  const paymentMethodType = detectPaymentType(rawLabel);
  
  // Find matching rule by payment method name or ID
  const rule = settlementRules.find(r => 
    r.payment_methods?.name.toLowerCase() === rawLabel.toLowerCase() ||
    r.payment_method_id === rawRow.paymentMethodId
  );

  const feePercent = rule?.fee_percent || 0;
  const feeFixed = rule?.fee_fixed || 0;
  const settlementDays = rule?.settlement_days ?? null;
  const receivesSameDay = rule?.receives_same_day ?? null;
  const defaultBankId = rule?.default_bank_id || null;

  // Financial calculations
  const grossAmount = amount;
  const feeAmount = (grossAmount * (feePercent / 100)) + feeFixed;
  const netAmount = grossAmount - feeAmount;

  // Status and Dates
  let mappedStatus: 'LIQUIDADO' | 'PROVISIONADO' | null = rule?.default_status || null;
  let dueDate: string | null = null;
  let liquidationDate: string | null = null;

  if (receivesSameDay === true) {
    mappedStatus = 'LIQUIDADO';
    liquidationDate = closingDate;
  } else if (settlementDays !== null) {
    mappedStatus = 'PROVISIONADO';
    const date = new Date(closingDate + 'T12:00:00'); // Use noon to avoid timezone issues
    date.setDate(date.getDate() + settlementDays);
    dueDate = date.toISOString().split('T')[0];
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
    acquirerName: rawRow.acquirer,
    cardBrand: rawRow.brand,
    channelName: rawRow.channel,
    paymentMethodId: rule?.payment_method_id || null,
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
