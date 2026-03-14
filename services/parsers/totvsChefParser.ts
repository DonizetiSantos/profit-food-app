import * as XLSX from 'xlsx';
import { normalizePdvClosingRow } from '../pdvClosingNormalizer';
import { NormalizedPdvClosingBatch, PaymentSettlementRule } from '../../types';

/**
 * Placeholder for Totvs Chef POS closing export parser.
 */
export async function parseTotvsChefClosing(
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
      label: row["Descricao"] || row["Pagamento"],
      amount: row["ValorLiquido"] || row["Valor"],
    };
    
    if (!rawRow.label || !rawRow.amount) return null;
    
    return normalizePdvClosingRow(rawRow, 'TotvsChef', companyId, closingDate, settlementRules);
  }).filter(row => row !== null) as any[];

  const totalGrossAmount = normalizedRows.reduce((acc, row) => acc + row.grossAmount, 0);
  const totalFeeAmount = normalizedRows.reduce((acc, row) => acc + row.feeAmount, 0);
  const totalNetAmount = normalizedRows.reduce((acc, row) => acc + row.netAmount, 0);

  return {
    source: 'TotvsChef',
    companyId,
    closingDate,
    rows: normalizedRows,
    totalGrossAmount,
    totalFeeAmount,
    totalNetAmount,
    importedAt: new Date().toISOString(),
    notes: 'Importação via Totvs Chef (Beta)'
  };
}
