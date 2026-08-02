import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are automatically injected into
// every Edge Function's environment by Supabase — no manual secret needed.
export const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

export const LIBRARY_BUCKET = "library";
