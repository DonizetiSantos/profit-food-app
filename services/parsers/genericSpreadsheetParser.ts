import * as XLSX from 'xlsx';
import { normalizePdvClosingRow } from '../pdvClosingNormalizer';
import { NormalizedPdvClosingBatch, PaymentSettlementRule } from '../../types';

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseFlexibleNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const text = String(value ?? '').trim();
  if (!text) return 0;

  const cleaned = text
    .replace(/\s/g, '')
    .replace(/[Rr]\$/g, '')
    .replace(/[^\d,.-]/g, '');

  if (!cleaned) return 0;

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  let normalized = cleaned;

  if (hasComma && hasDot) {
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');

    if (lastComma > lastDot) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (hasComma) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (hasDot) {
    const parts = cleaned.split('.');

    if (parts.length > 2) {
      const decimalPart = parts.pop() ?? '0';
      normalized = `${parts.join('')}.${decimalPart}`;
    } else {
      normalized = cleaned;
    }
  }

  const result = Number(normalized);
  return Number.isFinite(result) ? result : 0;
}

function findKey(row: Record<string, any>, candidates: string[]): string | null {
  const keys = Object.keys(row);
  const normalizedCandidates = candidates.map(normalizeHeader);

  for (const key of keys) {
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
 * Parser genérico para fechamentos de PDV.
 * Tenta detectar automaticamente colunas de forma de pagamento e valor.
 * Agora trata corretamente números com vírgula e com ponto decimal.
 */
export async function parseGenericClosing(
  file: File | ArrayBuffer,
  companyId: string,
  closingDate: string,
  settlementRules: PaymentSettlementRule[]
): Promise<NormalizedPdvClosingBatch> {
  const data = file instanceof File ? await file.arrayBuffer() : file;
  const workbook = XLSX.read(data, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  const rows = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[];

  const normalizedRows = rows
    .map((row) => {
      const labelKey = findKey(row, [
        'forma de pagamento',
        'meio de pagamento',
        'pagamento',
        'descricao',
        'descrição',
        'forma',
        'meio'
      ]);

      const amountKey = findKey(row, [
        'valor total dos pagamentos (r$)',
        'valor total dos pagamentos',
        'valor liquido',
        'valor líquido',
        'valor',
        'total',
        'montante'
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
        amount: parseFlexibleNumber(rawAmount),
        quantity: quantityKey ? parseFlexibleNumber(row[quantityKey]) : undefined,
        percentage: percentageKey ? String(row[percentageKey] ?? '').trim() : undefined
      };

      if (!rawRow.label || rawRow.amount <= 0) {
        return null;
      }

      return normalizePdvClosingRow(
        rawRow,
        'Generic',
        companyId,
        closingDate,
        settlementRules
      );
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const totalGrossAmount = normalizedRows.reduce((acc, row) => acc + Number(row.grossAmount || 0), 0);
  const totalFeeAmount = normalizedRows.reduce((acc, row) => acc + Number(row.feeAmount || 0), 0);
  const totalNetAmount = normalizedRows.reduce((acc, row) => acc + Number(row.netAmount || 0), 0);

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