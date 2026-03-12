
import { supabase } from '../src/lib/supabase';
import { MainGroup } from '../types';

export const accountService = {
  /**
   * Resolves an account ID for a specific company by its name and group.
   * If the account doesn't exist, it can optionally create it.
   */
  async resolveAccountByName(
    companyId: string, 
    name: string, 
    groupId: MainGroup | string,
    options: { createIfMissing?: boolean; defaultSubgroupId?: string } = {}
  ): Promise<string | null> {
    const { createIfMissing = false, defaultSubgroupId } = options;

    // 1. Try to find the account
    const { data: existing, error } = await supabase
      .from('accounts')
      .select('id')
      .eq('company_id', companyId)
      .eq('name', name.toUpperCase())
      .eq('group_id', groupId)
      .maybeSingle();

    if (error) {
      console.error(`[AccountService] Error resolving account "${name}":`, error);
      throw error;
    }

    if (existing) return existing.id;

    if (!createIfMissing) return null;

    // 2. Create if missing
    console.log(`[AccountService] Account "${name}" not found for company ${companyId}. Creating...`);
    
    let subId = defaultSubgroupId;
    
    // If no default subgroup provided, try to find a valid one for the group
    if (!subId) {
      const { data: subgroups } = await supabase
        .from('accounts')
        .select('subgroup_id')
        .eq('company_id', companyId)
        .eq('group_id', groupId)
        .limit(1);
      
      subId = subgroups?.[0]?.subgroup_id || (groupId as string);
    }

    const id = crypto.randomUUID();
    const { error: insError } = await supabase
      .from('accounts')
      .insert({
        id,
        company_id: companyId,
        name: name.toUpperCase(),
        subgroup_id: subId,
        group_id: groupId,
        is_fixed: true
      });

    if (insError) {
      console.error(`[AccountService] Error creating account "${name}":`, insError);
      throw insError;
    }

    return id;
  }
};
