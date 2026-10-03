# Home Bar

An app that knows what's in your bar, suggests cocktails for your mood, helps you buy bottles, and (parked for now) compares wine prices at a restaurant. The interface is in Hebrew by default, with English one tap away.

The same source builds two versions:

| Version | Where | Storage | Claude |
|---|---|---|---|
| **claude.ai** (Artifact) | The private link on claude.ai | Each person's bar is stored separately on claude.ai | Through the viewer's own account |
| **Web** | Your own site on Vercel | Supabase: sign in with Google or an email link, one private bar per user | Through your server (`api/claude.js`), with a daily limit per user |

## Layout

```
src/app.html            The whole app: styles, bottle and wine catalog, search, recipes, onboarding
src/i18n/he.js, en.js   Every piece of text the app shows, plus names for catalog data (same keys in both)
src/prompts.cjs         Claude prompts and response schemas, used by both versions
web/                    Web-only files: Supabase sign-in, manifest, service worker, icons, bottle photos
api/claude.js           Server function: checks the user, enforces the daily limit, calls Claude
supabase/schema.sql     Tables and access rules
scripts/build.mjs       Builds dist/artifact.html and public/
scripts/photos/         Fetches and matches bottle photos from Open Food Facts (see below)
data/                   Where each bottle photo came from, and manual photo overrides
```

## Development

```bash
npm install
npm run build        # writes dist/artifact.html (for claude.ai) and public/ (for the web)
```

Edit `src/app.html`, `src/i18n/*.js` or `src/prompts.cjs`, then build. Publish `dist/artifact.html` to claude.ai together with `web/photos.json` (published as `photos.json`). Once connected to Vercel, the web version deploys on every push.

To run the web version locally, server included: `npx vercel dev`. It needs a `.env.local` based on `.env.example`.

### Languages

Text never lives in `src/app.html`. Static elements carry `data-t="key"` (text), `data-t-ph="key"` (placeholder) or `data-t-html="key"` (trusted markup); script code calls `t("key", ...args)`. Function entries in the locale files take counts or names. Catalog names (items, styles, cocktails, countries) also come from the locales, so the data in `src/app.html` holds ids only. Hebrew search aliases for brands and wineries stay in the catalog rows, since search works in both languages.

### Bottle photos

Photos come from [Open Food Facts](https://world.openfoodfacts.org) (CC BY-SA; the app shows the credit).

```bash
pip install pillow
python3 scripts/photos/fetch.py   # searches once per brand; resumable; ~1 hour because of the API's rate limit
python3 scripts/photos/build.py   # strict matching, writes web/photos.json and data/photo-sources.json
```

`build.py` also writes contact sheets to `.photo-cache/` for checking matches by eye. Wrong matches go in `data/photo-overrides.json` (`{"Name": null}` blocks a photo; `{"Name": "<barcode>"}` pins one). Bottles without a photo show a drawn bottle in the drink's shape and colour.

## Moving to the web version: checklist

Steps marked **[you]** need your accounts.

1. **[you] Supabase** (supabase.com, free tier):
   - New project. Region: Frankfurt, the closest to Israel.
   - SQL Editor → paste `supabase/schema.sql` → Run.
   - Authentication → Providers: Email is on by default (sign-in link by email). Google needs an OAuth client from Google Cloud Console; the provider page explains how.
   - Authentication → URL Configuration: set Site URL to the address Vercel gives you.
   - Project Settings → API: copy `URL`, `anon` and `service_role`. These go straight into Vercel, never into a chat.
2. **[you] Anthropic** (console.anthropic.com), optional: add a payment method, create an API key, and set a monthly spend limit under Limits. Without `ANTHROPIC_API_KEY` (and `SUPABASE_SERVICE_ROLE_KEY`) the site works and simply hides the photo and identify features; add them later and redeploy.
3. **[you] Vercel** (vercel.com, free tier):
   - Add New → Project → choose this repository.
   - Settings → Environment Variables: the names in `.env.example`, with the values from steps 1–2.
   - Deploy.
4. **Move your bar:** on claude.ai, My bar → "Move your bar to another device or version" → "Copy bar". On the new site, after signing in, paste it and tap "Import".

## Costs (estimate)

- **Supabase and Vercel:** free on the free tiers, for friends-and-family numbers of users.
- **Claude** (`claude-opus-5-5`, $4 per million input tokens and $20 per million output): a menu photo or a wine search costs a few cents. `AI_DAILY_LIMIT` (default 40 actions a day per user) and the spend limit in Anthropic Console keep it from running away.

## Notes

- **Shop prices in the catalog are estimates.** The `prices` table is ready for the next step: a job that updates prices from shops, with bottle size and date for each price.
- **The server calls Claude with a response schema (JSON schema)**, so answers always parse. A model fallback also covers refused requests.
- **The client sends only a task name and parameters.** The server builds the prompt itself, so it can't be used as an open proxy to Claude.
- **The restaurant tab is hidden** behind `SHOW_MENU` in `src/app.html`; its code is kept for later.
