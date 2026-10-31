// Turns raw rows into the numbers the owner's dashboard shows (api/stats.js calls it).
// Pure: no I/O, so it can be checked locally with sample rows.
//   users:    [{id, email, created_at, last_sign_in_at, app_metadata}]  (Supabase auth users)
//   events:   [{user_id, name, props, at}]
//   bars:     [{user_id, data}]  (data = the app's bar document: items, bottles, log, ...)
//   feedback: [{user_id, message, view, at}]
//   usage:    [{user_id, day, count}]  (Claude calls per day)
//   skip:     user ids to leave out (the owner's own use)

const DAY = 864e5;
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
// Event names grouped into what the dashboard calls features. A "view" event names the screen in props.v.
const FEATURES = ["view:mix", "view:bar", "view:shop", "view:menu", "view:list", "recipe", "photo_bar", "photo_menu", "rate", "want", "ordered", "feedback"];

export function summarize({ users = [], events = [], bars = [], feedback = [], usage = [], skip = [], now = Date.now() }) {
  const left = new Set(skip);
  const people = new Map();
  for (const u of users) {
    if (left.has(u.id)) continue;
    people.set(u.id, {
      id: u.id, email: u.email || "", joined: u.created_at, signIn: u.last_sign_in_at || null,
      provider: (u.app_metadata && u.app_metadata.provider) || "email",
      days: new Set(), last: null, counts: {}, items: 0, bottles: 0, ratings: 0, wants: 0, waiting: 0, ai: 0,
    });
  }
  const feature = (e) => (e.name === "view" ? "view:" + ((e.props && e.props.v) || "") : e.name);

  for (const e of events) {
    const p = people.get(e.user_id);
    if (!p) continue;
    p.days.add(dayKey(e.at));
    if (!p.last || e.at > p.last) p.last = e.at;
    const f = feature(e);
    p.counts[f] = (p.counts[f] || 0) + 1;
  }
  for (const f of feedback) {
    const p = people.get(f.user_id);
    if (p) p.counts.feedback = (p.counts.feedback || 0) + 1;
  }
  for (const u of usage) {
    const p = people.get(u.user_id);
    if (p) p.ai += u.count || 0;
  }

  // What people keep in their bar and list.
  const rated = new Map(), wanted = new Map(), kinds = {};
  for (const b of bars) {
    const p = people.get(b.user_id);
    if (!p) continue;
    const d = b.data || {};
    p.items = Array.isArray(d.items) ? d.items.length : 0;
    p.bottles = Array.isArray(d.bottles) ? d.bottles.length : 0;
    for (const e of Array.isArray(d.log) ? d.log : []) {
      const key = e.ref ? "c:" + e.ref : "n:" + String(e.name || "").trim().toLowerCase();
      const entry = { key, ref: e.ref || null, name: e.ref ? null : String(e.name || ""), type: e.ref ? "cocktail" : e.type || "other" };
      if (e.status === "tried" && e.rating) {
        p.ratings++;
        kinds[entry.type] = (kinds[entry.type] || 0) + 1;
        const r = rated.get(key) || { ...entry, n: 0, sum: 0 };
        r.n++; r.sum += e.rating; rated.set(key, r);
      } else if (e.status === "tried") p.waiting++;
      else if (e.status === "want") {
        p.wants++;
        const w = wanted.get(key) || { ...entry, n: 0 };
        w.n++; wanted.set(key, w);
      }
    }
  }

  const list = [...people.values()];
  const activeIn = (days) => list.filter((p) => p.last && now - Date.parse(p.last) < days * DAY).length;
  const used = (p, ...fs) => fs.some((f) => (p.counts[f] || 0) > 0);

  // The last 30 days, oldest first: people who did anything that day, and new sign-ups.
  const daily = [];
  for (let i = 29; i >= 0; i--) {
    const k = dayKey(now - i * DAY);
    daily.push({
      day: k,
      active: list.filter((p) => p.days.has(k)).length,
      joined: list.filter((p) => p.joined && dayKey(p.joined) === k).length,
    });
  }

  const features = FEATURES.map((f) => ({
    key: f,
    events: list.reduce((s, p) => s + (p.counts[f] || 0), 0),
    people: list.filter((p) => used(p, f)).length,
  }));

  // From signing up to the restaurant: each step counts people who did it (at any time).
  const funnel = [
    { key: "joined", people: list.length },
    { key: "bar", people: list.filter((p) => p.items > 0).length },
    { key: "recipe", people: list.filter((p) => used(p, "recipe")).length },
    { key: "rated", people: list.filter((p) => p.ratings > 0).length },
    { key: "restaurant", people: list.filter((p) => used(p, "view:menu", "photo_menu")).length },
    { key: "returned", people: list.filter((p) => p.days.size >= 2).length },
  ];

  // Came back a week or more after joining, among people who joined at least a week ago.
  const weekOld = list.filter((p) => p.joined && now - Date.parse(p.joined) >= 7 * DAY);
  const backAfterWeek = weekOld.filter((p) => p.last && Date.parse(p.last) - Date.parse(p.joined) >= 7 * DAY).length;

  const withBar = list.filter((p) => p.items > 0);
  const sum = (f) => list.reduce((s, p) => s + f(p), 0);
  const kpis = {
    users: list.length,
    new7: list.filter((p) => p.joined && now - Date.parse(p.joined) < 7 * DAY).length,
    active1: activeIn(1),
    active7: activeIn(7),
    active30: activeIn(30),
    returning: list.filter((p) => p.days.size >= 2).length,
    weekOld: weekOld.length,
    backAfterWeek,
    avgBar: withBar.length ? Math.round((sum((p) => p.items) / withBar.length) * 10) / 10 : 0,
    ratings: sum((p) => p.ratings),
    wants: sum((p) => p.wants),
    waiting: sum((p) => p.waiting),
    photosBar: sum((p) => p.counts.photo_bar || 0),
    photosMenu: sum((p) => p.counts.photo_menu || 0),
    ai: sum((p) => p.ai),
    feedback: feedback.filter((f) => !left.has(f.user_id)).length,
  };

  const top = (m, by) => [...m.values()].sort(by).slice(0, 10);
  const topRated = top(rated, (a, b) => b.n - a.n || b.sum / b.n - a.sum / a.n)
    .map((r) => ({ ref: r.ref, name: r.name, type: r.type, n: r.n, avg: Math.round((r.sum / r.n) * 10) / 10 }));
  const topWanted = top(wanted, (a, b) => b.n - a.n).map((w) => ({ ref: w.ref, name: w.name, type: w.type, n: w.n }));

  const emailOf = new Map(users.map((u) => [u.id, u.email || ""]));
  const people_ = list
    .map((p) => ({
      email: p.email, provider: p.provider, joined: p.joined, last: p.last || p.signIn, activeDays: p.days.size,
      items: p.items, bottles: p.bottles, ratings: p.ratings, wants: p.wants, waiting: p.waiting,
      photos: (p.counts.photo_bar || 0) + (p.counts.photo_menu || 0), restaurant: used(p, "view:menu", "photo_menu"), ai: p.ai,
    }))
    .sort((a, b) => String(b.last || "").localeCompare(String(a.last || "")));

  return {
    kpis, daily, features, funnel, kinds, topRated, topWanted, people: people_,
    feedback: feedback.filter((f) => !left.has(f.user_id)).slice(0, 200)
      .map((f) => ({ email: emailOf.get(f.user_id) || "", message: f.message, view: f.view || "", at: f.at })),
  };
}
