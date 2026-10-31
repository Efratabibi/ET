// POST /api/account {action: "delete"} — deletes the signed-in person's account.
// Their bar, usage events and Claude usage go with it (foreign keys cascade); feedback stays, unsigned.
import { createClient } from "@supabase/supabase-js";

let supabase;
function client() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  supabase ??= createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  return supabase;
}
const fail = (res, status, code) => res.status(status).json({ code });

export default async function handler(req, res) {
  if (req.method !== "POST") return fail(res, 405, "method_not_allowed");
  const sb = client();
  if (!sb) return fail(res, 500, "not_configured");
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return fail(res, 401, "login_required");
  const { data: auth, error: authError } = await sb.auth.getUser(token);
  if (authError || !auth?.user) return fail(res, 401, "login_required");
  if ((req.body || {}).action !== "delete") return fail(res, 400, "invalid_request");
  const { error } = await sb.auth.admin.deleteUser(auth.user.id);
  if (error) return fail(res, 500, "upstream_error");
  return res.status(200).json({ ok: true });
}
