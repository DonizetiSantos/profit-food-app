import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || "https://ashisuarklfnxuawaqoi.supabase.co";

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_Y9ZQCi91thn-oLEbKc6Umg_m-lHefQq";

console.log("[SUPABASE] url ok?", !!supabaseUrl, "key ok?", !!supabaseAnonKey);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
