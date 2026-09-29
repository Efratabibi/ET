// POST /api/claude — runs one Home Bar task on Claude for a signed-in user.
// Body: {task, params, images?: [dataURL]}. The prompt is built here from src/prompts.cjs,
// so the client can only choose a known task, never send its own prompt.
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const TASKS = require("../src/prompts.cjs");

export const config = { maxDuration: 60 };

// Created on first use, so a missing setting returns a clear error instead of crashing the function.
let anthropic, supabase;
function clients() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ANTHROPIC_API_KEY) return false;
  anthropic ??= new Anthropic(); // reads ANTHROPIC_API_KEY
  supabase ??= createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  return true;
}
const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT || 40);
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function fail(res, status, code, message = "") {
  return res.status(status).json({ code, message });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return fail(res, 405, "method_not_allowed");
  if (!clients()) return fail(res, 500, "not_configured", "server environment variables are missing");

  // 1. Who is asking
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return fail(res, 401, "login_required");
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth?.user) return fail(res, 401, "login_required");

  // 2. What they asked for
  const { task, params = {}, images = [] } = req.body || {};
  const build = TASKS[task];
  if (!build) return fail(res, 400, "invalid_request", "unknown task");
  const t = build(params);
  if (!Array.isArray(images) || images.length > (t.images ? 2 : 0))
    return fail(res, 400, "image_rejected");
  const imageBlocks = [];
  for (const url of images) {
    const m = /^data:([^;]+);base64,(.+)$/.exec(String(url));
    if (!m || !IMAGE_TYPES.includes(m[1]) || (m[2].length * 3) / 4 > MAX_IMAGE_BYTES)
      return fail(res, 400, "image_rejected");
    imageBlocks.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
  }

  // 3. Daily quota per user (atomic counter in Postgres)
  const { data: allowed, error: quotaError } = await supabase.rpc("hb_use_ai", {
    p_user: auth.user.id,
    p_limit: DAILY_LIMIT,
  });
  if (quotaError) return fail(res, 500, "upstream_error", "quota check failed");
  if (!allowed) return fail(res, 429, "daily_limit");

  // 4. Claude, with a JSON schema so the answer always parses
  try {
    const response = await anthropic.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: t.effort, format: { type: "json_schema", schema: t.schema } },
      messages: [{ role: "user", content: [...imageBlocks, { type: "text", text: t.prompt }] }],
    });
    if (response.stop_reason === "refusal") return fail(res, 422, "refused");
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    return res.status(200).json(JSON.parse(text));
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return fail(res, 429, "rate_limited");
    if (error instanceof Anthropic.BadRequestError) return fail(res, 400, "invalid_request", error.message);
    if (error instanceof Anthropic.APIError) return fail(res, 502, "upstream_error", `Claude API ${error.status}`);
    if (error instanceof SyntaxError) return fail(res, 502, "invalid_json");
    return fail(res, 500, "upstream_error");
  }
}
