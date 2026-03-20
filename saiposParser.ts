import * as XLSX from 'xlsx';
import { normalizePdvClosingRow } from '../pdvClosingNormalizer';
import { NormalizedPdvClosingBatch, PaymentSettlementRule } from '../../types';

/**
 * Normaliza texto de cabeçalho para comparação sem depender de maiúsculas,
 * acentos ou pequenas variações.
 */
function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Converte valores monetários/textuais em número.
 */
function parseBrazilianNumber(value: unknown): number {
  if (typeof value === 'number') return value;

  const text = String(value ?? '').trim();
  if (!text) return 0;

  const normalized = text
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');

  const result = Number(normalized);
  return Number.isFinite(result) ? result : 0;
}

/**
 * Extrai a data do fechamento a partir do cabeçalho da planilha,
 * por exemplo: "Dia -20/03/2026"
 */
function extractClosingDateFromHeader(headers: string[], fallbackDate: string): string {
  for (const header of headers) {
    const match = header.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) {
      const [, dd, mm, yyyy] = match;
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  return fallbackDate;
}

/**
 * Localiza a chave real no objeto da linha com base em possíveis nomes.
 */
function findKey(row: Record<string, any>, candidates: string[]): string | null {
  const entries = Object.keys(row);
  const normalizedCandidates = candidates.map(normalizeHeader);

  for (const key of entries) {
    const normalizedKey = normalizeHeader(key);

    if (normalizedCandidates.includes(normalizedKey)) {
      return key;
    }

    for (const candidate of normalizedCandidates) {
      if (normalizedKey.includes(candidate) || candidate.includes(normalizedKey)) {
        return key;
      }
    }
  }

  return null;
}

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
  const workbook = XLSX.read(data, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
  const headerRow = (matrix[0] || []).map((cell) => String(cell ?? '').trim());

  const detectedClosingDate = extractClosingDateFromHeader(headerRow, closingDate);

  const rows = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[];

  const normalizedRows = rows
    .map((row) => {
      const labelKey = findKey(row, [
        'forma de pagamento',
        'meio de pagamento',
        'pagamento'
      ]);

      const amountKey = findKey(row, [
        'valor total dos pagamentos (r$)',
        'valor total dos pagamentos',
        'valor total',
        'valor',
        'total'
      ]);

      const quantityKey = findKey(row, [
        'quantidade de pagamentos',
        'quantidade',
        'qtd'
      ]);

      const percentageKey = findKey(row, [
        '%',
        'percentual'
      ]);

      const rawLabel = labelKey ? row[labelKey] : null;
      const rawAmount = amountKey ? row[amountKey] : null;

      if (!rawLabel || rawAmount === null || rawAmount === undefined || rawAmount === '') {
        return null;
      }

      const rawRow = {
        label: String(rawLabel).trim(),
        amount: parseBrazilianNumber(rawAmount),
        quantity: quantityKey ? parseBrazilianNumber(row[quantityKey]) : undefined,
        percentage: percentageKey ? String(row[percentageKey] ?? '').trim() : undefined
      };

      if (!rawRow.label || rawRow.amount <= 0) {
        return null;
      }

      return normalizePdvClosingRow(
        rawRow,
        'Saipos',
        companyId,
        detectedClosingDate,
        settlementRules
      );
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const totalGrossAmount = normalizedRows.reduce((acc, row) => acc + Number(row.grossAmount || 0), 0);
  const totalFeeAmount = normalizedRows.reduce((acc, row) => acc + Number(row.feeAmount || 0), 0);
  const totalNetAmount = normalizedRows.reduce((acc, row) => acc + Number(row.netAmount || 0), 0);

  return {
    source: 'Saipos',
    companyId,
    closingDate: detectedClosingDate,
    rows: normalizedRows,
    totalGrossAmount,
    totalFeeAmount,
    totalNetAmount,
    importedAt: new Date().toISOString()
  };
}