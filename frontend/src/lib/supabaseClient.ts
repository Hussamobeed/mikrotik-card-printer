import { createClient } from "@supabase/supabase-js";

// VITE_SUPABASE_URL is your project's root URL, e.g. https://xxxx.supabase.co
// (NOT the /functions/v1/api URL used for API calls — that's a separate var).
export const supabaseAuth = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
