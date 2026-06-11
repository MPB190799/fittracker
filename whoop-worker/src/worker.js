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
      const [rec, slp, cyc, body] = await Promise.all([
        fetchJson(WHOOP_API + "/v2/recovery?limit=1", h),
        fetchJson(WHOOP_API + "/v2/activity/sleep?limit=1", h),
        fetchJson(WHOOP_API + "/v2/cycle?limit=1", h),
        fetchJson(WHOOP_API + "/v2/user/measurement/body", h)
      ]);
      const recR = (rec.records || [])[0];
      const slpR = (slp.records || [])[0];
      const cycR = (cyc.records || [])[0];
      const rs = recR && recR.score, ss = slpR && slpR.score, cs = cycR && cycR.score;
      const stg = ss && ss.stage_summary || {};
      const needObj = ss && ss.sleep_needed || {};
      const needMilli = (needObj.baseline_milli || 0) + (needObj.need_from_sleep_debt_milli || 0) + (needObj.need_from_recent_strain_milli || 0) - (needObj.need_from_recent_nap_milli || 0);
      const asleepMilli = (stg.total_light_sleep_time_milli || 0) + (stg.total_slow_wave_sleep_time_milli || 0) + (stg.total_rem_sleep_time_milli || 0);
      const out = {
        connected: true,
        recovery: rs ? {
          score: num(rs.recovery_score),
          rhr: num(rs.resting_heart_rate),
          hrv: rs.hrv_rmssd_milli != null ? Math.round(rs.hrv_rmssd_milli) : null,
          spo2: rs.spo2_percentage != null ? Math.round(rs.spo2_percentage * 10) / 10 : null,
          skinTemp: rs.skin_temp_celsius != null ? Math.round(rs.skin_temp_celsius * 10) / 10 : null
        } : null,
        sleep: ss ? {
          performance: num(ss.sleep_performance_percentage),
          efficiency: num(ss.sleep_efficiency_percentage),
          consistency: num(ss.sleep_consistency_percentage),
          respiratory: ss.respiratory_rate != null ? Math.round(ss.respiratory_rate * 10) / 10 : null,
          asleepH: hrs(asleepMilli),
          needH: hrs(needMilli > 0 ? needMilli : 0),
          remH: hrs(stg.total_rem_sleep_time_milli),
          deepH: hrs(stg.total_slow_wave_sleep_time_milli),
          lightH: hrs(stg.total_light_sleep_time_milli),
          disturbances: num(stg.disturbance_count),
          cycles: num(stg.sleep_cycle_count)
        } : null,
        strain: cs ? {
          strain: cs.strain != null ? Math.round(cs.strain * 10) / 10 : null,
          avgHr: num(cs.average_heart_rate),
          maxHr: num(cs.max_heart_rate),
          kcal: cs.kilojoule != null ? Math.round(cs.kilojoule * 0.239006) : null
        } : null,
        body: body && body.weight_kilogram != null ? {
          weightKg: Math.round(body.weight_kilogram * 10) / 10,
          maxHr: num(body.max_heart_rate)
        } : null,
        ts: new Date().toISOString()
      };
      return json(out, 200, ch);
    }

    // 5) Historie (letzte N Tage direkt aus Whoop)
    if (path === "/whoop/history") {
      if (key !== env.APP_TOKEN) return json({ error: "unauthorized" }, 401, ch);
      let access;
      try { access = await getAccessToken(env); }
      catch (e) { return json({ connected: false }, 200, ch); }
      const h = { Authorization: "Bearer " + access };
      const lim = Math.min(25, Math.max(1, parseInt(url.searchParams.get("days") || "14", 10)));
      const [rec, slp, cyc] = await Promise.all([
        fetchJson(WHOOP_API + "/v2/recovery?limit=" + lim, h),
        fetchJson(WHOOP_API + "/v2/activity/sleep?limit=" + lim, h),
        fetchJson(WHOOP_API + "/v2/cycle?limit=" + lim, h)
      ]);
      const day = {};
      const get = (d) => (day[d] || (day[d] = { date: d }));
      for (const r of (rec.records || [])) {
        const d = (r.created_at || "").slice(0, 10); if (!d || !r.score) continue;
        const o = get(d); o.recovery = num(r.score.recovery_score); o.hrv = r.score.hrv_rmssd_milli != null ? Math.round(r.score.hrv_rmssd_milli) : null; o.rhr = num(r.score.resting_heart_rate);
      }
      for (const s of (slp.records || [])) {
        const d = (s.end || s.start || "").slice(0, 10); if (!d || !s.score) continue;
        const stg = s.score.stage_summary || {};
        const asleep = (stg.total_light_sleep_time_milli || 0) + (stg.total_slow_wave_sleep_time_milli || 0) + (stg.total_rem_sleep_time_milli || 0);
        const o = get(d); o.sleepPerf = num(s.score.sleep_performance_percentage); o.sleepH = hrs(asleep);
      }
      for (const c of (cyc.records || [])) {
        const d = (c.start || "").slice(0, 10); if (!d || !c.score) continue;
        const o = get(d); o.strain = c.score.strain != null ? Math.round(c.score.strain * 10) / 10 : null;
      }
      const days = Object.values(day).sort((a, b) => a.date.localeCompare(b.date));
      return json({ connected: true, days }, 200, ch);
    }

    return new Response("FitTracker Whoop Worker — ok", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
};

function num(v) { return v != null ? Math.round(v) : null; }
function hrs(milli) { return milli != null && milli > 0 ? Math.round(milli / 360000) / 10 : null; } // ms → Stunden (1 Dezimal)

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
