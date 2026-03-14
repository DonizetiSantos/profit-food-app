import * as XLSX from 'xlsx';

export type PdvSource = 'saipos' | 'totvs_chef' | 'generic_spreadsheet' | 'unknown';

/**
 * Detects the source of a PDV closing file based on its structure/headers.
 */
export async function detectPdvSource(file: File | ArrayBuffer): Promise<PdvSource> {
  try {
    const data = file instanceof File ? await file.arrayBuffer() : file;
    const workbook = XLSX.read(data, { sheetRows: 5 }); // Only read first few rows for detection
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON to get headers
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
    if (rows.length === 0) return 'unknown';
    
    const headers = rows[0].map(h => String(h).toLowerCase());
    
    // Saipos detection
    const saiposKeywords = ['forma de pagamento', 'meio de pagamento', 'valor total', 'quantidade'];
    const saiposMatches = headers.filter(h => saiposKeywords.some(k => h.includes(k)));
    if (saiposMatches.length >= 2) return 'saipos';
    
    // Totvs Chef detection
    const totvsKeywords = ['descricao', 'valorliquido', 'pagamento'];
    const totvsMatches = headers.filter(h => totvsKeywords.some(k => h.includes(k)));
    if (totvsMatches.length >= 2) return 'totvs_chef';
    
    // Generic detection
    const genericKeywords = ['pagamento', 'valor', 'total', 'data', 'meio'];
    const genericMatches = headers.filter(h => genericKeywords.some(k => h.includes(k)));
    if (genericMatches.length >= 1) return 'generic_spreadsheet';
    
    return 'unknown';
  } catch (error) {
    console.error('Error detecting PDV source:', error);
    return 'unknown';
  }
}
