// Worker-Logik offline testen (Groq + Whoop gemockt). Lauf: node tests/worker.test.mjs
import worker from "../whoop-worker/src/worker.js";
let fails = 0;
const ok = (c, m) => { console.log((c ? "✅ " : "❌ ") + m); if (!c) fails++; };
const kv = new Map();
const env = { APP_TOKEN: "t", GROQ_API_KEY: "g", WHOOP_CLIENT_ID: "c", WHOOP_CLIENT_SECRET: "s", APP_ORIGIN: "https://x",
  TOKENS: { get: async (k, t) => { const v = kv.get(k); return t === "json" && v ? JSON.parse(v) : v ?? null; }, put: async (k, v) => kv.set(k, v), delete: async (k) => kv.delete(k) } };
const call = (path, init = {}) => worker.fetch(new Request("https://w" + path, { ...init, headers: { "X-App-Token": "t", "Content-Type": "application/json", ...(init.headers || {}) } }), env).then(r => r.json());
const img = "data:image/jpeg;base64," + "A".repeat(100);
const groqOK = { choices: [{ message: { content: '<think>{bla}</think>{"items":[{"name":"Reis","grams":200,"kcal":260,"protein":5,"carbs":56,"fat":1,"confidence":0.8}],"note":""}' } }] };

// 1) Altes Modell weg (404) → Fallback auf nächstes Modell
let models = [];
globalThis.fetch = async (u, init) => {
  const b = JSON.parse(init.body); models.push(b.model);
  if (b.model === "qwen/qwen3.8-27b") return new Response(JSON.stringify({ error: { message: "The model `qwen/qwen3.8-27b` does not exist" } }), { status: 404 });
  return new Response(JSON.stringify(groqOK));
};
let d = await call("/vision/food", { method: "POST", body: JSON.stringify({ image: img, hint: "Reis" }) });
ok(d.ok && d.items[0].name === "Reis" && d.model === "qwen/qwen3.6-27b", "Modell-Fallback greift + <think> wird entfernt");

// 2) reasoning_effort unbekannt (400) → Retry ohne Parameter, gleiches Modell
models = []; let sawNoReasoning = false;
globalThis.fetch = async (u, init) => {
  const b = JSON.parse(init.body); models.push(b.model);
  if (b.reasoning_effort) return new Response(JSON.stringify({ error: { message: "invalid reasoning_effort" } }), { status: 400 });
  sawNoReasoning = true; return new Response(JSON.stringify(groqOK));
};
d = await call("/vision/food", { method: "POST", body: JSON.stringify({ image: img }) });
ok(d.ok && sawNoReasoning && d.model === "qwen/qwen3.8-27b", "400 auf reasoning_effort → Retry ohne");

// 3) Rate-Limit → sauberer Fehlercode, kein Modell-Durchprobieren
models = [];
globalThis.fetch = async (u, init) => { models.push(1); return new Response("{}", { status: 429 }); };
d = await call("/vision/food", { method: "POST", body: JSON.stringify({ image: img }) });
ok(!d.ok && d.error === "groq_429" && models.length === 1, "429 → groq_429 ohne weitere Versuche");

// 4) Whoop-Historie: Einschlafen 23:30 Berlin → Strain/Recovery auf dem FOLGETAG
kv.set("tokens", JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: Date.now() + 3600e3 }));
globalThis.fetch = async (u) => {
  u = String(u);
  if (u.includes("/v2/cycle")) return new Response(JSON.stringify({ records: [{ id: 7, start: "2026-11-21T22:30:00.000Z", timezone_offset: "+01:00", score: { strain: 12.34 } }] }));
  if (u.includes("/v2/activity/sleep")) return new Response(JSON.stringify({ records: [{ start: "2026-11-21T22:30:00.000Z", end: "2026-11-22T06:15:00.000Z", timezone_offset: "+01:00", nap: false, score: { sleep_performance_percentage: 90, stage_summary: { total_light_sleep_time_milli: 4 * 3600e3, total_slow_wave_sleep_time_milli: 1.5 * 3600e3, total_rem_sleep_time_milli: 1.5 * 3600e3 } } }] }));
  if (u.includes("/v2/recovery")) return new Response(JSON.stringify({ records: [{ cycle_id: 7, created_at: "2026-11-22T06:20:00.000Z", score: { recovery_score: 71, hrv_rmssd_milli: 55.2, resting_heart_rate: 52 } }] }));
  return new Response("{}");
};
d = await call("/whoop/history?days=3");
const day = (d.days || []).find(x => x.date === "2026-11-22") || {};
ok(d.days.length === 1 && day.strain === 12.3 && day.recovery === 71 && day.sleepH === 7, "Whoop-Tag korrekt: alles am 22.11. (vorher Strain am 21.11.)");

process.exitCode = fails ? 1 : 0;

// 5) Workers AI (gratis) hat Vorrang — Groq wird gar nicht angefragt
let groqCalls = 0, aiModels = [];
globalThis.fetch = async () => { groqCalls++; return new Response(JSON.stringify(groqOK)); };
env.AI = { run: async (model, inp) => { aiModels.push(model);
  if (!inp.messages[0].content[1].image_url.url.startsWith("data:image/jpeg;base64,")) throw new Error("bild fehlt");
  return { response: '{"items":[{"name":"Banane","grams":120,"kcal":110,"protein":1,"carbs":27,"fat":0.4,"confidence":0.9}],"note":""}' }; } };
d = await call("/vision/food", { method: "POST", body: JSON.stringify({ image: img }) });
ok(d.ok && d.items[0].name === "Banane" && d.model === "@cf/qwen/qwen3.8-27b" && groqCalls === 0, "Workers AI zuerst, Groq unberührt");

// 6) Erstes CF-Modell wirft → zweites CF-Modell (OpenAI-Format), immer noch ohne Groq
aiModels = []; groqCalls = 0;
env.AI = { run: async (model) => { aiModels.push(model);
  if (model === "@cf/qwen/qwen3.8-27b") throw new Error("5007: model not found");
  return { choices: [{ message: { content: '```json\n{"items":[{"name":"Ei","grams":60,"kcal":90,"protein":7,"carbs":0.5,"fat":6}]}\n```' } }] }; } };
d = await call("/vision/food", { method: "POST", body: JSON.stringify({ image: img }) });
ok(d.ok && d.model.includes("mistral") && groqCalls === 0, "CF-Fallback auf Mistral (Code-Fences werden entfernt)");

// 7) Gratis-Kontingent leer → Groq-Notfall; ohne Groq-Key → klare Meldung cf_limit
env.AI = { run: async () => { throw new Error("4006: you have used up your daily free allocation of 10,000 neurons"); } };
d = await call("/vision/food", { method: "POST", body: JSON.stringify({ image: img }) });
ok(d.ok && groqCalls === 1, "Kontingent leer → Groq als Notfall");
const gk = env.GROQ_API_KEY; delete env.GROQ_API_KEY;
d = await call("/vision/food", { method: "POST", body: JSON.stringify({ image: img }) });
ok(!d.ok && d.error === "cf_limit", "ohne Groq-Key → cf_limit");
env.GROQ_API_KEY = gk; delete env.AI;

// 8) Historie mit Workouts + Einschlafzeit (Ortszeit)
globalThis.fetch = async (u) => {
  u = String(u);
  if (u.includes("/v2/cycle")) return new Response(JSON.stringify({ records: [] }));
  if (u.includes("/v2/recovery")) return new Response(JSON.stringify({ records: [] }));
  if (u.includes("/v2/activity/sleep")) return new Response(JSON.stringify({ records: [{ start: "2026-11-21T21:40:00.000Z", end: "2026-11-22T05:50:00.000Z", timezone_offset: "+01:00", nap: false, score: { sleep_performance_percentage: 88, stage_summary: {} } }] }));
  if (u.includes("/v2/activity/workout")) return new Response(JSON.stringify({ records: [{ start: "2026-11-22T17:00:00.000Z", end: "2026-11-22T18:15:00.000Z", timezone_offset: "+01:00", sport_name: "weightlifting", score: { strain: 9.84 } }] }));
  return new Response("{}");
};
d = await call("/whoop/history?days=3");
const d22 = (d.days || []).find(x => x.date === "2026-11-22") || {};
ok(d22.bed === "22:40" && d22.wake === "06:50" && d22.workouts && d22.workouts[0].min === 75 && d22.workouts[0].sport === "weightlifting" && d.needsWorkoutScope === false, "Historie: Einschlafen 22:40, Krafttraining 75 min");
globalThis.fetch = async (u) => String(u).includes("/workout") ? new Response("{}", { status: 403 }) : new Response(JSON.stringify({ records: [] }));
d = await call("/whoop/history?days=3");
ok(d.needsWorkoutScope === true, "fehlende Workout-Berechtigung wird erkannt");
process.exitCode = fails ? 1 : 0;
