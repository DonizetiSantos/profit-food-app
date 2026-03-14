import * as XLSX from 'xlsx';
import { normalizePdvClosingRow } from '../pdvClosingNormalizer';
import { NormalizedPdvClosingBatch, PaymentSettlementRule } from '../../types';

/**
 * Generic spreadsheet parser for PDV closing.
 * Tries to detect columns for label and amount.
 */
export async function parseGenericClosing(
  file: File | ArrayBuffer,
  companyId: string,
  closingDate: string,
  settlementRules: PaymentSettlementRule[]
): Promise<NormalizedPdvClosingBatch> {
  const data = file instanceof File ? await file.arrayBuffer() : file;
  const workbook = XLSX.read(data);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  const rows = XLSX.utils.sheet_to_json(worksheet) as any[];

  const normalizedRows = rows.map(row => {
    const keys = Object.keys(row);
    const labelKey = keys.find(k => k.toLowerCase().includes('pagamento') || k.toLowerCase().includes('forma') || k.toLowerCase().includes('meio'));
    const amountKey = keys.find(k => k.toLowerCase().includes('valor') || k.toLowerCase().includes('total') || k.toLowerCase().includes('montante'));

    const rawRow = {
      label: labelKey ? row[labelKey] : null,
      amount: amountKey ? row[amountKey] : null,
    };
    
    if (!rawRow.label || !rawRow.amount) return null;
    
    return normalizePdvClosingRow(rawRow, 'Generic', companyId, closingDate, settlementRules);
  }).filter(row => row !== null) as any[];

  const totalGrossAmount = normalizedRows.reduce((acc, row) => acc + row.grossAmount, 0);
  const totalFeeAmount = normalizedRows.reduce((acc, row) => acc + row.feeAmount, 0);
  const totalNetAmount = normalizedRows.reduce((acc, row) => acc + row.netAmount, 0);

  return {
    source: 'Generic',
    companyId,
    closingDate,
    rows: normalizedRows,
    totalGrossAmount,
    totalFeeAmount,
    totalNetAmount,
    importedAt: new Date().toISOString()
  };
}
