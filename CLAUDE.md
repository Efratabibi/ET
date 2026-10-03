# All Cohol — notes for Claude

- One source, two targets. Edit `src/app.html` / `src/i18n/*.js` / `src/prompts.cjs`, then `npm run build`.
  - `dist/artifact.html` is published to the existing claude.ai Artifact
    (https://claude.ai/artifact/JBkPbYd8g8tZq1YdS8jTjK, capabilities `db`, `sample`, `user`) — pass that `url` when publishing,
    with `files: {"photos.json": "web/photos.json"}` when the photos changed.
  - `public/` is the Vercel web build (gitignored, built on deploy).
- The app talks to its host only through `PLATFORM` (top of the main script in `src/app.html`):
  `PLATFORM.ai()` → `{json(task, params, {images, signal}), images?()}` (`images()` resolves false when the view cannot send photos) and `PLATFORM.bar()` → `{ref:{get,set,onSnapshot}, legacy}`.
  The artifact implementation is the default; `web/platform-web.js` sets `window.HB_PLATFORM` for the web build.
- New Claude features: add a task to `src/prompts.cjs` (prompt + strict JSON schema: every property required,
  `additionalProperties:false`, nullable as `["type","null"]`) and call `sampleApi.json("<task>", params)`.
  Never send prompt text from the client to `api/claude.js`.
- Two languages: Hebrew (default, RTL) and English (LTR). All display text lives in `src/i18n/he.js` and `en.js`
  with the same keys — never put text in `src/app.html`; use `data-t`/`data-t-ph`/`data-t-html` or `t("key", ...)`.
  Catalog data holds ids; names come from the locales. Prompts get `lang` for the language of notes.
- Prices always state the bottle size. Catalog: `B(...)` bottle rows and `W(...)` wine rows in `src/app.html`
  (wine notes are English terms; `he.js` `wineTerm` translates them).
- Bottle photos: `scripts/photos/fetch.py` then `build.py` (see README). Check the contact sheets before publishing;
  a wrong photo is worse than the drawn bottle.
- Everything in the repository is in English (code, comments, docs); Hebrew appears only as translations and search aliases.
- The user is not a developer: explain setup steps in plain Hebrew and never ask for secrets in chat.
