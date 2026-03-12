
import { supabase } from '../src/lib/supabase';

export interface XmlImportRecord {
  id: string;
  company_id: string;
  file_hash: string;
  file_name: string;
  supplier_cnpj: string;
  invoice_key: string;
  imported_at: string;
  status: 'imported' | 'error';
  error_message?: string;
}

export const xmlImportService = {
  async checkDuplicate(companyId: string, invoiceKey: string, fileHash: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('xml_imports')
      .select('id')
      .eq('company_id', companyId)
      .or(`invoice_key.eq.${invoiceKey},file_hash.eq.${fileHash}`)
      .maybeSingle();

    if (error) {
      console.error("Error checking XML duplicate:", error);
      return false;
    }

    return !!data;
  },

  async logImport(record: Omit<XmlImportRecord, 'id' | 'imported_at'>) {
    const { error } = await supabase
      .from('xml_imports')
      .insert({
        ...record,
        id: crypto.randomUUID(),
        imported_at: new Date().toISOString()
      });

    if (error) {
      console.error("Error logging XML import:", error);
    }
  }
};
