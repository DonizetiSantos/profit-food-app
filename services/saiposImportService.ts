import { supabase } from '../src/lib/supabase';
import { sha256 } from './hash';
import { parseSaiposXlsx, SaiposVendaRow } from './saiposParser';
import { FinancialPosting, MainGroup } from '../types';
import { accountService } from './accountService';
import { settlementService } from './settlementService';

export interface PdvMapping {
  id?: string;
  source: string;
  raw_label: string;
  normalized_label?: string;
  payment_method_id?: string;
  default_status: 'LIQUIDADO' | 'PROVISIONADO';
  default_bank_id?: string;
}

export interface SaiposImportPreviewItem extends SaiposVendaRow {
  mapping?: PdvMapping;
  suggestedStatus: 'LIQUIDADO' | 'PROVISIONADO';
  suggestedBankId?: string;
  suggestedMethodId?: string;
}

export const saiposImportService = {
  async getMappings(labels: string[], companyId: string): Promise<Record<string, PdvMapping>> {
    const { data, error } = await supabase
      .from('pdv_payment_mapping')
      .select('*')
      .eq('source', 'SAIPOS')
      .eq('company_id', companyId)
      .in('raw_label', labels);

    if (error) throw error;

    const mappingMap: Record<string, PdvMapping> = {};
    data?.forEach(m => {
      mappingMap[m.raw_label] = m;
    });
    return mappingMap;
  },

  applyAutoRules(label: string): Partial<PdvMapping> {
    const lower = label.toLowerCase();
    
    if (lower.includes('dinheiro')) {
      return { default_status: 'LIQUIDADO', normalized_label: 'DINHEIRO' };
    }
    if (lower.includes('pix')) {
      return { default_status: 'LIQUIDADO', normalized_label: 'PIX' };
    }
    if (lower.includes('crédito') || lower.includes('credito')) {
      return { default_status: 'PROVISIONADO', normalized_label: 'CARTÃO CRÉDITO' };
    }
    if (lower.includes('débito') || lower.includes('debito')) {
      return { default_status: 'PROVISIONADO', normalized_label: 'CARTÃO DÉBITO' };
    }
    if (lower.includes('ifood')) {
      return { default_status: 'PROVISIONADO', normalized_label: 'IFOOD' };
    }
    if (lower.includes('voucher') || lower.includes('vale')) {
      return { default_status: 'PROVISIONADO', normalized_label: 'VOUCHER' };
    }

    return { default_status: 'PROVISIONADO' };
  },

  async preparePreview(file: File, companyId: string): Promise<{ 
    items: SaiposImportPreviewItem[]; 
    fileHash: string;
    fromDate?: string;
    toDate?: string;
  }> {
    const text = await file.text(); // For hash
    const fileHash = await sha256(text);

    // Check duplicate
    const { data: existing } = await supabase
      .from('pdv_imports')
      .select('id')
      .eq('company_id', companyId)
      .eq('file_hash', fileHash)
      .maybeSingle();

    if (existing) {
      throw new Error('Este arquivo já foi importado anteriormente.');
    }

    const parsed = await parseSaiposXlsx(file);
    const labels = Array.from(new Set(parsed.rows.map(r => r.paymentLabel)));
    const mappings = await this.getMappings(labels, companyId);

    const items: SaiposImportPreviewItem[] = parsed.rows.map(row => {
      const mapping = mappings[row.paymentLabel];
      const auto = this.applyAutoRules(row.paymentLabel);

      return {
        ...row,
        mapping,
        suggestedStatus: mapping?.default_status || auto.default_status || 'PROVISIONADO',
        suggestedBankId: mapping?.default_bank_id,
        suggestedMethodId: mapping?.payment_method_id
      };
    });

    return {
      items,
      fileHash,
      fromDate: parsed.fromDate,
      toDate: parsed.toDate
    };
  },

  async executeImport(
    fileHash: string,
    fileName: string,
    items: SaiposImportPreviewItem[],
    companyId: string,
    fromDate?: string,
    toDate?: string,
    caixaEmpresaId?: string
  ): Promise<{ warnings: string[] }> {
    const accountId = await settlementService.resolveCompanyRevenueAccount(companyId);
    const feeAccountId = await settlementService.resolveCompanyFeeAccount(companyId);
    const warnings: string[] = [];

    if (!accountId) {
      throw new Error('Não foi possível resolver a conta de Vendas Gerais.');
    }

    if (!feeAccountId) {
      console.warn('[SaiposImport] Conta de taxas não encontrada para a empresa. As taxas não serão lançadas separadamente.');
      warnings.push('Conta de taxas não encontrada. As taxas automáticas não foram lançadas.');
    }
    
    // 1. Create PDV Import record
    const importId = crypto.randomUUID();
    const { error: importError } = await supabase
      .from('pdv_imports')
      .insert({
        id: importId,
        company_id: companyId,
        source: 'SAIPOS',
        file_hash: fileHash,
        file_name: fileName,
        from_date: fromDate,
        to_date: toDate,
        total_rows: items.length,
        status: 'IMPORTED'
      });

    if (importError) throw importError;

    // 2. Prepare Postings and Mappings
    const postings: any[] = [];
    const mappingsToUpsert: any[] = [];
    const seenLabels = new Set<string>();

    for (const item of items) {
      const postingId = crypto.randomUUID();
      
      // Resolve settlement rules
      const settlement = await settlementService.resolvePaymentSettlement(
        companyId,
        item.suggestedMethodId || null,
        item.amount,
        item.date
      );

      // Determine bank
      let bankId = item.suggestedBankId;
      if (!bankId && settlement.status === 'LIQUIDADO') {
        if (item.paymentLabel.toLowerCase().includes('dinheiro')) {
          bankId = caixaEmpresaId;
        }
      }

      // Main Revenue Posting (Gross Amount)
      postings.push({
        id: postingId,
        company_id: companyId,
        status: settlement.status,
        competence_date: item.date,
        occurrence_date: item.date,
        due_date: settlement.dueDate,
        liquidation_date: settlement.liquidationDate,
        group: 'RECEITAS',
        account_id: accountId,
        observations: `Importação Saipos - ${item.paymentLabel}`,
        payment_method_id: item.suggestedMethodId || null,
        amount: item.amount,
        bank_id: bankId || null
      });

      // Fee Posting (if applicable)
      if (settlement.feeAmount > 0 && feeAccountId) {
        postings.push({
          id: crypto.randomUUID(),
          company_id: companyId,
          status: settlement.status,
          competence_date: item.date,
          occurrence_date: item.date,
          due_date: settlement.dueDate,
          liquidation_date: settlement.liquidationDate,
          group: 'DESPESAS',
          account_id: feeAccountId,
          observations: `Taxa ${item.paymentLabel} - Ref. Saipos ${item.date}`,
          payment_method_id: item.suggestedMethodId || null,
          amount: settlement.feeAmount,
          bank_id: bankId || null
        });
      }

      if (!seenLabels.has(item.paymentLabel)) {
        mappingsToUpsert.push({
          company_id: companyId,
          source: 'SAIPOS',
          raw_label: item.paymentLabel,
          payment_method_id: item.suggestedMethodId || null,
          default_status: item.suggestedStatus,
          default_bank_id: item.suggestedBankId || null
        });
        seenLabels.add(item.paymentLabel);
      }
    }

    // 3. Persist everything
    // Upsert mappings
    if (mappingsToUpsert.length > 0) {
      await supabase.from('pdv_payment_mapping').upsert(mappingsToUpsert, { onConflict: 'company_id, source, raw_label' });
    }

    // Insert postings
    const { error: postError } = await supabase.from('postings').insert(postings);
    if (postError) throw postError;

    // Insert import items
    // Note: We only link the main revenue posting to the import item for tracking
    const importItems = items.map((item, i) => {
      // The main posting for this item is at index i * (1 or 2)
      // But it's safer to find it by ID if we stored it.
      // Let's just use the postings array we built.
      // Actually, the postings array has 1 or 2 entries per item.
      // Let's find the revenue posting for this item.
      const mainPosting = postings.find(p => 
        p.amount === item.amount && 
        p.group === 'RECEITAS' && 
        p.observations.includes(item.paymentLabel) &&
        p.competence_date === item.date
      );

      return {
        company_id: companyId,
        pdv_import_id: importId,
        posting_id: mainPosting?.id || postings[0].id, // Fallback
        raw_label: item.paymentLabel,
        amount: item.amount,
        day: item.date
      };
    });

    await supabase.from('pdv_import_items').insert(importItems);

    return { warnings };
  }
};
