// Builds both targets from src/:
//   dist/artifact.html  — the claude.ai version (published as the Artifact)
//   public/             — the web app for Vercel (index.html + static files)
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const out = (p) => new URL("../" + p, import.meta.url);

const app = read("src/app.html")
  .replace("/*@@PROMPTS@@*/", () => read("src/prompts.cjs"))
  .replace("/*@@I18N@@*/", () => read("src/i18n/en.js") + read("src/i18n/he.js"));

mkdirSync(out("dist"), { recursive: true });
writeFileSync(out("dist/artifact.html"), app);

// Public Supabase settings (safe to ship to the browser). Missing = browser-only storage.
const config = {
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  // Claude features show only when the server has what it needs; without them the app hides photo and identify.
  ai: Boolean(process.env.ANTHROPIC_API_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY),
};
const head = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#A8234A">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icon-192.png">
<style>body{margin:0}[hidden]{display:none!important}img{max-width:100%}:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}</style>
<script>window.HB_CONFIG=${JSON.stringify(config)};</script>
<script src="/supabase.js"></script>
<script src="/platform-web.js"></script>
</head>
<body>
`;
const tail = `
<script>if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>{});</script>
</body>
</html>
`;
mkdirSync(out("public"), { recursive: true });
writeFileSync(out("public/index.html"), head + app + tail);
for (const f of ["platform-web.js", "manifest.webmanifest", "sw.js", "icon.svg", "icon-192.png", "icon-512.png"])
  copyFileSync(out("web/" + f), out("public/" + f));
// Bottle photos (scripts/photos/build.py); the app shows drawn bottles without them.
if (existsSync(out("web/photos.json"))) copyFileSync(out("web/photos.json"), out("public/photos.json"));
copyFileSync(out("node_modules/@supabase/supabase-js/dist/umd/supabase.js"), out("public/supabase.js"));

console.log("built dist/artifact.html and public/");
