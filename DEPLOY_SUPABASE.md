# Hersnnet Cards Manager — now "Obaid Manager" — Cloudflare Pages + Supabase deployment

This replaces the old Node/Express backend with:
- **Database + file storage**: Supabase (Postgres + Storage)
- **Auth**: Supabase Auth (email + password) — the app now requires sign-up/login
- **Backend logic**: a single Supabase Edge Function (Deno) at `supabase/functions/api`
- **Frontend**: `frontend/` folder, deployed as a static site on Cloudflare Pages

The old `backend/` folder (Node/Express) is no longer used — delete it whenever you like.

---

## 1) Create the Supabase project

1. Go to supabase.com, sign up (free, no credit card required), create a new project.
2. Note your **Project Reference** (in the project URL, e.g. `abcdxyz123`) and, from
   **Project Settings → API**, copy the **anon public** key.

## 2) (Optional) Turn off email confirmation for faster testing

By default, Supabase requires users to click a confirmation link in their email before
their first login works. For quick personal testing:
**Authentication → Providers → Email → toggle off "Confirm email"**. You can turn it back
on later if you ever open this up to other people.

## 3) Apply the database schema

Run these three files, **in order**, in the Supabase Dashboard's SQL Editor (open each file
in a text editor, copy its full contents — not the filename — and paste into the editor,
then click Run):

1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0002_storage.sql`
3. `supabase/migrations/0003_auth_and_templates.sql`

**Note:** migration 0003 drops and recreates the tables that needed a structural change
(adding per-user ownership), so any router you added while testing before will be
removed — just re-add it after you log in, it takes a minute.

## 4) Set the Edge Function secret

```bash
openssl rand -hex 32
# copy the output, then:
supabase secrets set ENCRYPTION_KEY=<paste the 64-character hex string here> --project-ref YOUR-PROJECT-REF
```

(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.)

## 5) Deploy the Edge Function

```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase functions deploy api
```

Test the public health check (no login needed):

```bash
curl https://YOUR-PROJECT-REF.supabase.co/functions/v1/api/health \
  -H "apikey: YOUR-ANON-KEY" -H "Authorization: Bearer YOUR-ANON-KEY"
```

Every other route now requires a real logged-in user's token, not just the anon key —
that's expected; you'll get `{"error":{"code":"UNAUTHENTICATED",...}}` from curl, and that's fine.

## 6) Configure the frontend

Copy `frontend/.env.example` to `frontend/.env` and fill in:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_FUNCTION_URL=https://YOUR-PROJECT-REF.supabase.co/functions/v1/api
VITE_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
```

Test locally first:

```bash
cd frontend && npm install && npm run dev
```

Open the app — you should see a sign-up/sign-in screen. Create your account, add your
router again, and confirm "Test Connection", "Synchronize", and card generation all work
end-to-end **before** deploying to Cloudflare.

## 7) Deploy the frontend to Cloudflare Pages

1. Push your project to a GitHub repository.
2. Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**.
3. Build settings: **Root directory**: `frontend`, **Build command**: `npm run build`,
   **Build output directory**: `dist`.
4. Add the same three `VITE_...` environment variables as your local `.env`.
5. Deploy. You get a free `*.pages.dev` URL immediately.

---

## New in this version

- **Templates page**: create print layouts and optionally link each one to a MikroTik
  profile name. When you pick that profile in the Generator, the matching template's
  layout (position, background, border, etc.) applies automatically.
- **Card border control**: toggle on/off, adjustable thickness (default 2px) and color.
- **Background "autofit"**: choose Contain (shows the whole image, no cropping), Cover
  (fills the card, may crop slightly), or Stretch (old behavior).
- **Fixed**: the preview-vs-PDF vertical position mismatch (PDF text now aligns the same
  way the browser preview does).
- **Fixed**: exported MikroTik scripts that uploaded but silently never ran — the export
  flow now looks up whatever name RouterOS actually gave the file before running `/import`.
- **Fixed**: with one router added and tested, it's auto-selected — no manual "select" click.
- **Login required**: each person gets their own account, their own routers, library,
  templates, and settings, kept separate from anyone else's.

## Known limitation carried over from before

The Edge Function still needs network reachability to your MikroTik router's IP — same
constraint as any cloud host. A private-LAN router still needs either a public IP + firewall
rule, or a VPN (e.g. Tailscale) bridging Supabase to your network.

