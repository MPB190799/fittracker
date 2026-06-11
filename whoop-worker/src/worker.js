// FitTracker — Whoop OAuth- & Daten-Proxy (Cloudflare Worker)
// Hält das client_secret sicher, macht den OAuth-Token-Tausch + rotierenden Refresh,
// speichert Tokens in KV (Single-User), liefert der PWA kompaktes JSON.
// Endpunkte: /auth/start, /auth/callback, /status, /whoop/today

const WHOOP_AUTH = "https://api.prod.whoop.com/oauth/oauth2/auth";
const WHOOP_TOKEN = "https://api.prod.whoop.com/oauth/oauth2/token";
const WHOOP_API = "https://api.prod.whoop.com/developer";
const SCOPES = "offline read:recovery read:sleep read:cycles read:profile";

function corsHeaders(origin, env) {
  const allowed = [env.APP_ORIGIN, "http://localhost:8099"];
  const o = allowed.indexOf(origin) >= 0 ? origin : env.APP_ORIGIN;
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Headers": "X-App-Token, Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Vary": "Origin"
  };
}
function json(obj, status, extra) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { "Content-Type": "application/json", ...(extra || {}) } });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin") || "";
    const path = url.pathname;
    const ch = corsHeaders(origin, env);
    if (req.method === "OPTIONS") return new Response(null, { headers: ch });

    const key = url.searchParams.get("key") || req.headers.get("X-App-Token") || "";

    // 1) OAuth starten → Redirect zu Whoop
    if (path === "/auth/start") {
      if (key !== env.APP_TOKEN) return new Response("Falscher Schlüssel", { status: 401 });
      const state = crypto.randomUUID();
      await env.TOKENS.put("state:" + state, "1", { expirationTtl: 600 });
      const u = new URL(WHOOP_AUTH);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("client_id", env.WHOOP_CLIENT_ID);
      u.searchParams.set("redirect_uri", env.WORKER_BASE + "/auth/callback");
      u.searchParams.set("scope", SCOPES);
      u.searchParams.set("state", state);
      return Response.redirect(u.toString(), 302);
    }

    // 2) Whoop ruft hierher zurück → Code gegen Tokens tauschen
    if (path === "/auth/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const valid = state ? await env.TOKENS.get("state:" + state) : null;
      if (!valid) return htmlMsg("Ungueltiger oder abgelaufener Login-Versuch. Bitte in der App nochmal mit Whoop verbinden.", env, false);
      await env.TOKENS.delete("state:" + state);
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code: code || "",
        client_id: env.WHOOP_CLIENT_ID,
        client_secret: env.WHOOP_CLIENT_SECRET,
        redirect_uri: env.WORKER_BASE + "/auth/callback"
      });
      const r = await fetch(WHOOP_TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
      if (!r.ok) return htmlMsg("❌ Token-Tausch fehlgeschlagen (" + r.status + "). Prüfe Redirect-URI in der Whoop-App.", env, false);
      await saveTokens(env, await r.json());
      return htmlMsg("✅ Whoop verbunden", env, true);
    }

    // 3) Status
    if (path === "/status") {
      if (key !== env.APP_TOKEN) return json({ error: "unauthorized" }, 401, ch);
      const t = await env.TOKENS.get("tokens", "json");
      return json({ connected: !!t }, 200, ch);
    }

    // 4) Heutige Whoop-Daten
    if (path === "/whoop/today") {
      if (key !== env.APP_TOKEN) return json({ error: "unauthorized" }, 401, ch);
      let access;
      try { access = await getAccessToken(env); }
      catch (e) { return json({ connected: false, error: String(e && e.message || e) }, 200, ch); }
      const h = { Authorization: "Bearer " + access };
      const [rec, slp, cyc] = await Promise.all([
        fetchJson(WHOOP_API + "/v2/recovery?limit=1", h),
        fetchJson(WHOOP_API + "/v2/activity/sleep?limit=1", h),
        fetchJson(WHOOP_API + "/v2/cycle?limit=1", h)
      ]);
      const recR = (rec.records || [])[0];
      const slpR = (slp.records || [])[0];
      const cycR = (cyc.records || [])[0];
      const out = {
        connected: true,
        recovery: recR && recR.score ? {
          score: num(recR.score.recovery_score),
          rhr: num(recR.score.resting_heart_rate),
          hrv: recR.score.hrv_rmssd_milli != null ? Math.round(recR.score.hrv_rmssd_milli) : null
        } : null,
        sleep: slpR && slpR.score ? {
          performance: num(slpR.score.sleep_performance_percentage),
          efficiency: num(slpR.score.sleep_efficiency_percentage)
        } : null,
        strain: cycR && cycR.score ? {
          strain: cycR.score.strain != null ? Math.round(cycR.score.strain * 10) / 10 : null,
          avgHr: num(cycR.score.average_heart_rate)
        } : null,
        ts: new Date().toISOString()
      };
      return json(out, 200, ch);
    }

    return new Response("FitTracker Whoop Worker — ok", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
};

function num(v) { return v != null ? Math.round(v) : null; }

async function saveTokens(env, tok) {
  const rec = {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: Date.now() + (tok.expires_in || 3600) * 1000
  };
  await env.TOKENS.put("tokens", JSON.stringify(rec));
}

async function getAccessToken(env) {
  const t = await env.TOKENS.get("tokens", "json");
  if (!t) throw new Error("not_connected");
  if (Date.now() < t.expires_at - 60000) return t.access_token;
  // Refresh (Whoop rotiert das Refresh-Token → neues speichern!)
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: t.refresh_token,
    client_id: env.WHOOP_CLIENT_ID,
    client_secret: env.WHOOP_CLIENT_SECRET,
    scope: "offline"
  });
  const r = await fetch(WHOOP_TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!r.ok) throw new Error("refresh_failed_" + r.status);
  await saveTokens(env, await r.json());
  const t2 = await env.TOKENS.get("tokens", "json");
  return t2.access_token;
}

async function fetchJson(u, h) {
  try { const r = await fetch(u, { headers: h }); if (!r.ok) return { records: [] }; return await r.json(); }
  catch { return { records: [] }; }
}

function htmlMsg(title, env, ok) {
  const back = ok
    ? `<a style="display:inline-block;margin-top:18px;background:#d4af37;color:#1a1a1a;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700" href="${env.APP_RETURN}?whoop=ok">Zurück zu FitTracker</a>`
    : `<a style="display:inline-block;margin-top:18px;color:#9aa3b2" href="${env.APP_RETURN}">Zurück</a>`;
  return new Response(
    `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">` +
    `<body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0f1115;color:#e8eaed;text-align:center;padding:48px 20px">` +
    `<h2 style="color:${ok ? '#3ecf8e' : '#ef5b6b'}">${title}</h2>${back}</body>`,
    { headers: { "Content-Type": "text/html;charset=utf-8" } }
  );
}
