import { supabase } from '../src/lib/supabase';
import { Bank, PaymentMethod, Entity, Account, FinancialPosting, XmlMapping } from '../types';

export interface AppState {
  banks: Bank[];
  paymentMethods: PaymentMethod[];
  favored: Entity[];
  accounts: Account[];
  postings: FinancialPosting[];
  xmlMappings: XmlMapping[];
}

const LOCAL_STORAGE_KEYS = {
  BANKS: 'pf_banks',
  PAYMENT_METHODS: 'pf_payment_methods',
  ENTITIES: 'pf_entities',
  ACCOUNTS: 'pf_accounts',
  POSTINGS: 'pf_postings',
  XML_MAPPINGS: 'pf_xml_mappings'
};

// Helper to map JS objects to DB snake_case for Supabase
const mapToDb = (table: string, data: any, companyId: string) => {
  const base = { company_id: companyId };
  if (table === 'banks' || table === 'payment_methods') return { ...base, ...data };
  if (table === 'favored') {
    return {
      ...base,
      id: data.id,
      name: data.name,
      type: data.type,
      document: data.document || null
    };
  }
  if (table === 'accounts') {
    return {
      ...base,
      id: data.id,
      name: data.name,
      subgroup_id: data.subgroupId,
      group_id: data.groupId,
      is_fixed: data.isFixed
    };
  }
  if (table === 'postings') {
    return {
      ...base,
      id: data.id,
      status: data.status,
      competence_date: data.competenceDate,
      occurrence_date: data.occurrenceDate,
      due_date: data.dueDate || null,
      liquidation_date: data.liquidationDate || null,
      group: data.group,
      account_id: data.accountId,
      observations: data.observations,
      payment_method_id: data.paymentMethodId || null,
      entity_id: data.entityId || null,
      bank_id: data.bankId || null,
      amount: data.amount,
      invoice_number: data.invoiceNumber || null
    };
  }
  if (table === 'xml_item_mappings') {
    return {
      ...base,
      id: data.id,
      supplier_cnpj: data.supplierCnpj,
      match_type: data.matchType,
      match_key: data.matchKey,
      account_id: data.accountId,
      updated_at: data.updatedAt
    };
  }
  return { ...base, ...data };
};

export const datastore = {
  async loadAll(companyId: string): Promise<AppState> {
    try {
      const state = await this.syncFromSupabase(companyId);
      return state;
    } catch (error) {
      console.error('[DataStore] Critical error loading from Supabase:', error);
      throw new Error('Sem conexão com o servidor. Verifique internet ou configuração.');
    }
  },

  async saveAll(state: AppState, companyId: string): Promise<void> {
    try {
      await this.syncToSupabase(state, companyId);

      // Update LocalStorage only as a secondary cache
      localStorage.setItem(LOCAL_STORAGE_KEYS.BANKS, JSON.stringify(state.banks));
      localStorage.setItem(LOCAL_STORAGE_KEYS.PAYMENT_METHODS, JSON.stringify(state.paymentMethods));
      localStorage.setItem(LOCAL_STORAGE_KEYS.ENTITIES, JSON.stringify(state.favored));
      localStorage.setItem(LOCAL_STORAGE_KEYS.ACCOUNTS, JSON.stringify(state.accounts));
      localStorage.setItem(LOCAL_STORAGE_KEYS.POSTINGS, JSON.stringify(state.postings));
      localStorage.setItem(LOCAL_STORAGE_KEYS.XML_MAPPINGS, JSON.stringify(state.xmlMappings));
    } catch (error) {
      console.error('[DataStore] Error saving to Supabase:', error);
      throw error;
    }
  },

  async upsertOne(table: string, row: any, companyId: string): Promise<void> {
    const dbRow = mapToDb(table, row, companyId);
    try {
      const { error } = await supabase.from(table).upsert(dbRow);
      if (error) throw error;
    } catch (error) {
      console.error(`[DataStore] Error upserting to ${table}:`, error);
      throw error;
    }
  },

  async deleteOne(table: string, id: string, companyId: string): Promise<void> {
    try {
      const { error } = await supabase.from(table).delete().eq('id', id).eq('company_id', companyId);
      if (error) throw error;
    } catch (error) {
      console.error(`[DataStore] Error deleting from ${table}:`, error);
      throw error;
    }
  },

  async syncFromSupabase(companyId: string): Promise<AppState> {
    const [
      { data: banks },
      { data: paymentMethods },
      { data: favored },
      { data: accounts },
      { data: postings },
      { data: xmlMappings }
    ] = await Promise.all([
      supabase.from('banks').select('*').eq('company_id', companyId),
      supabase.from('payment_methods').select('*').eq('company_id', companyId),
      supabase.from('favored').select('*').eq('company_id', companyId),
      supabase.from('accounts').select('*').eq('company_id', companyId),
      supabase.from('postings').select('*').eq('company_id', companyId),
      supabase.from('xml_item_mappings').select('*').eq('company_id', companyId)
    ]);

    return {
      banks: (banks || []).map(b => ({ id: b.id, name: b.name })),
      paymentMethods: (paymentMethods || []).map(m => ({ id: m.id, name: m.name })),
      favored: (favored || []).map(f => ({ id: f.id, name: f.name, type: f.type, document: f.document })),
      accounts: (accounts || []).map(a => ({ 
        id: a.id, 
        name: a.name, 
        subgroupId: a.subgroup_id, 
        groupId: a.group_id, 
        isFixed: a.is_fixed 
      })),
      postings: (postings || []).map(p => ({
        id: p.id,
        status: p.status,
        competenceDate: p.competence_date,
        occurrenceDate: p.occurrence_date,
        dueDate: p.due_date || '',
        group: p.group,
        accountId: p.account_id,
        observations: p.observations || '',
        paymentMethodId: p.payment_method_id || '',
        entityId: p.entity_id || '',
        liquidationDate: p.liquidation_date,
        bankId: p.bank_id,
        amount: Number(p.amount),
        invoiceNumber: p.invoice_number || ''
      })),
      xmlMappings: (xmlMappings || []).map(m => ({
        id: m.id,
        supplierCnpj: m.supplier_cnpj,
        matchType: m.match_type,
        matchKey: m.match_key,
        accountId: m.account_id,
        updatedAt: m.updated_at
      }))
    };
  },

  async syncToSupabase(state: AppState, companyId: string): Promise<void> {
    await Promise.all([
      state.banks.length > 0 ? supabase.from('banks').upsert(state.banks.map(b => mapToDb('banks', b, companyId))) : Promise.resolve(),
      state.paymentMethods.length > 0 ? supabase.from('payment_methods').upsert(state.paymentMethods.map(m => mapToDb('payment_methods', m, companyId))) : Promise.resolve(),
      state.favored.length > 0 ? supabase.from('favored').upsert(state.favored.map(f => mapToDb('favored', f, companyId))) : Promise.resolve(),
      state.accounts.length > 0 ? supabase.from('accounts').upsert(state.accounts.map(a => mapToDb('accounts', a, companyId))) : Promise.resolve(),
      state.postings.length > 0 ? supabase.from('postings').upsert(state.postings.map(p => mapToDb('postings', p, companyId))) : Promise.resolve(),
      state.xmlMappings.length > 0 ? supabase.from('xml_item_mappings').upsert(state.xmlMappings.map(m => mapToDb('xml_item_mappings', m, companyId))) : Promise.resolve()
    ]);
  }
};