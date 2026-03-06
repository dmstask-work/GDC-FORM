# FINAL_SALES_FORM

Customer data entry form (static frontend) integrated with Supabase database, storage, and Edge Function reverse geocoding.

## GitHub Upload (Safe)

Upload these files/folders:

- `index.html`
- `styles.css`
- `app.js`
- `config.example.js`
- `image/`
- `supabase_schema.sql`
- `supabase/` (optional, if you want to version the edge function source)
- `README.MD`
- `.gitignore`

Do NOT upload secrets:

- Real API keys in docs
- `GEOAPIFY_KEY`
- Supabase service role key
- Any `.env` file

Note: `config.js` is ignored by `.gitignore` so local keys are not pushed.

## Local Setup

1. Run SQL from `supabase_schema.sql` in Supabase SQL Editor.
2. Copy `config.example.js` to `config.js`.
3. Fill `config.js` with your project values:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - optional `REVERSE_GEOCODE_URL`
4. Deploy edge function:
   - `supabase functions deploy reverse-geocode --project-ref <project-ref>`
5. Set Geoapify secret on Supabase:
   - `supabase secrets set GEOAPIFY_KEY=YOUR_GEOAPIFY_KEY --project-ref <project-ref>`
6. Open app using local server (for example Live Server), not `file://`.

## Security Notes

- `SUPABASE_ANON_KEY` is public by design for browser use.
- Keep RLS enabled and policies strict.
- Keep `GEOAPIFY_KEY` only in Supabase secrets, never in frontend code.

## Reverse Geocode Notes

- If `REVERSE_GEOCODE_URL` is empty, app auto-uses:
  - `${SUPABASE_URL}/functions/v1/reverse-geocode`
- The app also supports fallback to:
  - `https://<project-ref>.functions.supabase.co/reverse-geocode`