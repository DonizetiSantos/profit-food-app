import * as XLSX from 'xlsx';
import { normalizePdvClosingRow } from '../pdvClosingNormalizer';
import { NormalizedPdvClosingBatch, PaymentSettlementRule } from '../../types';

/**
 * Parses a Saipos POS closing export (Excel/CSV).
 */
export async function parseSaiposClosing(
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
    const rawRow = {
      label: row["Forma de Pagamento"] || row["Meio de Pagamento"] || row["Pagamento"],
      amount: row["Valor"] || row["Total"] || row["Valor Total"],
      quantity: row["Quantidade"] || row["Qtd"],
    };
    
    if (!rawRow.label || !rawRow.amount) return null;
    
    return normalizePdvClosingRow(rawRow, 'Saipos', companyId, closingDate, settlementRules);
  }).filter(row => row !== null) as any[];

  const totalGrossAmount = normalizedRows.reduce((acc, row) => acc + row.grossAmount, 0);
  const totalFeeAmount = normalizedRows.reduce((acc, row) => acc + row.feeAmount, 0);
  const totalNetAmount = normalizedRows.reduce((acc, row) => acc + row.netAmount, 0);

  return {
    source: 'Saipos',
    companyId,
    closingDate,
    rows: normalizedRows,
    totalGrossAmount,
    totalFeeAmount,
    totalNetAmount,
    importedAt: new Date().toISOString()
  };
}
