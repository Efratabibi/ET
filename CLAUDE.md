# Home Bar — notes for Claude

- One source, two targets. Edit `src/app.html` / `src/prompts.cjs`, then `npm run build`.
  - `dist/artifact.html` is published to the existing claude.ai Artifact
    (https://claude.ai/artifact/JBkPbYd8g8tZq1YdS8jTjK, capabilities `db`, `sample`, `user`) — pass that `url` when publishing.
  - `public/` is the Vercel web build (gitignored, built on deploy).
- The app talks to its host only through `PLATFORM` (top of the main script in `src/app.html`):
  `PLATFORM.ai()` → `{json(task, params, {images, signal})}` and `PLATFORM.bar()` → `{ref:{get,set,onSnapshot}, legacy}`.
  The artifact implementation is the default; `web/platform-web.js` sets `window.HB_PLATFORM` for the web build.
- New Claude features: add a task to `src/prompts.cjs` (prompt + strict JSON schema: every property required,
  `additionalProperties:false`, nullable as `["type","null"]`) and call `sampleApi.json("<task>", params)`.
  Never send prompt text from the client to `api/claude.js`.
- UI copy is Hebrew, RTL. Prices always state the bottle size. Catalog: `B(...)` bottle rows and `W(...)` wine rows in `src/app.html`.
- The user is not a developer: explain setup steps in plain Hebrew and never ask for secrets in chat.
