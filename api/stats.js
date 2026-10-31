// GET /api/stats — the numbers behind /dashboard.html, for the owner only.
// The caller must be signed in with an email listed in ADMIN_EMAILS (comma-separated).
// Returns {all, others}: the same summary with and without the admins' own use.
import { createClient } from "@supabase/supabase-js";
import { summarize } from "./_summary.js";

let supabase;
function client() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  supabase ??= createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  return supabase;
}
const fail = (res, status, code) => res.status(status).json({ code });

// PostgREST returns at most 1,000 rows per request; read in pages, up to `cap` rows.
async function all(query, cap = 50000) {
  const rows = [];
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await query().range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}
// A table that doesn't exist yet (the beta SQL not run) counts as empty, so the dashboard still opens.
const orEmpty = (p) => p.catch((e) => (e && (e.code === "42P01" || /does not exist/.test(e.message || "")) ? [] : Promise.reject(e)));

export default async function handler(req, res) {
  if (req.method !== "GET") return fail(res, 405, "method_not_allowed");
  const sb = client();
  if (!sb) return fail(res, 500, "not_configured");

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return fail(res, 401, "login_required");
  const { data: auth, error: authError } = await sb.auth.getUser(token);
  if (authError || !auth?.user) return fail(res, 401, "login_required");
  const admins = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!admins.includes((auth.user.email || "").toLowerCase())) return fail(res, 403, "not_admin");

  try {
    const since = new Date(Date.now() - 90 * 864e5).toISOString();
    const users = [];
    for (let page = 1; page < 50; page++) {
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      users.push(...data.users);
      if (data.users.length < 1000) break;
    }
    const [events, bars, feedback, usage] = await Promise.all([
      orEmpty(all(() => sb.from("events").select("user_id,name,props,at").gte("at", since).order("at"))),
      all(() => sb.from("bars").select("user_id,data")),
      orEmpty(all(() => sb.from("feedback").select("user_id,message,view,at").order("at", { ascending: false }), 1000)),
      all(() => sb.from("ai_usage").select("user_id,day,count").gte("day", since.slice(0, 10))),
    ]);
    const skip = users.filter((u) => admins.includes((u.email || "").toLowerCase())).map((u) => u.id);
    const rows = { users, events, bars, feedback, usage };
    res.setHeader("cache-control", "no-store");
    return res.status(200).json({ at: new Date().toISOString(), all: summarize(rows), others: summarize({ ...rows, skip }) });
  } catch (e) {
    return res.status(500).json({ code: "upstream_error", message: String((e && e.message) || e) });
  }
}
