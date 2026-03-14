import { supabase } from '../src/lib/supabase';
import { sha256 } from './hash';
import { detectPdvSource, PdvSource } from './pdvSourceDetector';
import { parseSaiposClosing } from './parsers/saiposParser';
import { parseTotvsChefClosing } from './parsers/totvsChefParser';
import { parseGenericClosing } from './parsers/genericSpreadsheetParser';
import { NormalizedPdvClosingBatch, PaymentSettlementRule } from '../types';
import { settlementService } from './settlementService';

export interface PdvImportPreview {
  source: PdvSource;
  batch: NormalizedPdvClosingBatch;
  fileHash: string;
}

export const pdvImportService = {
  async preparePreview(file: File, companyId: string): Promise<PdvImportPreview> {
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

    const source = await detectPdvSource(file);

    const { data: rules, error: rulesError } = await supabase
      .from('payment_settlement_rules')
      .select('*, payment_methods(name)')
      .eq('company_id', companyId)
      .eq('is_active', true);

    if (rulesError) {
      throw rulesError;
    }

    const settlementRules = (rules || []) as PaymentSettlementRule[];
    const today = new Date().toISOString().split('T')[0];

    let batch: NormalizedPdvClosingBatch;

    switch (source) {
      case 'saipos':
        batch = await parseSaiposClosing(file, companyId, today, settlementRules);
        break;
      case 'totvs_chef':
        batch = await parseTotvsChefClosing(file, companyId, today, settlementRules);
        break;
      case 'generic_spreadsheet':
        batch = await parseGenericClosing(file, companyId, today, settlementRules);
        break;
      default:
        batch = await parseGenericClosing(file, companyId, today, settlementRules);
        if (batch.rows.length === 0) {
          throw new Error(
            'Não foi possível reconhecer a estrutura do arquivo. Verifique se o arquivo contém colunas de forma de pagamento e valor.'
          );
        }
        break;
    }

    const labels = Array.from(new Set(batch.rows.map((r) => r.rawLabel)));

    if (labels.length > 0) {
      const { data: mappings, error: mappingsError } = await supabase
        .from('pdv_payment_mapping')
        .select('*')
        .eq('company_id', companyId)
        .eq('source', source.toUpperCase())
        .in('raw_label', labels);

      if (mappingsError) {
        throw mappingsError;
      }

      if (mappings && mappings.length > 0) {
        const mappingMap = mappings.reduce(
          (acc, m) => {
            acc[m.raw_label] = m;
            return acc;
          },
          {} as Record<string, any>
        );

        batch.rows = batch.rows.map((row) => {
          const mapping = mappingMap[row.rawLabel];
          if (mapping) {
            return {
              ...row,
              paymentMethodId: row.paymentMethodId || mapping.payment_method_id,
              mappedStatus: row.mappedStatus || mapping.default_status,
              defaultBankId: row.defaultBankId || mapping.default_bank_id,
            };
          }
          return row;
        });
      }
    }

    return {
      source,
      batch,
      fileHash,
    };
  },

  async executeImport(
    preview: PdvImportPreview,
    companyId: string,
    caixaEmpresaId?: string
  ): Promise<{ warnings: string[] }> {
    const { batch, fileHash, source } = preview;
    const warnings: string[] = [];

    const accountId = await settlementService.resolveCompanyRevenueAccount(companyId);
    const feeAccountId = await settlementService.resolveCompanyFeeAccount(companyId);

    if (!accountId) {
      throw new Error('Não foi possível resolver a conta de Vendas Gerais.');
    }

    const importId = crypto.randomUUID();

    const { error: importError } = await supabase
      .from('pdv_imports')
      .insert({
        id: importId,
        company_id: companyId,
        source: source.toUpperCase(),
        file_hash: fileHash,
        file_name: `Importação ${source} ${batch.closingDate}`,
        from_date: batch.closingDate,
        to_date: batch.closingDate,
        total_rows: batch.rows.length,
        status: 'IMPORTED',
      });

    if (importError) {
      throw importError;
    }

    const postings: any[] = [];
    const importItems: any[] = [];
    const mappingsToUpsert: any[] = [];
    const seenLabels = new Set<string>();

    for (const row of batch.rows) {
      let revenuePostingId: string | null = null;

      let bankId = row.defaultBankId;

      if (!bankId && row.mappedStatus === 'LIQUIDADO') {
        if (row.paymentMethodType === 'DINHEIRO') {
          bankId = caixaEmpresaId;
        }
      }

      if (row.shouldGenerateRevenuePosting) {
        revenuePostingId = crypto.randomUUID();

        postings.push({
          id: revenuePostingId,
          company_id: companyId,
          status: row.mappedStatus || 'PROVISIONADO',
          competence_date: row.closingDate,
          occurrence_date: row.closingDate,
          due_date: row.dueDate || row.closingDate,
          liquidation_date: row.liquidationDate,
          group: 'RECEITAS',
          account_id: accountId,
          observations: `Venda PDV (${source}) - ${row.rawLabel}`,
          payment_method_id: row.paymentMethodId,
          amount: row.grossAmount,
          bank_id: bankId || null,
        });
      }

      if (row.shouldGenerateFeePosting && feeAccountId) {
        postings.push({
          id: crypto.randomUUID(),
          company_id: companyId,
          status: row.mappedStatus || 'PROVISIONADO',
          competence_date: row.closingDate,
          occurrence_date: row.closingDate,
          due_date: row.dueDate || row.closingDate,
          liquidation_date: row.liquidationDate,
          group: 'DESPESAS',
          account_id: feeAccountId,
          observations: `Taxa PDV (${source}) - ${row.rawLabel}`,
          payment_method_id: row.paymentMethodId,
          amount: row.feeAmount,
          bank_id: bankId || null,
        });
      }

      if (revenuePostingId) {
        importItems.push({
          company_id: companyId,
          pdv_import_id: importId,
          posting_id: revenuePostingId,
          raw_label: row.rawLabel,
          amount: row.grossAmount,
          day: row.closingDate,
        });
      }

      if (!seenLabels.has(row.rawLabel)) {
        mappingsToUpsert.push({
          company_id: companyId,
          source: source.toUpperCase(),
          raw_label: row.rawLabel,
          payment_method_id: row.paymentMethodId,
          default_status: row.mappedStatus || 'PROVISIONADO',
          default_bank_id: row.defaultBankId || null,
        });
        seenLabels.add(row.rawLabel);
      }
    }

    if (mappingsToUpsert.length > 0) {
      const { error: mappingsUpsertError } = await supabase
        .from('pdv_payment_mapping')
        .upsert(mappingsToUpsert, { onConflict: 'company_id, source, raw_label' });

      if (mappingsUpsertError) {
        throw mappingsUpsertError;
      }
    }

    if (postings.length > 0) {
      const { error: postError } = await supabase.from('postings').insert(postings);
      if (postError) {
        throw postError;
      }
    }

    if (importItems.length > 0) {
      const { error: importItemsError } = await supabase
        .from('pdv_import_items')
        .insert(importItems);

      if (importItemsError) {
        throw importItemsError;
      }
    }

    return { warnings };
  },
};