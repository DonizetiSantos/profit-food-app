import { supabase } from '../src/lib/supabase';
import { sha1, sha256 } from './hash';

export interface IfoodImportPreviewItem {
  transactionDate: string;
  description: string;
  category: string | null;
  amount: number;
  bankAmount: number;
  rawRow: Record<string, string>;
}

export interface IfoodImportPreview {
  fileName: string;
  fileHash: string;
  rows: IfoodImportPreviewItem[];
  totalRows: number;
  totalAmount: number;
}

const REQUIRED_HEADERS = ['data da transação', 'descrição', 'valor', 'categoria'];

const normalizeHeader = (value: string) =>
  value
    .replace(/^\uFEFF/, '')
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


const getBankTransactionAmount = (description: string, category: string | null, amount: number): number => {
  const text = `${description || ''} ${category || ''}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

  if (text.includes('enviado') || text.includes('saida') || text.includes('débito') || text.includes('debito')) {
    return toMoney(-Math.abs(amount));
  }

  if (text.includes('recebido') || text.includes('repasse') || text.includes('entrada') || text.includes('crédito') || text.includes('credito')) {
    return toMoney(Math.abs(amount));
  }

  return toMoney(amount);
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

    const rows = parsedRows.map((row, index) => {
      const rowNumber = index + 2;
      const transactionDate = parseDate(row['data da transação'], rowNumber);
      const description = row['descrição']?.trim();
      const category = row['categoria']?.trim() || null;
      const amount = parseAmount(row.valor, rowNumber);

      if (!description) {
        throw new Error(`Descrição vazia na linha ${rowNumber}.`);
      }

      const bankAmount = getBankTransactionAmount(description, category, amount);

      return {
        transactionDate,
        description,
        category,
        amount,
        bankAmount,
        rawRow: row,
      };
    });

    if (rows.length === 0) {
      throw new Error('Nenhuma linha válida encontrada no CSV do iFood.');
    }

    const totalAmount = toMoney(
      rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
    );

    return {
      fileName: file.name,
      fileHash,
      rows,
      totalRows: rows.length,
      totalAmount,
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
      total_amount: preview.totalAmount,
    });

    if (importError) throw importError;

    const importItems = preview.rows.map((row) => ({
      company_id: companyId,
      ifood_import_id: importId,
      transaction_date: row.transactionDate,
      description: row.description,
      category: row.category,
      amount: row.amount,
      raw_row: row.rawRow,
      posting_id: null,
    }));

    const { error: itemsError } = await supabase
      .from('ifood_import_items')
      .insert(importItems);

    if (itemsError) throw itemsError;

    const bankTransactions = await Promise.all(
      preview.rows.map(async (row, index) => {
        const fitIdPayload = `ifood|${companyId}|${bankId}|${preview.fileHash}|${index}|${row.transactionDate}|${row.bankAmount}|${row.description}`;
        const fitId = `IFOOD-${await sha1(fitIdPayload)}`;

        return {
          bank_id: bankId,
          company_id: companyId,
          posted_date: row.transactionDate,
          amount: row.bankAmount,
          description: `IFOOD - ${row.description}${row.category ? ` - ${row.category}` : ''}`,
          fit_id: fitId,
          check_number: null,
          ofx_file_hash: preview.fileHash,
          raw: {
            source: 'ifood_csv',
            ifood_import_id: importId,
            file_name: preview.fileName,
            file_hash: preview.fileHash,
            original_amount: row.amount,
            bank_amount: row.bankAmount,
            row: row.rawRow,
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
