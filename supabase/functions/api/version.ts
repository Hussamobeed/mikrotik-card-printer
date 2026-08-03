// Bump this on every deploy-worthy change. Check it via GET /api/health
// (no login needed) to confirm whether `supabase functions deploy api`
// actually picked up your latest changes — Supabase can sometimes serve a
// cached/previous version if a deploy silently failed or targeted the
// wrong project ref.
export const API_VERSION = "1.3.0-no-policy-param";
