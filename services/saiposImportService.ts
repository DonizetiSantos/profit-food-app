import { supabase } from '../src/lib/supabase';
import { sha256 } from './hash';
import { parseSaiposClosing } from './parsers/saiposParser';
import { PaymentSettlementRule } from '../types';
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

export interface SaiposImportPreviewItem {
  date: string;
  paymentLabel: string;
  amount: number;
  mapping?: PdvMapping;
  suggestedStatus: 'LIQUIDADO' | 'PROVISIONADO';
  suggestedBankId?: string;
  suggestedMethodId?: string;
}

const normalizeText = (value: string | null | undefined) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const isCashLabel = (label: string) => normalizeText(label).includes('dinheiro');

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
    data?.forEach((m) => {
      mappingMap[m.raw_label] = m;
    });
    return mappingMap;
  },

  applyAutoRules(label: string): Partial<PdvMapping> {
    const lower = normalizeText(label);

    if (lower.includes('dinheiro')) {
      return { default_status: 'LIQUIDADO', normalized_label: 'DINHEIRO' };
    }
    if (lower.includes('pix')) {
      return { default_status: 'LIQUIDADO', normalized_label: 'PIX' };
    }
    if (lower.includes('credito')) {
      return { default_status: 'PROVISIONADO', normalized_label: 'CARTÃO CRÉDITO' };
    }
    if (lower.includes('debito')) {
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

  async preparePreview(
    file: File,
    companyId: string
  ): Promise<{
    items: SaiposImportPreviewItem[];
    fileHash: string;
    fromDate?: string;
    toDate?: string;
  }> {
    const text = await file.text();
    const fileHash = await sha256(text);

    const { data: existing } = await supabase
      .from('pdv_imports')
      .select('id')
      .eq('company_id', companyId)
      .eq('file_hash', fileHash)
      .maybeSingle();

    if (existing) {
      throw new Error('Este arquivo já foi importado anteriormente.');
    }

    const { data: rules } = await supabase
      .from('payment_settlement_rules')
      .select('*, payment_methods(name)')
      .eq('company_id', companyId)
      .eq('is_active', true);

    const settlementRules = (rules || []) as PaymentSettlementRule[];
    const fallbackDate = new Date().toISOString().split('T')[0];
    const parsed = await parseSaiposClosing(file, companyId, fallbackDate, settlementRules);

    const labels = Array.from(new Set(parsed.rows.map((r) => r.rawLabel)));
    const mappings = await this.getMappings(labels, companyId);

    const items: SaiposImportPreviewItem[] = parsed.rows.map((row) => {
      const mapping = mappings[row.rawLabel];
      const auto = this.applyAutoRules(row.rawLabel);
      const cash = isCashLabel(row.rawLabel);

      return {
        date: row.closingDate,
        paymentLabel: row.rawLabel,
        amount: Number(row.grossAmount || row.amount || 0),
        mapping,
        suggestedStatus: cash
          ? 'LIQUIDADO'
          : (mapping?.default_status || row.mappedStatus || auto.default_status || 'PROVISIONADO'),
        suggestedBankId: cash
          ? (mapping?.default_bank_id || row.defaultBankId || undefined)
          : (mapping?.default_bank_id || row.defaultBankId || undefined),
        suggestedMethodId: mapping?.payment_method_id || row.paymentMethodId || undefined
      };
    });

    return {
      items,
      fileHash,
      fromDate: parsed.closingDate,
      toDate: parsed.closingDate
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

    const postings: any[] = [];
    const mappingsToUpsert: any[] = [];
    const importItems: any[] = [];
    const seenLabels = new Set<string>();

    for (const item of items) {
      const postingId = crypto.randomUUID();
      const settlement = await settlementService.resolvePaymentSettlement(
        companyId,
        item.suggestedMethodId || null,
        item.amount,
        item.date
      );

      const cash = isCashLabel(item.paymentLabel);
      const finalStatus: 'LIQUIDADO' | 'PROVISIONADO' = cash ? 'LIQUIDADO' : item.suggestedStatus;
      const finalDueDate = finalStatus === 'LIQUIDADO' ? item.date : (settlement.dueDate || item.date);
      const finalLiquidationDate = finalStatus === 'LIQUIDADO' ? item.date : null;
      const bankId = cash
        ? (caixaEmpresaId || item.suggestedBankId || null)
        : (item.suggestedBankId || null);

      postings.push({
        id: postingId,
        company_id: companyId,
        status: finalStatus,
        competence_date: item.date,
        occurrence_date: item.date,
        due_date: finalDueDate,
        liquidation_date: finalLiquidationDate,
        group: 'RECEITAS',
        account_id: accountId,
        observations: `Importação Saipos - ${item.paymentLabel}`,
        payment_method_id: item.suggestedMethodId || null,
        amount: item.amount,
        bank_id: bankId
      });

      if (settlement.feeAmount > 0 && feeAccountId) {
        postings.push({
          id: crypto.randomUUID(),
          company_id: companyId,
          status: finalStatus,
          competence_date: item.date,
          occurrence_date: item.date,
          due_date: finalDueDate,
          liquidation_date: finalLiquidationDate,
          group: 'DESPESAS',
          account_id: feeAccountId,
          observations: `Taxa ${item.paymentLabel} - Ref. Saipos ${item.date}`,
          payment_method_id: item.suggestedMethodId || null,
          amount: settlement.feeAmount,
          bank_id: bankId
        });
      }

      importItems.push({
        company_id: companyId,
        pdv_import_id: importId,
        posting_id: postingId,
        raw_label: item.paymentLabel,
        amount: item.amount,
        day: item.date
      });

      if (!seenLabels.has(item.paymentLabel)) {
        mappingsToUpsert.push({
          company_id: companyId,
          source: 'SAIPOS',
          raw_label: item.paymentLabel,
          payment_method_id: item.suggestedMethodId || null,
          default_status: cash ? 'LIQUIDADO' : item.suggestedStatus,
          default_bank_id: cash
            ? (caixaEmpresaId || item.suggestedBankId || null)
            : (item.suggestedBankId || null)
        });
        seenLabels.add(item.paymentLabel);
      }
    }

    if (mappingsToUpsert.length > 0) {
      const { error: mappingError } = await supabase
        .from('pdv_payment_mapping')
        .upsert(mappingsToUpsert, { onConflict: 'company_id, source, raw_label' });
      if (mappingError) throw mappingError;
    }

    if (postings.length > 0) {
      const { error: postError } = await supabase.from('postings').insert(postings);
      if (postError) throw postError;
    }

    if (importItems.length > 0) {
      const { error: importItemsError } = await supabase.from('pdv_import_items').insert(importItems);
      if (importItemsError) throw importItemsError;
    }

    return { warnings };
  }
};
