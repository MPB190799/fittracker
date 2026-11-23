// MB FIT (fittracker) — Whoop OAuth- & Daten-Proxy (Cloudflare Worker)
// Hält das client_secret sicher, macht den OAuth-Token-Tausch + rotierenden Refresh,
// speichert Tokens in KV (Single-User), liefert der PWA kompaktes JSON.
// Endpunkte: /auth/start, /auth/callback, /status, /whoop/today, /whoop/history,
// /vision/food, /food/search

const WHOOP_AUTH = "https://api.prod.whoop.com/oauth/oauth2/auth";
const WHOOP_TOKEN = "https://api.prod.whoop.com/oauth/oauth2/token";
const WHOOP_API = "https://api.prod.whoop.com/developer";
const SCOPES = "offline read:recovery read:sleep read:cycles read:profile read:workout";

function corsHeaders(origin, env) {
  const allowed = [env.APP_ORIGIN, "http://localhost:8099"];
  const o = allowed.indexOf(origin) >= 0 ? origin : env.APP_ORIGIN;
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Headers": "X-App-Token, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
      const [rec, slp, cyc, wo] = await Promise.all([
        fetchJson(WHOOP_API + "/v2/recovery?limit=" + lim, h),
        fetchJson(WHOOP_API + "/v2/activity/sleep?limit=" + lim, h),
        fetchJson(WHOOP_API + "/v2/cycle?limit=" + lim, h),
        fetchJsonS(WHOOP_API + "/v2/activity/workout?limit=25", h)
      ]);
      // Tageszuordnung: Ein Whoop-Zyklus läuft von Einschlafen zu Einschlafen. Früher wurde das
      // UTC-Startdatum genommen → wer vor Mitternacht einschläft, bekam Strain/Recovery auf den
      // VORTAG gebucht. Jetzt: lokale Zeit (timezone_offset) und Zyklus-Start + 12 h = „Whoop-Tag“
      // (23:00 eingeschlafen → nächster Tag, 01:00 → derselbe Tag). Recovery hängt am Zyklus.
      const day = {};
      const get = (d) => (day[d] || (day[d] = { date: d }));
      const cycDay = {};
      for (const c of (cyc.records || [])) {
        const d = localDay(c.start, c.timezone_offset, 12); if (!d) continue;
        cycDay[c.id] = d;
        if (!c.score) continue;
        const o = get(d); o.strain = c.score.strain != null ? Math.round(c.score.strain * 10) / 10 : null;
      }
      for (const s of (slp.records || [])) {
        if (s.nap || !s.score) continue; // Nickerchen nicht als Nachtschlaf zählen
        const d = localDay(s.end || s.start, s.timezone_offset, 0); if (!d) continue;
        const stg = s.score.stage_summary || {};
        const asleep = (stg.total_light_sleep_time_milli || 0) + (stg.total_slow_wave_sleep_time_milli || 0) + (stg.total_rem_sleep_time_milli || 0);
        const o = get(d); o.sleepPerf = num(s.score.sleep_performance_percentage); o.sleepH = hrs(asleep);
        o.bed = localTime(s.start, s.timezone_offset); o.wake = localTime(s.end, s.timezone_offset); // fürs Journal „früh ins Bett“
      }
      for (const r of (rec.records || [])) {
        if (!r.score) continue;
        const d = cycDay[r.cycle_id] || localDay(r.created_at, null, 0); if (!d) continue;
        const o = get(d); o.recovery = num(r.score.recovery_score); o.hrv = r.score.hrv_rmssd_milli != null ? Math.round(r.score.hrv_rmssd_milli) : null; o.rhr = num(r.score.resting_heart_rate);
      }
      // Workouts (Scope read:workout — fehlt er, muss Marco Whoop einmal neu verbinden)
      const needsWorkoutScope = wo.status === 401 || wo.status === 403;
      for (const w of ((wo.data && wo.data.records) || [])) {
        const d = localDay(w.start, w.timezone_offset, 0); if (!d) continue;
        const min = w.start && w.end ? Math.round((Date.parse(w.end) - Date.parse(w.start)) / 60000) : null;
        const o = get(d); (o.workouts || (o.workouts = [])).push({
          sport: w.sport_name || (w.sport_id != null ? "Sport " + w.sport_id : "Workout"), min,
          strain: w.score && w.score.strain != null ? Math.round(w.score.strain * 10) / 10 : null
        });
      }
      const days = Object.values(day).sort((a, b) => a.date.localeCompare(b.date));
      return json({ connected: true, days, needsWorkoutScope }, 200, ch);
    }

    // 6) Foto → Essen erkennen — Bild rein, Nährwerte raus
    // Historie: Gemini (bis 08/2026, Google sperrte den Consumer) → Groq (bis 11/2026, Modell
    // verschwand). Seit 23.11.2026 primär Cloudflare Workers AI im EIGENEN Account (Binding AI):
    // kein Drittanbieter, kein Key, 10.000 Neurons/Tag gratis. Groq nur noch als Notfall-Fallback.
    if (path === "/vision/food") {
      if (req.method !== "POST") return json({ error: "method" }, 405, ch);
      if (key !== env.APP_TOKEN) return json({ ok: false, error: "unauthorized" }, 401, ch);
      if (!env.AI && !env.GROQ_API_KEY) return json({ ok: false, error: "no_key" }, 200, ch);
      let body;
      try { body = await req.json(); } catch { return json({ ok: false, error: "bad_body" }, 400, ch); }
      const raw = String(body.image || "");
      const m = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
      const mime = m ? m[1] : "image/jpeg";
      const b64 = m ? m[2] : raw;
      if (!b64 || b64.length < 50) return json({ ok: false, error: "no_image" }, 400, ch);
      const hint = String(body.hint || "").trim().slice(0, 200);
      try {
        const out = await visionFood(env, mime, b64, hint);
        return json({ ok: true, ...out }, 200, ch);
      } catch (e) {
        return json({ ok: false, error: String(e && e.message || e) }, 200, ch);
      }
    }

    // 6b) Fortschrittsfotos vergleichen — NUR Cloudflare Workers AI im eigenen Account (Körperfotos gehen
    // bewusst nicht an Groq/Dritte). Nichts wird gespeichert.
    if (path === "/vision/compare") {
      if (req.method !== "POST") return json({ error: "method" }, 405, ch);
      if (key !== env.APP_TOKEN) return json({ ok: false, error: "unauthorized" }, 401, ch);
      if (!env.AI) return json({ ok: false, error: "no_ai" }, 200, ch);
      let body; try { body = await req.json(); } catch { return json({ ok: false, error: "bad_body" }, 400, ch); }
      const imgs = [body.a, body.b].map(x => String(x || ""));
      if (imgs.some(x => !/^data:image\/[a-z0-9.+-]+;base64,/i.test(x) || x.length < 200)) return json({ ok: false, error: "no_image" }, 400, ch);
      const prompt = COMPARE_PROMPT(String(body.pose || "Körper").slice(0, 40), Math.max(0, parseInt(body.days, 10) || 0));
      const content = [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: imgs[0] } }, { type: "image_url", image_url: { url: imgs[1] } }];
      const r = await cfChat(env, content);
      if (!r.raw) return json({ ok: false, error: r.err || "cf" }, 200, ch);
      try {
        const raw = r.raw.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```(?:json)?/g, "").trim();
        let p; try { p = JSON.parse(raw); } catch { const m = raw.match(/\{[\s\S]*\}/); p = m ? JSON.parse(m[0]) : null; }
        if (!p) throw new Error("unparsable");
        const changes = (Array.isArray(p.changes) ? p.changes : []).slice(0, 6).map(c => ({
          area: String(c.area || "").slice(0, 40), text: String(c.text || "").slice(0, 200),
          trend: ["besser", "gleich", "schlechter"].includes(c.trend) ? c.trend : "gleich" })).filter(c => c.area && c.text);
        return json({ ok: true, summary: String(p.summary || "").slice(0, 300), changes, note: String(p.note || "").slice(0, 200), model: r.used }, 200, ch);
      } catch (e) { return json({ ok: false, error: "unparsable" }, 200, ch); }
    }

    // 7) Lebensmittel-Suche (Open Food Facts, server-seitig) — search.openfoodfacts.org
    // sendet an den Browser KEINEN Access-Control-Allow-Origin-Header (bestätigt per curl),
    // Direkt-Fetch aus der PWA ist deshalb immer CORS-blockiert. Server-zu-Server geht das nicht an.
    if (path === "/food/search") {
      if (key !== env.APP_TOKEN) return json({ error: "unauthorized" }, 401, ch);
      const q = (url.searchParams.get("q") || "").trim();
      if (q.length < 2) return json({ hits: [] }, 200, ch);
      try {
        const off = new URL("https://search.openfoodfacts.org/search");
        off.searchParams.set("q", q);
        off.searchParams.set("page_size", "25");
        off.searchParams.set("lang", "de");
        off.searchParams.set("fields", "product_name,product_name_de,brands,nutriments,code");
        const r = await fetch(off.toString());
        const data = await r.json();
        return json({ hits: data.hits || data.products || [] }, 200, ch);
      } catch (e) {
        return json({ hits: [], error: String(e && e.message || e) }, 200, ch);
      }
    }

    return new Response("FitTracker Whoop Worker — ok", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
};

function num(v) { return v != null ? Math.round(v) : null; }
function localTime(iso, offset) { // ISO → "HH:MM" in Ortszeit
  const t = Date.parse(iso || ""); if (isNaN(t)) return null;
  let offMin = 60; const m = /^([+-])(\d{2}):?(\d{2})$/.exec(offset || "");
  if (m) offMin = (m[1] === "-" ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
  return new Date(t + offMin * 60000).toISOString().slice(11, 16);
}
// ISO-Zeit → lokales Datum (YYYY-MM-DD) per Whoop-timezone_offset ("+01:00"), plus shiftH Stunden.
// Ohne Offset: Europe/Berlin-Näherung +1 h (Marco sitzt dort), besser als nacktes UTC.
function localDay(iso, offset, shiftH) {
  if (!iso) return null;
  const t = Date.parse(iso); if (isNaN(t)) return null;
  let offMin = 60;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(offset || "");
  if (m) offMin = (m[1] === "-" ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
  return new Date(t + (offMin + (shiftH || 0) * 60) * 60000).toISOString().slice(0, 10);
}
function hrs(milli) { return milli != null && milli > 0 ? Math.round(milli / 360000) / 10 : null; } // ms → Stunden (1 Dezimal)

// ---- Groq Vision: Essensfoto → erkannte Speisen + geschätzte Nährwerte ----
// 23.11.2026: qwen/qwen3.6-27b ist aus dem Groq-Katalog verschwunden → Foto-Erkennung war tot.
// Laut console.groq.com/docs/vision jetzt: qwen/qwen3.8-27b (+ meta-models/muse-spark-open, Preview).
// Deshalb Fallback-Kette: optional env.GROQ_VISION_MODEL (ohne Code-Deploy umstellbar), dann Liste.
// Ist ein Modell weg (400/404 „model…“), wird automatisch das nächste probiert.
const GROQ_VISION_MODELS = ["qwen/qwen3.8-27b", "qwen/qwen3.6-27b", "meta-models/muse-spark-open"];
function clampNum(v, lo, hi) { v = Number(v); if (!isFinite(v)) return lo; return Math.max(lo, Math.min(hi, Math.round(v * 10) / 10)); }
const FOOD_PROMPT =
  'Du bist Ernährungswissenschaftler. Analysiere das Foto von Essen/Getränk.\n' +
  'Ballaststoffe (fiber) und Zucker (sugar) in Gramm ebenfalls schätzen.\n' +
  'Trenne JEDE einzelne Komponente auf dem Teller (z.B. Reis, Hähnchen, Salat separat).\n' +
  'Schätze für JEDES Item realistisch die sichtbare Portionsgröße in Gramm und die Nährwerte FÜR DIESE PORTION (nicht pro 100 g).\n' +
  'Antworte AUSSCHLIESSLICH mit reinem JSON nach exakt diesem Schema, ohne Markdown/Code-Fences/Erklärung:\n' +
  '{"items":[{"name":"deutscher Name","grams":Zahl,"kcal":Zahl,"protein":Zahl,"carbs":Zahl,"fat":Zahl,"fiber":Zahl,"sugar":Zahl,"confidence":0_bis_1}],"note":"kurzer deutscher Hinweis bei Unsicherheit, sonst leer"}\n' +
  'Ist kein Essen erkennbar: {"items":[],"note":"Kein Essen auf dem Foto erkannt"}.';

async function groqCall(apiKey, reqBody) {
  let r;
  try { r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey }, body: JSON.stringify(reqBody) }); }
  catch (e) { throw new Error("fetch_" + (e && e.message || e)); }
  if (r.ok) return { ok: true, data: await r.json() };
  let msg = ""; try { msg = JSON.stringify(await r.json()); } catch {}
  return { ok: false, status: r.status, msg };
}

function foodPrompt(hint) {
  return FOOD_PROMPT + (hint ? '\nHinweis vom Nutzer zum Foto (hat Vorrang bei Zweifeln): "' + hint.replace(/"/g, "'") + '"' : "");
}

// ---- Cloudflare Workers AI (eigener Account, Gratis-Kontingent) ----
// Modelle laut developers.cloudflare.com/workers-ai/models (Stand 23.11.2026). Bewusst KEIN
// llama-3.2-vision: Metas Lizenz für die multimodalen Llama-Modelle schließt EU-Nutzer aus.
const CF_VISION_MODELS = ["@cf/qwen/qwen3.8-27b", "@cf/mistralai/mistral-small-3.1-24b-instruct"];
function aiText(res) {
  if (res == null) return "";
  if (typeof res === "string") return res;
  const c = res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content;
  if (c != null) return typeof c === "string" ? c : JSON.stringify(c);
  if (res.response != null) return typeof res.response === "string" ? res.response : JSON.stringify(res.response);
  return "";
}
async function cfRaw(env, mime, b64, hint) {
  const errs = [];
  const models = [...new Set([env.CF_VISION_MODEL, ...CF_VISION_MODELS].filter(Boolean))];
  for (const model of models) {
    // 1. Denken aus (spart Neurons ≈ Faktor 3, schneller) → 2. wenig Denken → 3. Minimal-Request.
    // Laut Schema von qwen3.8: chat_template_kwargs.enable_thinking, reasoning_effort low|medium|xhigh.
    for (const extra of [
      { chat_template_kwargs: { enable_thinking: false }, response_format: { type: "json_object" } },
      { reasoning_effort: "low", response_format: { type: "json_object" } },
      {}
    ]) {
      try {
        const res = await env.AI.run(model, {
          messages: [{ role: "user", content: [
            { type: "text", text: foodPrompt(hint) },
            { type: "image_url", image_url: { url: "data:" + mime + ";base64," + b64 } }
          ] }],
          max_tokens: 2048, temperature: 0.2, ...extra
        });
        const raw = aiText(res);
        if (raw && /\{/.test(raw)) return { raw, used: model };
        errs.push(model + ":leer");
      } catch (e) {
        const m = String(e && e.message || e);
        errs.push(model + ":" + m.slice(0, 80));
        // Tageskontingent aufgebraucht / Account-Limit → anderes CF-Modell hilft nicht
        if (/neuron|quota|limit|4006|capacity/i.test(m)) return { raw: null, err: "cf_limit" };
      }
    }
  }
  return { raw: null, err: "cf_" + errs.join("|").slice(0, 160) };
}

const COMPARE_PROMPT = (pose, days) =>
  'Du bist ein erfahrener, ehrlicher Fitness-Coach. Bild 1 ist VORHER, Bild 2 ist NACHHER (' + days + ' Tage später), Pose: ' + pose + '.\n' +
  'Vergleiche sichtbare Veränderungen der Körperzusammensetzung: Taille/Bauch, Brust, Schultern, Arme, Rücken, Definition, Haltung — nur was du wirklich siehst.\n' +
  'Sei vorsichtig: Licht, Winkel, Abstand und Pump verfälschen. Nenne keine Körperfett-Prozentzahlen und keine medizinischen Aussagen. Bleib motivierend, aber ehrlich.\n' +
  'Antworte AUSSCHLIESSLICH mit reinem JSON ohne Markdown: {"summary":"1-2 Sätze Gesamteindruck","changes":[{"area":"z.B. Taille","text":"kurz, was sich verändert hat","trend":"besser|gleich|schlechter"}],"note":"Hinweis, falls Licht/Winkel den Vergleich erschweren, sonst leer"}';
// Allgemeiner Workers-AI-Aufruf mit Modell-Fallback (für Vergleiche mit mehreren Bildern)
async function cfChat(env, content) {
  const errs = [];
  for (const model of [...new Set([env.CF_VISION_MODEL, ...CF_VISION_MODELS].filter(Boolean))]) {
    for (const extra of [{ chat_template_kwargs: { enable_thinking: false }, response_format: { type: "json_object" } }, { reasoning_effort: "low" }, {}]) {
      try {
        const res = await env.AI.run(model, { messages: [{ role: "user", content }], max_tokens: 1500, temperature: 0.3, ...extra });
        const raw = aiText(res);
        if (raw && /\{/.test(raw)) return { raw, used: model };
      } catch (e) { const m = String(e && e.message || e); errs.push(m.slice(0, 60)); if (/neuron|quota|limit|4006|capacity/i.test(m)) return { raw: null, err: "cf_limit" }; }
    }
  }
  return { raw: null, err: "cf_" + errs.join("|").slice(0, 120) };
}

// Reihenfolge: Workers AI (gratis) → Groq (Notfall, ~0,1 Cent/Foto, nur wenn Key gesetzt)
async function visionFood(env, mime, b64, hint) {
  let raw = null, used = null, err = null;
  if (env.AI) { const r = await cfRaw(env, mime, b64, hint); raw = r.raw; used = r.used; err = r.err; }
  if (!raw && env.GROQ_API_KEY) {
    try { const g = await groqRaw(env.GROQ_API_KEY, mime, b64, hint, env.GROQ_VISION_MODEL); raw = g.raw; used = g.used; }
    catch (e) { if (!err || !env.AI) err = String(e && e.message || e); else err = err + "+" + String(e && e.message || e); }
  }
  if (!raw) throw new Error(err || "no_model");
  return parseFood(raw, used);
}

async function groqRaw(apiKey, mime, b64, hint, envModel) {
  const prompt = foodPrompt(hint);
  const models = [...new Set([envModel, ...GROQ_VISION_MODELS].filter(Boolean))];
  let data = null, used = null, lastErr = "groq_no_model";
  outer: for (const model of models) {
    // Qwen denkt standardmäßig laut (Chain-of-Thought) und frisst damit das Token-Budget auf,
    // bevor das JSON kommt → reasoning_effort "none". Kennt ein Modell den Wert nicht (400),
    // einmal ohne den Parameter wiederholen statt aufzugeben.
    for (const reasoning of ["none", null]) {
      const reqBody = {
        model,
        messages: [{ role: "user", content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: "data:" + mime + ";base64," + b64 } }
        ] }],
        temperature: 0.2,
        max_tokens: reasoning ? 1024 : 4096,
        response_format: { type: "json_object" }
      };
      if (reasoning) reqBody.reasoning_effort = reasoning;
      const res = await groqCall(apiKey, reqBody);
      if (res.ok) { data = res.data; used = model; break outer; }
      lastErr = "groq_" + res.status;
      if (res.status === 401 || res.status === 429) throw new Error(lastErr); // Key/Limit: anderes Modell hilft nicht
      const modelGone = res.status === 404 || /model/i.test(res.msg) && /not.?found|decommission|does not exist|not supported|access/i.test(res.msg);
      if (modelGone) continue outer;        // nächstes Modell
      if (res.status !== 400) throw new Error(lastErr);
      // sonstiger 400 → Retry ohne reasoning_effort, danach nächstes Modell
    }
  }
  if (!data) throw new Error(lastErr);
  return { raw: aiText(data), used };
}

function parseFood(rawIn, used) {
  // Falls das Modell trotzdem „laut denkt“: <think>…</think> entfernen, sonst greift die {…}-Suche ins Denken
  const raw = String(rawIn || "").replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```(?:json)?/g, "").trim();
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { const mm = raw.match(/\{[\s\S]*\}/); try { parsed = mm ? JSON.parse(mm[0]) : null; } catch { parsed = null; } }
  if (!parsed) throw new Error("unparsable");
  const items = (parsed.items || []).map(it => ({
    name: String(it.name || "").trim().slice(0, 60),
    grams: clampNum(it.grams, 0, 5000),
    kcal: clampNum(it.kcal, 0, 6000),
    protein: clampNum(it.protein, 0, 600),
    carbs: clampNum(it.carbs, 0, 600),
    fat: clampNum(it.fat, 0, 600),
    fiber: it.fiber != null ? clampNum(it.fiber, 0, 200) : null,
    sugar: it.sugar != null ? clampNum(it.sugar, 0, 600) : null,
    confidence: clampNum(it.confidence, 0, 1)
  })).filter(it => it.name);
  return { items, note: String(parsed.note || "").slice(0, 200), model: used };
}

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

async function fetchJsonS(u, h) { // wie fetchJson, aber mit Status (um fehlende Berechtigungen zu erkennen)
  try { const r = await fetch(u, { headers: h }); return { status: r.status, data: r.ok ? await r.json() : null }; }
  catch { return { status: 0, data: null }; }
}
async function fetchJson(u, h) {
  try { const r = await fetch(u, { headers: h }); if (!r.ok) return { records: [] }; return await r.json(); }
  catch { return { records: [] }; }
}

function htmlMsg(title, env, ok) {
  const back = ok
    ? `<a style="display:inline-block;margin-top:18px;background:#d4af37;color:#1a1a1a;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700" href="${env.APP_RETURN}?whoop=ok">Zurück zu MB FIT</a>`
    : `<a style="display:inline-block;margin-top:18px;color:#9aa3b2" href="${env.APP_RETURN}">Zurück</a>`;
  return new Response(
    `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">` +
    `<body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0f1115;color:#e8eaed;text-align:center;padding:48px 20px">` +
    `<h2 style="color:${ok ? '#3ecf8e' : '#ef5b6b'}">${title}</h2>${back}</body>`,
    { headers: { "Content-Type": "text/html;charset=utf-8" } }
  );
}
