import { supabase } from '../src/lib/supabase';
import { Entity } from '../types';

export const favoredService = {
  async getOrCreateFavoredByCnpj(cnpj: string, name: string): Promise<Entity | null> {
    const cleaned = cnpj.replace(/\D/g, "");
    if (cleaned.length !== 14) return null;

    try {
      // 1. Check if exists
      const { data: existing, error: selErr } = await supabase
        .from("favored")
        .select("id, name, type, document")
        .eq("document", cleaned)
        .maybeSingle();

      if (selErr) throw selErr;
      if (existing) {
        return {
          id: existing.id,
          name: existing.name,
          type: existing.type as any,
          document: existing.document
        };
      }

      // 2. Create new if not exists
      const { data: created, error: insErr } = await supabase
        .from("favored")
        .insert({ 
          id: crypto.randomUUID(),
          name: name.toUpperCase(), 
          document: cleaned, 
          type: "AMBOS" 
        })
        .select("id, name, type, document")
        .single();

      if (insErr) throw insErr;
      
      return {
        id: created.id,
        name: created.name,
        type: created.type as any,
        document: created.document
      };
    } catch (error) {
      console.error("Error in getOrCreateFavoredByCnpj:", error);
      return null;
    }
  }
};
