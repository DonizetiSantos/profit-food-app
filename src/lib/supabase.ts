import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ??
  "https://ashisuarklfnxuawaqoi.supabase.co";

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  "sb_publishable_Y9ZQCi91thn-oLEbKc6Umg_m-1HefQq";

// Se ainda assim vier vazio, a gente força um erro mais claro
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    `Supabase ENV ausente. URL="${supabaseUrl}" KEY="${supabaseAnonKey ? "ok" : "vazia"}"`
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
