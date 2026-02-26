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
const mapToDb = (table: string, data: any) => {
  if (table === 'banks' || table === 'payment_methods') return data;
  if (table === 'favored') {
    return {
      id: data.id,
      name: data.name,
      type: data.type,
      document: data.document || null
    };
  }
  if (table === 'accounts') {
    return {
      id: data.id,
      name: data.name,
      subgroup_id: data.subgroupId,
      group_id: data.groupId,
      is_fixed: data.isFixed
    };
  }
  if (table === 'postings') {
    return {
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
      amount: data.amount
    };
  }
  if (table === 'xml_item_mappings') {
    return {
      id: data.id,
      supplier_cnpj: data.supplierCnpj,
      match_type: data.matchType,
      match_key: data.matchKey,
      account_id: data.accountId,
      updated_at: data.updatedAt
    };
  }
  return data;
};

export const datastore = {
  async loadAll(): Promise<AppState> {
    console.log('[DataStore] Starting loadAll (Supabase-only)...');
    try {
      const state = await this.syncFromSupabase();
      console.log('[DataStore] Successfully loaded from Supabase.');
      return state;
    } catch (error) {
      console.error('[DataStore] Critical error loading from Supabase:', error);
      throw new Error('Sem conexão com o servidor. Verifique internet ou configuração.');
    }
  },

  async saveAll(state: AppState): Promise<void> {
    console.log('[DataStore] Starting saveAll (Supabase)...');
    try {
      await this.syncToSupabase(state);
      console.log('[DataStore] Successfully saved to Supabase.');
      
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

  async upsertOne(table: string, row: any): Promise<void> {
    console.log(`[DataStore] Upserting to ${table}...`);
    const dbRow = mapToDb(table, row);
    try {
      const { error } = await supabase.from(table).upsert(dbRow);
      if (error) throw error;
      console.log(`[DataStore] Successfully upserted to ${table}.`);
    } catch (error) {
      console.error(`[DataStore] Error upserting to ${table}:`, error);
      throw error;
    }
  },

  async deleteOne(table: string, id: string): Promise<void> {
    console.log(`[DataStore] Deleting from ${table} (id: ${id})...`);
    try {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      console.log(`[DataStore] Successfully deleted from ${table}.`);
    } catch (error) {
      console.error(`[DataStore] Error deleting from ${table}:`, error);
      throw error;
    }
  },

  async syncFromSupabase(): Promise<AppState> {
    console.log('[DataStore] Syncing from Supabase...');
    const [
      { data: banks },
      { data: paymentMethods },
      { data: favored },
      { data: accounts },
      { data: postings },
      { data: xmlMappings }
    ] = await Promise.all([
      supabase.from('banks').select('*'),
      supabase.from('payment_methods').select('*'),
      supabase.from('favored').select('*'),
      supabase.from('accounts').select('*'),
      supabase.from('postings').select('*'),
      supabase.from('xml_item_mappings').select('*')
    ]);

    console.log('[DataStore] Records loaded:', {
      banks: banks?.length || 0,
      paymentMethods: paymentMethods?.length || 0,
      favored: favored?.length || 0,
      accounts: accounts?.length || 0,
      postings: postings?.length || 0,
      xmlMappings: xmlMappings?.length || 0
    });

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
        amount: Number(p.amount)
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

  async syncToSupabase(state: AppState): Promise<void> {
    console.log('[DataStore] Syncing all to Supabase...');
    await Promise.all([
      state.banks.length > 0 ? supabase.from('banks').upsert(state.banks.map(b => mapToDb('banks', b))) : Promise.resolve(),
      state.paymentMethods.length > 0 ? supabase.from('payment_methods').upsert(state.paymentMethods.map(m => mapToDb('payment_methods', m))) : Promise.resolve(),
      state.favored.length > 0 ? supabase.from('favored').upsert(state.favored.map(f => mapToDb('favored', f))) : Promise.resolve(),
      state.accounts.length > 0 ? supabase.from('accounts').upsert(state.accounts.map(a => mapToDb('accounts', a))) : Promise.resolve(),
      state.postings.length > 0 ? supabase.from('postings').upsert(state.postings.map(p => mapToDb('postings', p))) : Promise.resolve(),
      state.xmlMappings.length > 0 ? supabase.from('xml_item_mappings').upsert(state.xmlMappings.map(m => mapToDb('xml_item_mappings', m))) : Promise.resolve()
    ]);
  }
};
