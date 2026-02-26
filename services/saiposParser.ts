import * as XLSX from 'xlsx';

export interface SaiposVendaRow {
  paymentLabel: string;
  amount: number;
  date: string; // YYYY-MM-DD
}

export interface SaiposParseResult {
  rows: SaiposVendaRow[];
  fromDate?: string;
  toDate?: string;
}

export const parseSaiposXlsx = async (file: File): Promise<SaiposParseResult> => {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data);
  
  // 1. Find the correct sheet
  let sheetName = workbook.SheetNames.find(name => name.includes('Vendas por forma de pagamento'));
  if (!sheetName) sheetName = workbook.SheetNames[0];
  
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
  
  if (jsonData.length < 1) {
    throw new Error('Planilha vazia ou inválida.');
  }

  // 2. Identify columns
  const headerRow = jsonData[0];
  const dayColumns: { index: number; date: string }[] = [];
  let paymentLabelIndex = 0;

  headerRow.forEach((cell, index) => {
    const cellStr = String(cell || '').trim();
    if (cellStr.toLowerCase().includes('forma de pagamento')) {
      paymentLabelIndex = index;
    } else if (cellStr.toLowerCase().startsWith('dia -')) {
      // Extract date from "Dia - 23/02/2026"
      const datePart = cellStr.split('-')[1]?.trim();
      if (datePart) {
        const [d, m, y] = datePart.split('/');
        if (d && m && y) {
          dayColumns.push({
            index,
            date: `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
          });
        }
      }
    }
  });

  if (dayColumns.length === 0) {
    // Fallback: look for "Valor total" if no daily columns found
    // But the requirement says "detectar colunas Dia - dd/mm/aaaa e usar elas"
    // If no daily columns, we might need to ask the user, but let's stick to the requirement.
    throw new Error('Nenhuma coluna de data ("Dia - dd/mm/aaaa") encontrada.');
  }

  // 3. Extract data
  const rows: SaiposVendaRow[] = [];
  let minDate: string | undefined;
  let maxDate: string | undefined;

  // Skip header row
  for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    const paymentLabel = String(row[paymentLabelIndex] || '').trim();
    
    if (!paymentLabel || paymentLabel.toLowerCase() === 'total') continue;

    dayColumns.forEach(col => {
      const amount = parseFloat(String(row[col.index] || '0').replace(',', '.'));
      if (amount > 0) {
        rows.push({
          paymentLabel,
          amount,
          date: col.date
        });

        if (!minDate || col.date < minDate) minDate = col.date;
        if (!maxDate || col.date > maxDate) maxDate = col.date;
      }
    });
  }

  return {
    rows,
    fromDate: minDate,
    toDate: maxDate
  };
};
