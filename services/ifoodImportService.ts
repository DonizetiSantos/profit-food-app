import { supabase } from '../src/lib/supabase';
import { sha1, sha256 } from './hash';

export interface IfoodImportPreviewItem {
  transactionDate: string;
  description: string;
  category: string | null;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  pixSentAmount: number;
  pixReceivedAmount: number;
  repasseAmount: number;
  itemsCount: number;
  hasPixSent: boolean;
  difference: number;
  rawRows: Record<string, string>[];
}

export interface IfoodImportPreview {
  fileName: string;
  fileHash: string;
  rows: IfoodImportPreviewItem[];
  totalRows: number;
  totalOriginalRows: number;
  totalGrossAmount: number;
  totalFeeAmount: number;
  totalNetAmount: number;
  totalAmount: number;
}

const REQUIRED_HEADERS = ['data da transação', 'descrição', 'valor', 'categoria'];

const normalizeHeader = (value: string) =>
  value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase();

const normalizeText = (value: string | null | undefined) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const parseCsvLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && insideQuotes && nextChar === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === ',' && !insideQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result;
};

const parseCsv = (text: string): Record<string, string>[] => {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    throw new Error('O arquivo CSV do iFood não possui linhas para importar.');
  }

  const originalHeaders = parseCsvLine(lines[0]);
  const normalizedHeaders = originalHeaders.map(normalizeHeader);

  const missingHeaders = REQUIRED_HEADERS.filter(
    (header) => !normalizedHeaders.includes(header)
  );

  if (missingHeaders.length > 0) {
    throw new Error(
      `CSV do iFood inválido. Colunas obrigatórias ausentes: ${missingHeaders.join(', ')}.`
    );
  }

  return lines.slice(1).map((line, rowIndex) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};

    normalizedHeaders.forEach((header, index) => {
      row[header] = values[index]?.trim() || '';
    });

    if (values.length > normalizedHeaders.length) {
      throw new Error(
        `Linha ${rowIndex + 2} inválida. O número de colunas é maior que o cabeçalho.`
      );
    }

    return row;
  });
};

const parseDate = (value: string, rowNumber: number): string => {
  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(`${trimmed}T00:00:00`);
    if (!Number.isNaN(date.getTime())) return trimmed;
  }

  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    const formatted = `${year}-${month}-${day}`;
    const date = new Date(`${formatted}T00:00:00`);
    if (!Number.isNaN(date.getTime())) return formatted;
  }

  throw new Error(`Data inválida na linha ${rowNumber}: ${value}`);
};

const parseAmount = (value: string, rowNumber: number): number => {
  const normalized = value
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const amount = Number(normalized);

  if (!Number.isFinite(amount)) {
    throw new Error(`Valor inválido na linha ${rowNumber}: ${value}`);
  }

  return amount;
};

const toMoney = (value: number): number => Number(value.toFixed(2));

const isFeeRow = (description: string, category: string | null) => {
  const text = `${normalizeText(description)} ${normalizeText(category)}`;
  return text.includes('taxa de antecipacao') || text.includes('antecipacao taxa');
};

const isPixSentRow = (description: string, category: string | null) => {
  const text = `${normalizeText(description)} ${normalizeText(category)}`;
  return text.includes('pix enviado');
};

const isPixReceivedRow = (description: string, category: string | null) => {
  const text = `${normalizeText(description)} ${normalizeText(category)}`;
  return text.includes('pix recebido');
};

const isRepasseRow = (description: string, category: string | null) => {
  const text = `${normalizeText(description)} ${normalizeText(category)}`;
  return text.includes('repasse ifood') || text.includes('antecipacao semanal');
};

interface ParsedIfoodRow {
  transactionDate: string;
  description: string;
  category: string | null;
  amount: number;
  rawRow: Record<string, string>;
}

const buildBatchPreviewRows = (rows: ParsedIfoodRow[]): IfoodImportPreviewItem[] => {
  const batches = new Map<string, ParsedIfoodRow[]>();

  rows.forEach((row) => {
    const current = batches.get(row.transactionDate) || [];
    current.push(row);
    batches.set(row.transactionDate, current);
  });

  return Array.from(batches.entries())
    .map(([transactionDate, batchRows]) => {
      const repasseAmount = toMoney(
        batchRows
          .filter((row) => isRepasseRow(row.description, row.category))
          .reduce((sum, row) => sum + Math.abs(row.amount), 0)
      );

      const pixReceivedAmount = toMoney(
        batchRows
          .filter((row) => isPixReceivedRow(row.description, row.category))
          .reduce((sum, row) => sum + Math.abs(row.amount), 0)
      );

      const feeAmount = toMoney(
        batchRows
          .filter((row) => isFeeRow(row.description, row.category))
          .reduce((sum, row) => sum + Math.abs(row.amount), 0)
      );

      const pixSentAmount = toMoney(
        batchRows
          .filter((row) => isPixSentRow(row.description, row.category))
          .reduce((sum, row) => sum + Math.abs(row.amount), 0)
      );

      const grossAmount = toMoney(repasseAmount + pixReceivedAmount);
      const calculatedNetAmount = toMoney(grossAmount - feeAmount);
      const hasPixSent = pixSentAmount > 0;
      const netAmount = hasPixSent ? pixSentAmount : 0;
      const difference = toMoney(calculatedNetAmount - netAmount);

      return {
        transactionDate,
        description: 'Repasse iFood consolidado',
        category: 'Repasse iFood',
        grossAmount,
        feeAmount,
        netAmount,
        pixSentAmount,
        pixReceivedAmount,
        repasseAmount,
        itemsCount: batchRows.length,
        hasPixSent,
        difference,
        rawRows: batchRows.map((row) => row.rawRow),
      };
    })
    .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));
};

export const ifoodImportService = {
  async preparePreview(file: File, companyId: string): Promise<IfoodImportPreview> {
    const text = await file.text();
    const fileHash = await sha256(text);

    const { data: existing, error: existingError } = await supabase
      .from('ifood_imports')
      .select('id')
      .eq('company_id', companyId)
      .eq('file_hash', fileHash)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
      throw new Error('Este arquivo do iFood já foi importado anteriormente.');
    }

    const parsedRows = parseCsv(text);

    const normalizedRows = parsedRows.map((row, index) => {
      const rowNumber = index + 2;
      const transactionDate = parseDate(row['data da transação'], rowNumber);
      const description = row['descrição']?.trim();
      const category = row['categoria']?.trim() || null;
      const amount = parseAmount(row.valor, rowNumber);

      if (!description) {
        throw new Error(`Descrição vazia na linha ${rowNumber}.`);
      }

      return {
        transactionDate,
        description,
        category,
        amount,
        rawRow: row,
      };
    });

    if (normalizedRows.length === 0) {
      throw new Error('Nenhuma linha válida encontrada no CSV do iFood.');
    }

    const rows = buildBatchPreviewRows(normalizedRows);

    if (rows.length === 0) {
      throw new Error('Nenhum lote válido encontrado no CSV do iFood.');
    }

    const totalGrossAmount = toMoney(
      rows.reduce((sum, row) => sum + Number(row.grossAmount || 0), 0)
    );

    const totalFeeAmount = toMoney(
      rows.reduce((sum, row) => sum + Number(row.feeAmount || 0), 0)
    );

    const totalNetAmount = toMoney(
      rows.reduce((sum, row) => sum + Number(row.netAmount || 0), 0)
    );

    return {
      fileName: file.name,
      fileHash,
      rows,
      totalRows: rows.length,
      totalOriginalRows: normalizedRows.length,
      totalGrossAmount,
      totalFeeAmount,
      totalNetAmount,
      totalAmount: totalNetAmount,
    };
  },

  async executeImport(preview: IfoodImportPreview, companyId: string, bankId: string): Promise<void> {
    if (!bankId) {
      throw new Error('Banco/conta não informado para gerar as movimentações de conciliação do iFood.');
    }

    const importId = crypto.randomUUID();

    const { error: importError } = await supabase.from('ifood_imports').insert({
      id: importId,
      company_id: companyId,
      file_name: preview.fileName,
      file_hash: preview.fileHash,
      status: 'imported',
      total_rows: preview.totalRows,
      total_amount: preview.totalNetAmount,
    });

    if (importError) throw importError;

    const importItems = preview.rows.map((row) => ({
      company_id: companyId,
      ifood_import_id: importId,
      transaction_date: row.transactionDate,
      description: row.description,
      category: row.category,
      amount: row.netAmount,
      raw_row: {
        source: 'ifood_csv_batch',
        gross_amount: row.grossAmount,
        fee_amount: row.feeAmount,
        net_amount: row.netAmount,
        pix_sent_amount: row.pixSentAmount,
        pix_received_amount: row.pixReceivedAmount,
        repasse_amount: row.repasseAmount,
        calculated_net_amount: toMoney(row.grossAmount - row.feeAmount),
        difference: row.difference,
        has_pix_sent: row.hasPixSent,
        items_count: row.itemsCount,
        original_rows: row.rawRows,
      },
      posting_id: null,
    }));

    const { error: itemsError } = await supabase
      .from('ifood_import_items')
      .insert(importItems);

    if (itemsError) throw itemsError;

    const rowsWithCashMovement = preview.rows.filter((row) => row.netAmount > 0);

    if (rowsWithCashMovement.length === 0) {
      return;
    }

    const bankTransactions = await Promise.all(
      rowsWithCashMovement.map(async (row, index) => {
        const fitIdPayload = `ifood_batch|${companyId}|${bankId}|${preview.fileHash}|${index}|${row.transactionDate}|${row.netAmount}`;
        const fitId = `IFOOD-${await sha1(fitIdPayload)}`;

        return {
          bank_id: bankId,
          company_id: companyId,
          posted_date: row.transactionDate,
          amount: row.netAmount,
          description: `IFOOD - Repasse líquido - ${row.transactionDate}`,
          fit_id: fitId,
          check_number: null,
          ofx_file_hash: preview.fileHash,
          raw: {
            source: 'ifood_csv',
            source_type: 'ifood_csv_batch',
            ifood_import_id: importId,
            file_name: preview.fileName,
            file_hash: preview.fileHash,
            gross_amount: row.grossAmount,
            fee_amount: row.feeAmount,
            net_amount: row.netAmount,
            pix_sent_amount: row.pixSentAmount,
            pix_received_amount: row.pixReceivedAmount,
            repasse_amount: row.repasseAmount,
            calculated_net_amount: toMoney(row.grossAmount - row.feeAmount),
            difference: row.difference,
            items_count: row.itemsCount,
            rows: row.rawRows,
          },
        };
      })
    );

    const { error: bankTxError } = await supabase
      .from('bank_transactions')
      .upsert(bankTransactions, { onConflict: 'bank_id,fit_id' });

    if (bankTxError) throw bankTxError;
  },
};
