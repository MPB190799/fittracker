// FitTracker — 100% client-side (GitHub Pages). Daten im Browser: localStorage + IndexedDB (Fotos).
// iOS-Safari-robust: kein structuredClone im Hot-Path, defensiver Boot, sichtbarer Fehler statt stiller Tod.
"use strict";
const APP_VERSION = "v12 · 2026-11-23";

const $ = (s) => document.querySelector(s);
const on = (sel, ev, fn) => { const el = $(sel); if (el) el.addEventListener(ev, fn); };
const clone = (o) => JSON.parse(JSON.stringify(o));
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
// Zeitzonensichere Tages-Arithmetik (rein lokal, kein UTC-Übersprung wie bei new Date("…T00:00:00"))
const pad2 = (n) => String(n).padStart(2, "0");
function dayOffset(dateStr, delta) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return dt.getFullYear() + "-" + pad2(dt.getMonth() + 1) + "-" + pad2(dt.getDate());
}
const MEALS = { fruehstueck: "Frühstück", mittag: "Mittag", abend: "Abend", snack: "Snack" };
const WHENLBL = { morgens: "morgens", mittag: "mittags", abend: "abends", taeglich: "täglich" };
const uid = () => ((window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "id" + Date.now() + Math.random().toString(16).slice(2));

// Marcos echter BioHacking-Stack als Startwerte (nur falls noch keine Supplements existieren)
const SEED_SUPPS = [
  { name: "Creatin (Monohydrat)", dose: "5 g in Wasser", when: "morgens", cyclic: false },
  { name: "Magnesium Komplex", dose: "1 Portion mit Wasser", when: "abend", cyclic: false },
  { name: "Zink Komplex", dose: "1 mit Essen", when: "morgens", cyclic: true },
  { name: "Ashwagandha (KSM-66)", dose: "300–600 mg", when: "abend", cyclic: false },
  { name: "Omega-3 (DHA/EPA)", dose: "≥1000 mg mit fettem Essen", when: "taeglich", cyclic: false },
  { name: "Bockshornklee", dose: "im Salat / Shake", when: "taeglich", cyclic: false },
  { name: "Himalaya-Salz", dose: "1 Prise ins Wasser", when: "morgens", cyclic: false }
];

// Eingebaute Mini-Datenbank häufiger Lebensmittel (immer + offline durchsuchbar, Werte pro 100 g)
const LOCAL_FOODS = [
  { name: "Magerquark", per100: { kcal: 67, protein: 12, carbs: 4, fat: 0.3 } },
  { name: "Skyr natur", per100: { kcal: 63, protein: 11, carbs: 4, fat: 0.2 } },
  { name: "Haferflocken", per100: { kcal: 372, protein: 13.5, carbs: 59, fat: 7 } },
  { name: "Banane", per100: { kcal: 93, protein: 1.1, carbs: 21, fat: 0.3 } },
  { name: "Apfel", per100: { kcal: 52, protein: 0.3, carbs: 14, fat: 0.2 } },
  { name: "Ei (Hühnerei)", per100: { kcal: 155, protein: 13, carbs: 1.1, fat: 11 } },
  { name: "Hähnchenbrust", per100: { kcal: 165, protein: 31, carbs: 0, fat: 3.6 } },
  { name: "Rinderhack (mager)", per100: { kcal: 187, protein: 21, carbs: 0, fat: 11 } },
  { name: "Lachs", per100: { kcal: 208, protein: 20, carbs: 0, fat: 13 } },
  { name: "Thunfisch (Dose, Wasser)", per100: { kcal: 116, protein: 26, carbs: 0, fat: 1 } },
  { name: "Reis (gekocht)", per100: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 } },
  { name: "Kartoffeln (gekocht)", per100: { kcal: 77, protein: 2, carbs: 17, fat: 0.1 } },
  { name: "Vollkornbrot", per100: { kcal: 230, protein: 8, carbs: 40, fat: 3 } },
  { name: "Nudeln (gekocht)", per100: { kcal: 158, protein: 6, carbs: 31, fat: 1 } },
  { name: "Milch 1,5%", per100: { kcal: 47, protein: 3.4, carbs: 4.9, fat: 1.5 } },
  { name: "Gouda / Käse", per100: { kcal: 356, protein: 25, carbs: 0, fat: 28 } },
  { name: "Olivenöl", per100: { kcal: 884, protein: 0, carbs: 0, fat: 100 } },
  { name: "Mandeln", per100: { kcal: 579, protein: 21, carbs: 22, fat: 50 } },
  { name: "Whey Protein (Pulver)", per100: { kcal: 380, protein: 78, carbs: 8, fat: 6 } },
  { name: "Käsekuchen", per100: { kcal: 254, protein: 6, carbs: 30, fat: 12 } },
  { name: "Reiswaffel", per100: { kcal: 387, protein: 8, carbs: 81, fat: 3 } },
  { name: "Avocado", per100: { kcal: 160, protein: 2, carbs: 9, fat: 15 } },
  { name: "Kreatin Monohydrat (Pulver)", per100: { kcal: 0, protein: 0, carbs: 0, fat: 0 } },
  // Erweiterung — häufige deutsche Hausmannskost & Grundnahrungsmittel
  { name: "Vollkornnudeln (gekocht)", per100: { kcal: 124, protein: 5, carbs: 23, fat: 1.2 } },
  { name: "Quinoa (gekocht)", per100: { kcal: 120, protein: 4.4, carbs: 21, fat: 1.9 } },
  { name: "Linsen (gekocht)", per100: { kcal: 116, protein: 9, carbs: 20, fat: 0.4 } },
  { name: "Kichererbsen (gekocht)", per100: { kcal: 164, protein: 9, carbs: 27, fat: 2.6 } },
  { name: "Bohnen (Dose)", per100: { kcal: 91, protein: 6, carbs: 12, fat: 0.5 } },
  { name: "Brokkoli", per100: { kcal: 34, protein: 2.8, carbs: 7, fat: 0.4 } },
  { name: "Tomate", per100: { kcal: 18, protein: 0.9, carbs: 3.9, fat: 0.2 } },
  { name: "Gurke", per100: { kcal: 12, protein: 0.6, carbs: 2.2, fat: 0.1 } },
  { name: "Paprika", per100: { kcal: 31, protein: 1, carbs: 6, fat: 0.3 } },
  { name: "Karotte", per100: { kcal: 41, protein: 0.9, carbs: 10, fat: 0.2 } },
  { name: "Zwiebel", per100: { kcal: 40, protein: 1.1, carbs: 9, fat: 0.1 } },
  { name: "Spinat", per100: { kcal: 23, protein: 2.9, carbs: 3.6, fat: 0.4 } },
  { name: "Blattsalat", per100: { kcal: 15, protein: 1.4, carbs: 2.9, fat: 0.2 } },
  { name: "Pute (Brust)", per100: { kcal: 135, protein: 30, carbs: 0, fat: 1 } },
  { name: "Schweineschnitzel (natur)", per100: { kcal: 143, protein: 22, carbs: 0, fat: 6 } },
  { name: "Hackfleisch gemischt", per100: { kcal: 250, protein: 18, carbs: 0, fat: 20 } },
  { name: "Bratwurst", per100: { kcal: 290, protein: 13, carbs: 1, fat: 26 } },
  { name: "Schinken (gekocht)", per100: { kcal: 110, protein: 18, carbs: 1, fat: 4 } },
  { name: "Salami", per100: { kcal: 378, protein: 22, carbs: 1, fat: 32 } },
  { name: "Forelle", per100: { kcal: 119, protein: 20, carbs: 0, fat: 4 } },
  { name: "Garnelen", per100: { kcal: 99, protein: 24, carbs: 0.2, fat: 0.3 } },
  { name: "Hüttenkäse (körnig)", per100: { kcal: 98, protein: 12, carbs: 3.4, fat: 4.3 } },
  { name: "Joghurt (natur 3,5%)", per100: { kcal: 63, protein: 3.5, carbs: 4.7, fat: 3.5 } },
  { name: "Griechischer Joghurt 10%", per100: { kcal: 133, protein: 6, carbs: 4, fat: 10 } },
  { name: "Butter", per100: { kcal: 717, protein: 0.9, carbs: 0.7, fat: 81 } },
  { name: "Frischkäse", per100: { kcal: 253, protein: 6, carbs: 3.5, fat: 24 } },
  { name: "Mozzarella", per100: { kcal: 254, protein: 18, carbs: 1, fat: 19 } },
  { name: "Brötchen (Weizen)", per100: { kcal: 265, protein: 8.6, carbs: 51, fat: 1.5 } },
  { name: "Toastbrot", per100: { kcal: 273, protein: 8, carbs: 49, fat: 4 } },
  { name: "Brezel", per100: { kcal: 338, protein: 9, carbs: 67, fat: 3.4 } },
  { name: "Pizza Margherita", per100: { kcal: 240, protein: 10, carbs: 30, fat: 8 } },
  { name: "Pommes frites", per100: { kcal: 312, protein: 3.4, carbs: 41, fat: 15 } },
  { name: "Döner (mit allem)", per100: { kcal: 215, protein: 14, carbs: 18, fat: 10 } },
  { name: "Müsli (gemischt)", per100: { kcal: 360, protein: 9, carbs: 60, fat: 8 } },
  { name: "Cornflakes", per100: { kcal: 357, protein: 7, carbs: 84, fat: 0.9 } },
  { name: "Honig", per100: { kcal: 304, protein: 0.3, carbs: 82, fat: 0 } },
  { name: "Nutella", per100: { kcal: 539, protein: 6, carbs: 57, fat: 31 } },
  { name: "Erdnussbutter", per100: { kcal: 588, protein: 25, carbs: 20, fat: 50 } },
  { name: "Walnüsse", per100: { kcal: 654, protein: 15, carbs: 14, fat: 65 } },
  { name: "Cashewkerne", per100: { kcal: 553, protein: 18, carbs: 30, fat: 44 } },
  { name: "Dunkle Schokolade (85%)", per100: { kcal: 592, protein: 10, carbs: 19, fat: 50 } },
  { name: "Orange", per100: { kcal: 47, protein: 0.9, carbs: 12, fat: 0.1 } },
  { name: "Heidelbeeren", per100: { kcal: 57, protein: 0.7, carbs: 14, fat: 0.3 } },
  { name: "Erdbeeren", per100: { kcal: 32, protein: 0.7, carbs: 8, fat: 0.3 } },
  { name: "Weintrauben", per100: { kcal: 69, protein: 0.7, carbs: 18, fat: 0.2 } },
  { name: "Bier (Pils)", per100: { kcal: 43, protein: 0.5, carbs: 3.6, fat: 0 } },
  { name: "Rotwein", per100: { kcal: 85, protein: 0.1, carbs: 2.6, fat: 0 } },
  { name: "Cola", per100: { kcal: 42, protein: 0, carbs: 10.6, fat: 0 } },
  { name: "Orangensaft", per100: { kcal: 45, protein: 0.7, carbs: 10, fat: 0.2 } },
  { name: "Proteinriegel", per100: { kcal: 350, protein: 33, carbs: 30, fat: 9 } }
];
// Haushalts-Portionen für die Schnell-Mengen-Chips (g pro Einheit)
const PORTIONS = [
  { t: "Scheibe Brot", g: 45 }, { t: "Ei", g: 60 }, { t: "Handvoll", g: 30 },
  { t: "Glas (250 ml)", g: 250 }, { t: "Tasse", g: 200 }, { t: "EL", g: 15 }, { t: "TL", g: 5 }
];

const DEFAULT = {
  profile: { kcalTarget: 2200, proteinPerKg: 2.0, carbTarget: 220, fatTarget: 70, waterTarget: 2500 },
  entries: [], weights: [], photos: [], foods: [],
  supplements: SEED_SUPPS.map(s => ({ id: uid(), ...s })),
  suppLog: {}, // { "2026-06-11": { suppId: true } }
  journal: {}, // { "2026-06-11": { flags:{}, mood:3, note:"" } }
  bodyLog: {}, // { "2026-06-11": { recovery, hrv, rhr, sleepH, sleepPerf, strain } }
  water: {}    // { "2026-06-11": ml }
};
const JFLAGS = [
  { k: "alkohol", t: "🍺 Alkohol" }, { k: "spaet", t: "🌙 spät gegessen" },
  { k: "koffein", t: "☕ Koffein spät" }, { k: "stress", t: "😰 Stress" },
  { k: "sport", t: "🏋️ Sport" }, { k: "gut", t: "😴 gut geschlafen" }
];
const RING_C = 2 * Math.PI * 42; // Umfang des Ring-Kreises (r=42)
const LS_KEY = "fittracker:db";

let state = load();
let selDate = today();
let per100 = null;

// ---------- persistence ----------
// Gemeinsame Absicherung für load() UND Backup-Import: ein rohes/fremdes/beschädigtes db-Objekt
// (localStorage ODER eine importierte Backup-Datei) darf nie ein falsch typisiertes Feld
// durchreichen — sonst crasht die App später an z.B. state.foods.push() auf einem String.
function normalizeState(db) {
  db = db && typeof db === "object" ? db : {};
  return {
    ...clone(DEFAULT), ...db,
    profile: { ...DEFAULT.profile, ...(db.profile || {}) },
    entries: Array.isArray(db.entries) ? db.entries : [],
    weights: Array.isArray(db.weights) ? db.weights : [],
    photos: Array.isArray(db.photos) ? db.photos : [],
    // supplements nur seeden, wenn der Key komplett fehlt (Bestandsdaten ohne Tabletten-Feature)
    supplements: Array.isArray(db.supplements) ? db.supplements : clone(DEFAULT.supplements),
    suppLog: db.suppLog && typeof db.suppLog === "object" ? db.suppLog : {},
    foods: Array.isArray(db.foods) ? db.foods : [],
    journal: db.journal && typeof db.journal === "object" ? db.journal : {},
    bodyLog: db.bodyLog && typeof db.bodyLog === "object" ? db.bodyLog : {},
    water: db.water && typeof db.water === "object" ? db.water : {}
  };
}
function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return clone(DEFAULT);
    return normalizeState(JSON.parse(raw));
  } catch (e) { console.error("load failed", e); return clone(DEFAULT); }
}
function persist() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { showErr("Speichern fehlgeschlagen (Speicher voll?)."); } }

// ---------- IndexedDB für Foto-Blobs ----------
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("fittracker", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("photos");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbPut(id, val) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction("photos", "readwrite"); tx.objectStore("photos").put(val, id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
async function idbGet(id) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction("photos", "readonly"); const rq = tx.objectStore("photos").get(id); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }); }
async function idbDel(id) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction("photos", "readwrite"); tx.objectStore("photos").delete(id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }

// ---------- helpers ----------
function latestWeight() { return state.weights.length ? state.weights[state.weights.length - 1].kg : null; }
function proteinTarget() { const w = latestWeight(); return w ? Math.round(w * (state.profile.proteinPerKg || 2)) : null; }
function dayEntries() { return state.entries.filter(e => e.date === selDate); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function round1(n) { return Math.round(n * 10) / 10; }
function showErr(msg) { const b = $("#errbar"); if (b) { b.textContent = "⚠ " + msg; b.style.display = "block"; } }

// ---------- render diary ----------
function setRing(id, pct) {
  const el = $("#" + id); if (!el) return;
  const p = Math.min(1, Math.max(0, pct || 0));
  el.style.strokeDasharray = RING_C;
  el.style.strokeDashoffset = RING_C * (1 - p);
  el.classList.toggle("over", pct > 1.0001);
}
function renderSummary() {
  const es = dayEntries();
  const sum = es.reduce((a, e) => ({ kcal: a.kcal + e.kcal, p: a.p + e.protein, c: a.c + e.carbs, f: a.f + e.fat }), { kcal: 0, p: 0, c: 0, f: 0 });
  const pT = proteinTarget();
  const kT = state.profile.kcalTarget || 0;
  const set = (id, v) => { const el = $("#" + id); if (el) el.textContent = v; };
  // kcal-Ring (Mitte = übrig)
  const restK = Math.round(kT - sum.kcal);
  set("restKcal", restK);
  set("kcalSub", Math.round(sum.kcal) + " / " + kT);
  setRing("ringKcal", kT ? sum.kcal / kT : 0);
  const rk = $("#restKcal"); if (rk) rk.classList.toggle("neg", restK < 0);
  // Eiweiß-Ring
  const restP = pT != null ? Math.round(pT - sum.p) : null;
  set("restProt", restP != null ? restP : "–");
  set("protSub", pT != null ? Math.round(sum.p) + " / " + pT : "Gewicht?");
  setRing("ringProt", pT ? sum.p / pT : 0);
  const rp = $("#restProt"); if (rp) rp.classList.toggle("neg", restP != null && restP < 0);
  // KH/Fett-Balken
  set("cVal", Math.round(sum.c)); set("cTgt", "/ " + state.profile.carbTarget);
  set("fVal", Math.round(sum.f)); set("fTgt", "/ " + state.profile.fatTarget);
  const bar = (id, val, tgt) => { const el = $("#" + id); if (el) el.style.width = (tgt ? Math.min(100, (val / tgt) * 100) : 0) + "%"; };
  bar("cBar", sum.c, state.profile.carbTarget);
  bar("fBar", sum.f, state.profile.fatTarget);
}
function renderMeals() {
  const es = dayEntries();
  const card = $("#mealsCard"); if (!card) return;
  card.innerHTML = "<h2>Mahlzeiten</h2>";
  for (const key of Object.keys(MEALS)) {
    const items = es.filter(e => e.meal === key);
    const sub = items.reduce((a, e) => a + e.kcal, 0);
    const div = document.createElement("div");
    div.className = "meal";
    div.innerHTML = `<div class="meal-head"><span>${MEALS[key]}</span><span>${Math.round(sub)} kcal</span></div>`;
    if (!items.length) div.innerHTML += `<div class="empty">— noch nichts —</div>`;
    for (const e of items) {
      const row = document.createElement("div");
      row.className = "entry";
      row.innerHTML = `<div class="info"><div class="nm">${esc(e.name)}</div>
        <div class="sub">${e.grams} g · ${e.protein}P / ${e.carbs}K / ${e.fat}F</div></div>
        <div class="kc">${Math.round(e.kcal)}</div><button class="x" title="löschen">✕</button>`;
      row.querySelector(".info").onclick = () => openSheet(key, e);
      row.querySelector(".x").onclick = (ev) => { ev.stopPropagation(); state.entries = state.entries.filter(x => x.id !== e.id); persist(); renderDiary(); };
      div.appendChild(row);
    }
    const add = document.createElement("button");
    add.className = "add"; add.textContent = "+ " + MEALS[key];
    add.onclick = () => openSheet(key);
    div.appendChild(add);
    card.appendChild(div);
  }
  const rep = document.createElement("button");
  rep.className = "ghost"; rep.style.cssText = "width:100%;margin-top:8px";
  rep.textContent = "↻ Gestern wiederholen";
  rep.onclick = copyYesterday;
  card.appendChild(rep);
}
function copyYesterday() {
  const prev = dayOffset(selDate, -1);
  const items = state.entries.filter(e => e.date === prev);
  if (!items.length) return alert("Für gestern gibt es keine Einträge zum Übernehmen.");
  if (!confirm(`${items.length} Einträge von gestern (${prev}) auf heute übernehmen?`)) return;
  for (const e of items) state.entries.push({ id: uid(), date: selDate, meal: e.meal, name: e.name, grams: e.grams, kcal: e.kcal, protein: e.protein, carbs: e.carbs, fat: e.fat });
  persist(); renderDiary();
}
function renderDiary() { renderSummary(); renderMeals(); renderWater(); renderTodayBody(); }

// ---------- supplements ----------
// Nur LESEN legt nichts an (früher erzeugte schon das Durchblättern leere Tage → die
// Auswertung zählte sie als „nicht genommen“ und erfand Muster). Angelegt wird erst beim Abhaken.
function suppTakenMap() { return state.suppLog[selDate] || {}; }
function suppTakenMapW() { return state.suppLog[selDate] || (state.suppLog[selDate] = {}); }
function renderSupps() {
  const box = $("#suppList"); if (!box) return;
  box.innerHTML = "";
  if (!state.supplements.length) { box.innerHTML = `<div class="empty">Noch keine Supplements — unten hinzufügen.</div>`; return; }
  const taken = suppTakenMap();
  const order = { morgens: 0, mittag: 1, abend: 2, taeglich: 3 };
  const list = [...state.supplements].sort((a, b) => (order[a.when] ?? 9) - (order[b.when] ?? 9));
  for (const s of list) {
    const done = !!taken[s.id];
    const row = document.createElement("div");
    row.className = "supp" + (done ? " done" : "");
    row.innerHTML = `
      <div class="chk">${done ? "✓" : ""}</div>
      <div class="info">
        <div class="nm">${esc(s.name)}${s.cyclic ? ` <span class="tag">zyklisch</span>` : ""}</div>
        <div class="sub">${esc(s.dose || "")}${s.dose ? " · " : ""}${WHENLBL[s.when] || s.when}</div>
      </div>
      <button class="edit" title="bearbeiten">✎</button>`;
    row.querySelector(".chk").onclick = row.querySelector(".info").onclick = () => {
      const t = suppTakenMapW();
      if (t[s.id]) delete t[s.id]; else t[s.id] = true;
      if (!Object.keys(t).length) delete state.suppLog[selDate];
      persist(); renderSupps();
    };
    row.querySelector(".edit").onclick = (ev) => { ev.stopPropagation(); openSuppSheet(s); };
    box.appendChild(row);
  }
  const c = list.filter(s => taken[s.id]).length;
  const head = document.createElement("div");
  head.className = "supp-count";
  head.textContent = `${c} / ${list.length} genommen`;
  box.prepend(head);
}
function openSuppSheet(supp) {
  $("#suppTitle").textContent = supp ? "Supplement bearbeiten" : "Supplement hinzufügen";
  $("#suppEditId").value = supp ? supp.id : "";
  $("#suppName").value = supp ? supp.name : "";
  $("#suppDose").value = supp ? (supp.dose || "") : "";
  $("#suppWhen").value = supp ? supp.when : "morgens";
  $("#suppCyclic").checked = supp ? !!supp.cyclic : false;
  $("#delSupp").style.display = supp ? "block" : "none";
  showSheet("supp", true);
}
on("#addSuppBtn", "click", () => openSuppSheet(null));
on("#saveSupp", "click", () => {
  const name = $("#suppName").value.trim();
  if (!name) return alert("Name fehlt.");
  const data = { name, dose: $("#suppDose").value.trim(), when: $("#suppWhen").value, cyclic: $("#suppCyclic").checked };
  const id = $("#suppEditId").value;
  if (id) { const ex = state.supplements.find(x => x.id === id); if (ex) Object.assign(ex, data); }
  else state.supplements.push({ id: uid(), ...data });
  persist(); showSheet("supp", false); renderSupps();
});
on("#delSupp", "click", () => {
  const id = $("#suppEditId").value;
  if (id && confirm("Supplement löschen?")) {
    state.supplements = state.supplements.filter(x => x.id !== id);
    for (const d of Object.keys(state.suppLog)) delete state.suppLog[d][id];
    persist(); showSheet("supp", false); renderSupps();
  }
});
on("#closeSupp", "click", () => showSheet("supp", false));
on("#suppBg", "click", () => showSheet("supp", false));

// ---------- add/edit food sheet ----------
function openSheet(meal, entry) {
  per100 = null;
  $("#sheetTitle").textContent = entry ? "Eintrag bearbeiten" : "Lebensmittel hinzufügen";
  $("#mealSelect").value = (entry ? entry.meal : meal) || "snack";
  $("#editId").value = entry ? entry.id : "";
  $("#fName").value = entry ? entry.name : "";
  $("#fGrams").value = entry ? entry.grams : 100;
  $("#fKcal").value = entry ? entry.kcal : "";
  $("#fProtein").value = entry ? entry.protein : "";
  $("#fCarbs").value = entry ? entry.carbs : "";
  $("#fFat").value = entry ? entry.fat : "";
  $("#searchInput").value = ""; $("#results").innerHTML = ""; $("#per100hint").textContent = "";
  const vb = $("#visionBox"); if (vb) vb.innerHTML = "";
  const vh = $("#visionHint"); if (vh) vh.value = "";
  $("#saveEntry").textContent = entry ? "Speichern" : "Hinzufügen";
  renderFavChips();
  showSheet("food", true);
}
function showSheet(which, on) {
  const bg = which === "supp" ? "#suppBg" : "#sheetBg";
  const sh = which === "supp" ? "#suppSheet" : "#addSheet";
  $(bg).classList.toggle("show", on);
  $(sh).classList.toggle("show", on);
  // Sheets werden nur per transform aus dem Bild geschoben (kein display:none) — ohne inert
  // bleiben sie für Tastatur/Screenreader erreichbar, obwohl sie unsichtbar sind.
  $(sh).toggleAttribute("inert", !on);
  if (!on && which === "food") stopScan();
}
function applyPer100() {
  if (!per100) return;
  const g = Number($("#fGrams").value) || 0;
  $("#fKcal").value = Math.round(per100.kcal * g / 100);
  $("#fProtein").value = round1(per100.protein * g / 100);
  $("#fCarbs").value = round1(per100.carbs * g / 100);
  $("#fFat").value = round1(per100.fat * g / 100);
}
// Für Mengen-Chips: mit bekannter Quelle (Suche/Barcode/Foto/Favorit) exakt aus per100 neu
// rechnen; bei manuell eingetragenen Werten (kein per100) proportional zum Gramm-Verhältnis
// skalieren, statt die alten Makros bei geänderter Menge einfach stehen zu lassen.
function setGramsScaled(newG) {
  const gEl = $("#fGrams");
  const oldG = Number(gEl.value) || 0;
  gEl.value = newG;
  if (per100) { applyPer100(); return; }
  if (oldG > 0 && newG !== oldG) {
    const ratio = newG / oldG;
    const scale = (id, round) => { const el = $("#" + id); el.value = round(( Number(el.value) || 0) * ratio); };
    scale("fKcal", Math.round); scale("fProtein", round1); scale("fCarbs", round1); scale("fFat", round1);
  }
}

// ---------- Open Food Facts ----------
let searchTimer;
on("#searchInput", "input", (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (q.length < 2) { $("#results").innerHTML = ""; return; }
  searchTimer = setTimeout(() => offSearch(q), 350);
});
function localMatches(q) {
  const ql = q.toLowerCase(), seen = new Set(), out = [];
  for (const f of [...state.foods, ...LOCAL_FOODS]) {
    const k = (f.name || "").toLowerCase();
    if (k.indexOf(ql) >= 0 && !seen.has(k)) { seen.add(k); out.push({ name: f.name, per100: f.per100, local: true }); }
  }
  return out.slice(0, 8);
}
async function offSearch(q) {
  const box = $("#results");
  // 1) lokale Treffer sofort (offline, schnell)
  const local = localMatches(q);
  const seen = new Set(local.map(x => x.name.toLowerCase()));
  renderResults(local.length ? local : [{ name: "Suche…", per100: { kcal: 0, protein: 0 }, _ph: true }]);
  // 2) Open Food Facts dazu — NUR über den Worker-Proxy: search.openfoodfacts.org sendet an den
  // Browser keinen Access-Control-Allow-Origin-Header, ein Direkt-Fetch ist deshalb immer
  // CORS-blockiert (bestätigt). Ohne App-Schlüssel (Worker-Zugang) bleibt es bei lokalen Treffern.
  const k = whoopKey();
  if (!k) { renderResults(local); return; }
  try {
    const url = WHOOP_WORKER + "/food/search?q=" + encodeURIComponent(q);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    const data = await (await fetch(url, { signal: ctrl.signal, headers: { "X-App-Token": k } })).json();
    clearTimeout(t);
    const off = (data.hits || []).map(parseOFF).filter(Boolean).filter(it => !seen.has(it.name.toLowerCase()));
    const all = local.concat(off);
    renderResults(all.length ? all : []);
  } catch {
    if (!local.length) box.innerHTML = `<div class="empty">Suche fehlgeschlagen — lokale Treffer oben nutzen oder Werte unten manuell eintragen.</div>`;
    else renderResults(local);
  }
}
function parseOFF(p) {
  const n = p.nutriments || {};
  const nm = p.product_name_de || p.product_name;
  const name = [nm, p.brands].filter(Boolean).join(" · ").trim();
  if (!name) return null;
  const kcal = n["energy-kcal_100g"] != null ? n["energy-kcal_100g"] : (n["energy_100g"] ? n["energy_100g"] / 4.184 : null);
  if (kcal == null) return null;
  return { name: name.slice(0, 100), per100: { kcal: +kcal, protein: +(n.proteins_100g || 0), carbs: +(n.carbohydrates_100g || 0), fat: +(n.fat_100g || 0) } };
}
function renderResults(items) {
  const box = $("#results");
  if (!items.length) { box.innerHTML = `<div class="empty">Nichts gefunden — Werte unten manuell eintragen.</div>`; return; }
  box.innerHTML = "";
  for (const it of items) {
    const d = document.createElement("div");
    d.className = "res";
    if (it._ph) { d.className = "empty"; d.textContent = "Suche…"; box.appendChild(d); continue; }
    const tag = it.local ? `<span class="restag">🔖</span> ` : "";
    d.innerHTML = `<div class="nm">${tag}${esc(it.name)}</div><div class="sub">${Math.round(it.per100.kcal)} kcal · ${round1(it.per100.protein)}P /100g</div>`;
    d.onclick = () => pickFood(it);
    box.appendChild(d);
  }
}
function pickFood(it) {
  per100 = it.per100;
  $("#fName").value = it.name;
  if (!Number($("#fGrams").value)) $("#fGrams").value = 100;
  applyPer100();
  $("#per100hint").textContent = `Pro 100g: ${Math.round(it.per100.kcal)} kcal · ${round1(it.per100.protein)}P / ${round1(it.per100.carbs)}K / ${round1(it.per100.fat)}F — Menge oben anpassen, rechnet automatisch.`;
  $("#results").innerHTML = ""; $("#searchInput").value = "";
}
on("#fGrams", "input", applyPer100);
for (const id of ["fKcal", "fProtein", "fCarbs", "fFat"]) {
  on("#" + id, "input", () => { per100 = null; $("#per100hint").textContent = ""; });
}

// ---------- Favoriten / eigene Lebensmittel ----------
function foodKey(name) { return String(name || "").trim().toLowerCase(); }
function rememberFood(e) {
  if (!e.name) return;
  const g = e.grams || 0;
  const per100 = g ? { kcal: e.kcal / g * 100, protein: e.protein / g * 100, carbs: e.carbs / g * 100, fat: e.fat / g * 100 }
    : { kcal: e.kcal, protein: e.protein, carbs: e.carbs, fat: e.fat };
  const key = foodKey(e.name);
  let f = state.foods.find(x => foodKey(x.name) === key);
  if (f) { f.uses = (f.uses || 0) + 1; f.lastUsed = selDate; f.per100 = per100; f.lastGrams = e.grams; }
  else state.foods.push({ id: uid(), name: e.name, per100, uses: 1, lastUsed: selDate, lastGrams: e.grams });
}
function renderFavChips() {
  const wrap = $("#favWrap"), box = $("#favChips"); if (!box) return;
  const list = [...state.foods]
    .sort((a, b) => (b.lastUsed || "").localeCompare(a.lastUsed || "") || (b.uses || 0) - (a.uses || 0))
    .slice(0, 10);
  if (!list.length) { wrap.style.display = "none"; return; }
  wrap.style.display = "block"; box.innerHTML = "";
  for (const f of list) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip";
    b.textContent = f.name.length > 24 ? f.name.slice(0, 23) + "…" : f.name;
    b.onclick = () => {
      pickFood({ name: f.name, per100: f.per100 });
      if (f.lastGrams) { $("#fGrams").value = f.lastGrams; applyPer100(); }
    };
    box.appendChild(b);
  }
}
function renderFoodsList() {
  const box = $("#foodsList"); if (!box) return;
  if (!state.foods.length) { box.innerHTML = `<div class="empty">Noch keine eigenen Lebensmittel — sammeln sich automatisch beim Eintragen.</div>`; return; }
  const list = [...state.foods].sort((a, b) => (b.lastUsed || "").localeCompare(a.lastUsed || "") || (b.uses || 0) - (a.uses || 0));
  box.innerHTML = "";
  for (const f of list) {
    const row = document.createElement("div");
    row.className = "entry";
    row.innerHTML = `<div class="info"><div class="nm">${esc(f.name)}</div>
      <div class="sub">${Math.round(f.per100.kcal)} kcal/100g · ${f.uses || 1}× benutzt${f.lastUsed ? " · zuletzt " + esc(f.lastUsed) : ""}</div></div>
      <button class="x" title="löschen">✕</button>`;
    row.querySelector(".x").onclick = () => {
      if (confirm(`„${f.name}" aus den eigenen Lebensmitteln löschen?`)) {
        state.foods = state.foods.filter(x => x.id !== f.id);
        persist(); renderFoodsList();
      }
    };
    box.appendChild(row);
  }
}

// ---------- Schnell-Mengen ----------
document.querySelectorAll("#amountChips button").forEach(b => b.onclick = () => {
  const cur = Number($("#fGrams").value) || 100;
  const newG = b.dataset.g ? Number(b.dataset.g) : Math.round(cur * Number(b.dataset.mult));
  setGramsScaled(newG);
});

// ---------- Barcode ----------
let scanner = null;
on("#scanBtn", "click", () => scanner ? stopScan() : startScan());
on("#manualBarcodeBtn", "click", () => {
  const code = prompt("Barcode-Nummer (EAN) eingeben:");
  if (code && code.trim()) barcodeLookup(code.trim());
});
async function startScan() {
  if (!window.Html5Qrcode) return alert("Scanner lädt noch — kurz warten und nochmal tippen.");
  if (!window.isSecureContext) return alert("Kamera-Scan braucht HTTPS — auf der mpb190799.github.io-URL funktioniert es.");
  $("#reader").style.display = "block";
  $("#scanBtn").textContent = "⏹ Stoppen";
  // Gezielt auf die Handels-Barcodes (EAN/UPC) scharfstellen → schneller + treffsicherer
  let cfg;
  if (window.Html5QrcodeSupportedFormats) {
    const F = Html5QrcodeSupportedFormats;
    cfg = { formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128] };
  }
  scanner = cfg ? new Html5Qrcode("reader", cfg) : new Html5Qrcode("reader");
  try {
    await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 270, height: 170 }, aspectRatio: 1.4 },
      async (code) => { await stopScan(); await barcodeLookup(code); }, () => {});
  } catch (e) {
    alert("Kamera nicht verfügbar. Tipp: in den iPhone-Einstellungen Safari → Kamera erlauben. Oder ‚EAN eingeben' nutzen.");
    stopScan();
  }
}
async function stopScan() {
  const b = $("#scanBtn"); if (b) b.textContent = "📷 Barcode";
  const r = $("#reader"); if (r) r.style.display = "none";
  if (scanner) { try { await scanner.stop(); scanner.clear(); } catch {} scanner = null; }
}
async function barcodeLookup(code) {
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_de,brands,nutriments`;
    const data = await (await fetch(url)).json();
    if (data.status !== 1) { alert("Barcode " + code + " ist nicht in Open Food Facts. Tipp: Produkt über die Suche finden oder per 🍽️ Foto erkennen lassen."); const si = $("#searchInput"); if (si) si.focus(); return; }
    const it = parseOFF(data.product);
    if (it) pickFood(it); else alert("Keine Nährwerte zu diesem Produkt — manuell eintragen.");
  } catch { alert("Lookup fehlgeschlagen (offline?)."); }
}

// ---------- save food entry ----------
on("#saveEntry", "click", () => {
  const e = {
    date: selDate, meal: $("#mealSelect").value, name: $("#fName").value.trim(),
    grams: Math.max(0, Number($("#fGrams").value) || 0), kcal: Math.max(0, Math.round(Number($("#fKcal").value) || 0)),
    protein: Math.max(0, round1(Number($("#fProtein").value) || 0)), carbs: Math.max(0, round1(Number($("#fCarbs").value) || 0)), fat: Math.max(0, round1(Number($("#fFat").value) || 0))
  };
  if (!e.name) return alert("Name fehlt.");
  const id = $("#editId").value;
  if (id) { const ex = state.entries.find(x => x.id === id); if (ex) Object.assign(ex, e); }
  else state.entries.push({ id: uid(), ...e });
  rememberFood(e);
  persist(); showSheet("food", false); renderDiary();
});
on("#closeSheet", "click", () => showSheet("food", false));
on("#sheetBg", "click", () => showSheet("food", false));

// ---------- weight ----------
on("#saveWeight", "click", () => {
  const kg = Number($("#weightInput").value);
  if (!kg) return alert("Gewicht eingeben.");
  state.weights = state.weights.filter(w => w.date !== selDate);
  state.weights.push({ id: uid(), date: selDate, kg });
  state.weights.sort((a, b) => a.date.localeCompare(b.date));
  persist(); $("#weightInput").value = ""; renderWeight(); renderSummary(); fillGoals();
});
function renderWeight() {
  const list = $("#weightList"); if (!list) return; list.innerHTML = "";
  [...state.weights].reverse().forEach(w => {
    const row = document.createElement("div");
    row.className = "entry";
    row.innerHTML = `<div class="info"><div class="nm">${esc(w.date)}</div></div><div class="kc">${w.kg} kg</div><button class="x">✕</button>`;
    row.querySelector(".x").onclick = () => { state.weights = state.weights.filter(x => x.id !== w.id); persist(); renderWeight(); renderSummary(); fillGoals(); };
    list.appendChild(row);
  });
  drawWeightChart();
}
function drawWeightChart() {
  const cv = $("#weightChart"); if (!cv) return;
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 320, H = 160;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext("2d"); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, W, H);
  const pts = state.weights.slice(-30);
  if (pts.length < 2) { ctx.fillStyle = "#9aa3b2"; ctx.font = "13px sans-serif"; ctx.fillText("Mind. 2 Einträge für den Verlauf.", 10, 80); return; }
  const ys = pts.map(p => p.kg); let min = Math.min(...ys), max = Math.max(...ys); if (min === max) { min -= 1; max += 1; }
  // x nach echtem Datum (Lücken sichtbar), nicht gleichmäßig nach Index
  const dnum = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  const t0 = dnum(pts[0].date), span = Math.max(1, dnum(pts[pts.length - 1].date) - t0);
  const pad = 24, gx = (i) => pad + (dnum(pts[i].date) - t0) / span * (W - 2 * pad), gy = (v) => H - pad - (v - min) / (max - min) * (H - 2 * pad);
  ctx.strokeStyle = "#5b9bef"; ctx.lineWidth = 2; ctx.beginPath();
  pts.forEach((p, i) => { i ? ctx.lineTo(gx(i), gy(p.kg)) : ctx.moveTo(gx(i), gy(p.kg)); }); ctx.stroke();
  ctx.fillStyle = "#5b9bef"; pts.forEach((p, i) => { ctx.beginPath(); ctx.arc(gx(i), gy(p.kg), 3, 0, 7); ctx.fill(); });
  ctx.fillStyle = "#9aa3b2"; ctx.font = "11px sans-serif"; ctx.fillText(max.toFixed(1), 2, gy(max) + 4); ctx.fillText(min.toFixed(1), 2, gy(min) + 4);
}

// ---------- photos ----------
on("#addPhoto", "click", () => $("#photoInput").click());
on("#photoInput", "change", async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const dataUrl = await resizeImage(file, 1280, 0.82);
    const id = uid();
    await idbPut(id, dataUrl);
    state.photos.push({ id, date: selDate, note: "" });
    state.photos.sort((a, b) => a.date.localeCompare(b.date));
    persist(); e.target.value = ""; switchTab("photos"); renderPhotos();
  } catch (err) { alert("Foto konnte nicht gespeichert werden."); }
});
function resizeImage(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      let w = img.width, h = img.height;
      if (Math.max(w, h) > maxDim) { const s = maxDim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = (e) => { URL.revokeObjectURL(objUrl); reject(e); };
    img.src = objUrl;
  });
}
async function renderPhotos() {
  const grid = $("#photoGrid"); if (!grid) return; grid.innerHTML = "";
  if (!state.photos.length) { grid.innerHTML = `<div class="empty">Noch keine Fotos.</div>`; return; }
  for (const p of [...state.photos].reverse()) {
    const d = document.createElement("div");
    d.className = "photo";
    d.innerHTML = `<img loading="lazy" /><div class="cap">${esc(p.date)}</div><button class="del">✕</button>`;
    idbGet(p.id).then(url => { if (url) d.querySelector("img").src = url; });
    d.querySelector(".del").onclick = async () => { if (confirm("Foto löschen?")) { await idbDel(p.id); state.photos = state.photos.filter(x => x.id !== p.id); persist(); renderPhotos(); } };
    grid.appendChild(d);
  }
}

// ---------- goals ----------
function fillGoals() {
  $("#goalKcal").value = state.profile.kcalTarget;
  $("#goalProteinPerKg").value = state.profile.proteinPerKg;
  $("#goalCarb").value = state.profile.carbTarget;
  $("#goalFat").value = state.profile.fatTarget;
  const w = latestWeight(), pt = proteinTarget();
  $("#proteinCalc").textContent = w ? `= ${pt} g Eiweiß/Tag bei ${w} kg (zuletzt eingetragen).` : "Trag dein Gewicht ein → Eiweiß-Ziel rechnet sich automatisch.";
}
on("#saveGoals", "click", () => {
  // Leeres/ungültiges Feld darf das Ziel nie stillschweigend auf 0 setzen (kaputt wirkender
  // Ring ohne Erklärung) — dann lieber den bisherigen Wert behalten.
  const keep = (val, fallback) => { const n = Number(val); return n > 0 ? n : fallback; };
  Object.assign(state.profile, {
    kcalTarget: keep($("#goalKcal").value, state.profile.kcalTarget),
    proteinPerKg: keep($("#goalProteinPerKg").value, state.profile.proteinPerKg || 2),
    carbTarget: keep($("#goalCarb").value, state.profile.carbTarget),
    fatTarget: keep($("#goalFat").value, state.profile.fatTarget)
  });
  persist(); renderDiary(); fillGoals(); alert("Ziele gespeichert.");
});

// ---------- backup ----------
on("#exportBtn", "click", async () => {
  const photos = {};
  for (const p of state.photos) { const url = await idbGet(p.id); if (url) photos[p.id] = url; }
  const blob = new Blob([JSON.stringify({ v: 1, state, photos }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `fittracker-backup-${today()}.json`;
  a.click();
});
on("#importBtn", "click", () => $("#importFile").click());
on("#importFile", "change", async (e) => {
  const file = e.target.files[0]; if (!file) return;
  if (!confirm("Backup einspielen? Überschreibt aktuelle Daten auf diesem Gerät.")) { e.target.value = ""; return; }
  try {
    const data = JSON.parse(await file.text());
    if (!data.state) throw new Error("kein gültiges Backup");
    state = normalizeState(data.state);
    persist();
    for (const [id, url] of Object.entries(data.photos || {})) await idbPut(id, url);
    renderAll(); alert("Backup eingespielt.");
  } catch (err) { alert("Import fehlgeschlagen: " + err.message); }
  e.target.value = "";
});

// ---------- tabs & date ----------
document.querySelectorAll("nav.tabs button").forEach(b => b.onclick = () => switchTab(b.dataset.tab));
function switchTab(tab) {
  document.querySelectorAll("nav.tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tabpage").forEach(p => p.classList.toggle("active", p.id === "tab-" + tab));
  if (tab === "weight") drawWeightChart();
  if (tab === "photos") renderPhotos();
  if (tab === "supps") renderSupps();
  if (tab === "body") { loadWhoop(); renderJournal(); loadHistory(); renderWeekReport(); }
  if (tab === "goals") renderFoodsList();
}
on("#datePicker", "change", (e) => { selDate = e.target.value || today(); refreshDate(); });
on("#prevDay", "click", () => shiftDay(-1));
on("#nextDay", "click", () => shiftDay(1));
function shiftDay(d) {
  selDate = dayOffset(selDate, d);
  refreshDate();
}
function refreshDate() { $("#datePicker").value = selDate; renderDiary(); renderSupps(); renderJournal(); }

// ---------- FAB (schnell hinzufügen) ----------
on("#fab", "click", () => {
  const h = new Date().getHours();
  const meal = h < 11 ? "fruehstueck" : h < 15 ? "mittag" : h < 21 ? "abend" : "snack";
  switchTab("diary"); openSheet(meal);
});

// ---------- Onboarding (Erststart) ----------
function showOb(on) { $("#obBg").classList.toggle("show", on); $("#obSheet").classList.toggle("show", on); $("#obSheet").toggleAttribute("inert", !on); }
function finishOb() { try { localStorage.setItem("fittracker:onboarded", "1"); } catch {} showOb(false); }
function maybeOnboard() {
  let seen = false; try { seen = !!localStorage.getItem("fittracker:onboarded"); } catch {}
  if (!seen && !state.weights.length && !state.entries.length) showOb(true);
}
on("#obSave", "click", () => {
  const w = Number($("#obWeight").value), k = Number($("#obKcal").value);
  if (w) { state.weights = state.weights.filter(x => x.date !== today()); state.weights.push({ id: uid(), date: today(), kg: w }); state.weights.sort((a, b) => a.date.localeCompare(b.date)); }
  if (k) state.profile.kcalTarget = k;
  persist(); finishOb(); renderAll();
});
on("#obSkip", "click", finishOb);
on("#obBg", "click", finishOb);

// ---------- Whoop (Körper) ----------
const WHOOP_WORKER = "https://fittracker-whoop.mbcapitalstrategies.workers.dev";
function whoopKey() { try { return localStorage.getItem("fittracker:whoopkey") || ""; } catch { return ""; } }
function setWhoopKey(k) { try { k ? localStorage.setItem("fittracker:whoopkey", k) : localStorage.removeItem("fittracker:whoopkey"); } catch {} }
on("#whoopConnect", "click", () => {
  const k = $("#whoopKey").value.trim();
  const msg = $("#whoopMsg");
  if (!k) { if (msg) { msg.textContent = "⚠ Bitte zuerst den App-Schlüssel oben einfügen, dann erneut tippen."; msg.style.color = "var(--red)"; } return; }
  setWhoopKey(k);
  if (msg) { msg.textContent = "Öffne Whoop-Login…"; msg.style.color = "var(--muted)"; }
  window.location.href = WHOOP_WORKER + "/auth/start?key=" + encodeURIComponent(k);
});
on("#whoopRefresh", "click", () => loadWhoop(true));
on("#whoopDisconnect", "click", () => { if (confirm("Whoop-Verbindung auf diesem Gerät trennen?")) { setWhoopKey(""); loadWhoop(); } });
async function loadWhoop(force) {
  const conn = $("#bodyConnect"), data = $("#bodyData"); if (!conn || !data) return;
  const k = whoopKey();
  if (!k) { conn.style.display = "block"; data.style.display = "none"; return; }
  $("#whoopKey").value = k;
  try {
    const r = await fetch(WHOOP_WORKER + "/whoop/today", { headers: { "X-App-Token": k } });
    const d = await r.json();
    if (!d || !d.connected) {
      conn.style.display = "block"; data.style.display = "none";
      $("#whoopMsg").textContent = d && d.error === "unauthorized" ? "Schlüssel stimmt nicht." : "Noch nicht mit Whoop eingeloggt — Button tippen.";
      return;
    }
    conn.style.display = "none"; data.style.display = "block";
    renderWhoop(d);
  } catch { $("#whoopMsg").textContent = "Server nicht erreichbar (offline?)."; }
}
function renderWhoop(d) {
  const set = (id, v) => { const el = $("#" + id); if (el) el.textContent = v; };
  const rec = d.recovery || {}, slp = d.sleep || {}, str = d.strain || {};
  const dash = (v, suf) => v != null ? (v + (suf || "")) : "–";
  // Recovery-Hero
  set("recVal", rec.score != null ? rec.score + "%" : "–");
  const amp = $("#recAmpel");
  if (amp) amp.textContent = rec.score != null ? (rec.score >= 67 ? "🟢 erholt" : rec.score >= 34 ? "🟡 mittel" : "🔴 niedrig") : "";
  const rv = $("#recVal");
  if (rv) rv.style.color = rec.score == null ? "var(--text)" : rec.score >= 67 ? "var(--green)" : rec.score >= 34 ? "var(--gold)" : "var(--red)";
  // Erholung
  set("hrvVal", dash(rec.hrv)); set("rhrVal", dash(rec.rhr)); set("spo2Val", dash(rec.spo2)); set("skinVal", dash(rec.skinTemp));
  // Schlaf
  set("slpHVal", slp.asleepH != null ? slp.asleepH + " h" : "–");
  set("slpNeedSub", slp.needH != null ? "Bedarf " + slp.needH + " h" : "h");
  set("slpPerfVal", dash(slp.performance)); set("slpEffVal", dash(slp.efficiency));
  set("remVal", dash(slp.remH)); set("deepVal", dash(slp.deepH)); set("respVal", dash(slp.respiratory));
  // Belastung
  set("strVal", dash(str.strain)); set("avgHrVal", dash(str.avgHr)); set("maxHrVal", dash(str.maxHr)); set("kcalBurnVal", dash(str.kcal));
  // Empfehlung
  let reco = "";
  if (rec.score != null && rec.score < 34) reco = "Erholung niedrig — heute eher leichte Einheit, genug Eiweiß + Schlaf priorisieren.";
  else if (str.strain != null && str.strain >= 14) reco = "Hohe Belastung heute — achte auf ausreichend kcal + Eiweiß für die Regeneration.";
  else if (rec.score != null && rec.score >= 67) reco = "Gut erholt — guter Tag für eine intensive Einheit.";
  set("whoopReco", reco);
  set("whoopTs", d.ts ? "Stand: " + new Date(d.ts).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "");
  // heutigen Snapshot lokal speichern (Historie)
  if (rec.score != null || slp.asleepH != null || str.strain != null) {
    state.bodyLog[today()] = { recovery: rec.score, hrv: rec.hrv, rhr: rec.rhr, sleepH: slp.asleepH, sleepPerf: slp.performance, strain: str.strain };
    persist();
  }
}

// ---------- Journal ----------
const J_EMPTY = () => ({ flags: {}, mood: 0, note: "" });
function jToday() { return state.journal[selDate] || J_EMPTY(); }          // nur lesen
function jTodayW() { return state.journal[selDate] || (state.journal[selDate] = J_EMPTY()); } // schreiben
// Ein Journal-Tag zählt nur, wenn wirklich etwas eingetragen wurde
function jLogged(j) { return !!j && (Object.values(j.flags || {}).some(Boolean) || j.mood > 0 || !!(j.note || "").trim()); }
function renderJournal() {
  const box = $("#jflags"); if (!box) return;
  const j = jToday();
  box.innerHTML = "";
  for (const f of JFLAGS) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip" + (j.flags[f.k] ? " on" : "");
    b.textContent = f.t;
    b.onclick = () => { const w = jTodayW(); w.flags[f.k] = !w.flags[f.k]; persist(); renderJournal(); };
    box.appendChild(b);
  }
  const mood = $("#jmood");
  if (mood) {
    mood.innerHTML = "";
    ["😖", "😕", "😐", "🙂", "😄"].forEach((emo, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "moodb" + (j.mood === i + 1 ? " on" : "");
      b.textContent = emo;
      b.onclick = () => { const w = jTodayW(); w.mood = w.mood === i + 1 ? 0 : i + 1; persist(); renderJournal(); };
      mood.appendChild(b);
    });
  }
  const note = $("#jnote"); if (note && note.value !== j.note) note.value = j.note || "";
}
on("#jnote", "input", (e) => { jTodayW().note = e.target.value; persist(); });

// ---------- Verlauf + Insights ----------
async function loadHistory(force) {
  // Netzwerk-Aufruf braucht den Whoop-Schlüssel — die Render-Funktionen darunter nicht: sie
  // zeigen ohne Daten den korrekten Leer-Hinweis statt einer stumm leeren Fläche.
  const k = whoopKey();
  if (k) {
    try {
      const r = await fetch(WHOOP_WORKER + "/whoop/history?days=14", { headers: { "X-App-Token": k } });
      const d = await r.json();
      if (d && d.days) {
        for (const day of d.days) {
          const prev = state.bodyLog[day.date] || {};
          state.bodyLog[day.date] = { ...prev, recovery: day.recovery, hrv: day.hrv, rhr: day.rhr, sleepH: day.sleepH, sleepPerf: day.sleepPerf, strain: day.strain };
        }
        persist();
      }
    } catch {}
  }
  drawTrend(); renderInsights(); renderSuppInsights(); renderWeekReport();
}
function bodyDays(n) {
  return Object.keys(state.bodyLog).sort().slice(-n).map(date => ({ date, ...state.bodyLog[date] }));
}
function drawTrend() {
  const cv = $("#trendChart"); if (!cv) return;
  const pts = bodyDays(14);
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 320, H = 150;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext("2d"); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, W, H);
  if (pts.length < 2) { ctx.fillStyle = "#9aa3b2"; ctx.font = "13px sans-serif"; ctx.fillText("Noch zu wenig Tage für den Verlauf.", 10, 75); return; }
  const pad = 22, n = pts.length;
  const gx = (i) => pad + i * (W - 2 * pad) / (n - 1);
  // Recovery 0-100 (gold)
  const gyR = (v) => H - pad - (v / 100) * (H - 2 * pad);
  ctx.strokeStyle = "#d4af37"; ctx.lineWidth = 2; ctx.beginPath();
  let started = false;
  pts.forEach((p, i) => { if (p.recovery == null) return; const x = gx(i), y = gyR(p.recovery); started ? ctx.lineTo(x, y) : ctx.moveTo(x, y); started = true; });
  ctx.stroke();
  ctx.fillStyle = "#d4af37"; pts.forEach((p, i) => { if (p.recovery == null) return; ctx.beginPath(); ctx.arc(gx(i), gyR(p.recovery), 2.5, 0, 7); ctx.fill(); });
  // Schlaf h 0-10 (blau)
  const gyS = (v) => H - pad - (Math.min(v, 10) / 10) * (H - 2 * pad);
  ctx.strokeStyle = "#5b9bef"; ctx.lineWidth = 2; ctx.beginPath(); started = false;
  pts.forEach((p, i) => { if (p.sleepH == null) return; const x = gx(i), y = gyS(p.sleepH); started ? ctx.lineTo(x, y) : ctx.moveTo(x, y); started = true; });
  ctx.stroke();
}
function renderInsights() {
  const box = $("#insights"); if (!box) return;
  // Tage mit Journal UND Recovery
  const rows = [];
  for (const date of Object.keys(state.bodyLog)) {
    const b = state.bodyLog[date], j = state.journal[date];
    if (b && b.recovery != null && jLogged(j)) rows.push({ date, rec: b.recovery, flags: j.flags || {} });
  }
  if (rows.length < 4) {
    box.innerHTML = `<p class="hint">Noch ${Math.max(0, 4 - rows.length)} Journal-Tag(e) bis zur ersten Auswertung. Trag oben einfach täglich kurz ein, was war.</p>`;
    return;
  }
  const out = [];
  for (const f of JFLAGS) {
    const withF = rows.filter(r => r.flags[f.k]), without = rows.filter(r => !r.flags[f.k]);
    if (withF.length >= 2 && without.length >= 2) {
      const avg = (a) => Math.round(a.reduce((s, r) => s + r.rec, 0) / a.length);
      const aw = avg(withF), ao = avg(without), diff = aw - ao;
      if (Math.abs(diff) >= 4) out.push({ t: f.t, aw, ao, diff });
    }
  }
  if (!out.length) { box.innerHTML = `<p class="hint">Noch keine klaren Muster — sammle ein paar Tage mehr.</p>`; return; }
  out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  box.innerHTML = out.slice(0, 4).map(o => {
    const good = o.diff > 0;
    return `<div class="insight ${good ? "good" : "bad"}">${good ? "🟢" : "🔻"} <b>${esc(o.t)}</b>: Recovery Ø <b>${o.aw}%</b> vs <b>${o.ao}%</b> ohne <span class="idiff">(${o.diff > 0 ? "+" : ""}${o.diff})</span></div>`;
  }).join("");
}
on("#histRefresh", "click", () => loadHistory(true));

// ---------- Foto-KI: Essen erkennen (Groq Vision über Worker, optional mit Text-Hinweis) ----------
on("#photoFoodBtn", "click", () => $("#foodPhotoInput").click());
on("#foodPhotoInput", "change", async (e) => {
  const file = e.target.files[0]; e.target.value = "";
  if (!file) return;
  const box = $("#visionBox"); if (!box) return;
  const k = whoopKey();
  if (!k) { box.innerHTML = `<div class="vision-msg err">⚠ Für die Foto-Erkennung einmalig im Körper-Tab (🫀) den App-Schlüssel hinterlegen — derselbe wie für Whoop.</div>`; return; }
  box.innerHTML = `<div class="vision-msg loading"><span class="spin"></span>Essen wird erkannt… (ein paar Sekunden)</div>`;
  try {
    const dataUrl = await resizeImage(file, 900, 0.7);
    const r = await fetch(WHOOP_WORKER + "/vision/food", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-App-Token": k },
      body: JSON.stringify({ image: dataUrl, hint: (($("#visionHint") || {}).value || "").trim() })
    });
    const d = await r.json();
    if (!d || !d.ok) {
      const err = d && d.error;
      const why = err === "unauthorized" ? "App-Schlüssel stimmt nicht"
        : err === "groq_429" ? "Foto-KI gerade ausgelastet — in einer Minute nochmal"
        : err === "groq_401" ? "Foto-KI-Schlüssel auf dem Server ungültig"
        : /^groq_|^fetch_/.test(err || "") ? "Foto-KI-Dienst gerade nicht erreichbar (" + err + ")"
        : err === "unparsable" ? "KI-Antwort unlesbar — nochmal versuchen"
        : err === "no_key" ? "Foto-KI serverseitig nicht eingerichtet"
        : err || "unbekannt";
      box.innerHTML = `<div class="vision-msg err">Erkennung fehlgeschlagen (${esc(why)}). Bitte manuell eintragen.</div>`;
      return;
    }
    renderVision(d);
  } catch (err) {
    box.innerHTML = `<div class="vision-msg err">Server nicht erreichbar (offline?) — manuell eintragen.</div>`;
  }
});
function renderVision(d) {
  const box = $("#visionBox"); if (!box) return;
  if (!d.items || !d.items.length) {
    box.innerHTML = `<div class="vision-msg">Kein Essen erkannt${d.note ? " — " + esc(d.note) : ""}. Klareres Foto versuchen oder manuell eintragen.</div>`;
    return;
  }
  let html = `<div class="vision-head">🍽️ Erkannt — antippen zum Übernehmen (alles bleibt editierbar):</div>`;
  d.items.forEach((it, i) => {
    const conf = it.confidence != null ? Math.round(it.confidence * 100) : null;
    html += `<div class="vision-item" data-i="${i}">
      <div class="vinfo"><div class="nm">${esc(it.name)}</div>
      <div class="sub">${Math.round(it.grams)} g · ${Math.round(it.kcal)} kcal · ${round1(it.protein)}P / ${round1(it.carbs)}K / ${round1(it.fat)}F${conf != null ? ` · ${conf}% sicher` : ""}</div></div>
      <button class="vadd" data-i="${i}">+ Eintrag</button></div>`;
  });
  if (d.note) html += `<div class="vision-msg">ℹ️ ${esc(d.note)}</div>`;
  if (d.items.length > 1) html += `<button class="ghost" id="visionAddAll" style="width:100%;margin-top:8px">Alle ${d.items.length} direkt hinzufügen</button>`;
  box.innerHTML = html;
  box.querySelectorAll(".vadd").forEach(b => b.onclick = (ev) => { ev.stopPropagation(); fillFromVision(d.items[+b.dataset.i]); });
  box.querySelectorAll(".vision-item .vinfo").forEach(el => el.onclick = () => fillFromVision(d.items[+el.parentElement.dataset.i]));
  const all = $("#visionAddAll"); if (all) all.onclick = () => addVisionAll(d.items);
}
function fillFromVision(it) {
  per100 = it.grams > 0 ? { kcal: it.kcal / it.grams * 100, protein: it.protein / it.grams * 100, carbs: it.carbs / it.grams * 100, fat: it.fat / it.grams * 100 } : null;
  $("#fName").value = it.name;
  $("#fGrams").value = Math.round(it.grams) || 100;
  $("#fKcal").value = Math.round(it.kcal);
  $("#fProtein").value = round1(it.protein);
  $("#fCarbs").value = round1(it.carbs);
  $("#fFat").value = round1(it.fat);
  $("#per100hint").textContent = "Aus Foto geschätzt — Menge/Werte oben bei Bedarf anpassen, dann Hinzufügen.";
  $("#visionBox").innerHTML = "";
  $("#fName").scrollIntoView({ behavior: "smooth", block: "center" });
}
function addVisionAll(items) {
  const meal = $("#mealSelect").value || "snack";
  for (const it of items) {
    const e = { date: selDate, meal, name: it.name, grams: Math.round(it.grams) || 0, kcal: Math.round(it.kcal), protein: round1(it.protein), carbs: round1(it.carbs), fat: round1(it.fat) };
    state.entries.push({ id: uid(), ...e }); rememberFood(e);
  }
  persist(); showSheet("food", false); renderDiary();
}

// ---------- Wasser ----------
function waterMl() { return state.water[selDate] || 0; }
function renderWater() {
  if (!$("#waterCard")) return;
  const ml = waterMl(), tgt = state.profile.waterTarget || 2500;
  const val = $("#waterVal");
  if (val) val.textContent = (ml / 1000).toFixed(ml % 1000 ? 2 : 1) + " / " + (tgt / 1000).toFixed(1) + " L";
  const dots = $("#waterDots");
  if (dots) {
    const n = Math.max(1, Math.round(tgt / 250)), filled = Math.round(ml / 250);
    dots.innerHTML = "";
    for (let i = 0; i < n; i++) { const s = document.createElement("span"); s.className = "wdot" + (i < filled ? " on" : ""); s.textContent = "💧"; dots.appendChild(s); }
  }
}
on("#waterPlus", "click", () => { state.water[selDate] = waterMl() + 250; persist(); renderWater(); });
on("#waterMinus", "click", () => { state.water[selDate] = Math.max(0, waterMl() - 250); persist(); renderWater(); });

// ---------- Heute-Status (Körper-Kurzblick direkt im Tagebuch) ----------
function renderTodayBody() {
  const card = $("#todayBody"); if (!card) return;
  const b = state.bodyLog[selDate];
  if (!b || (b.recovery == null && b.sleepH == null && b.strain == null)) { card.style.display = "none"; return; }
  card.style.display = "block";
  const set = (id, v) => { const el = $("#" + id); if (el) el.textContent = v; };
  const amp = b.recovery == null ? "" : b.recovery >= 67 ? "🟢" : b.recovery >= 34 ? "🟡" : "🔴";
  set("tbRec", b.recovery != null ? amp + " " + b.recovery + "%" : "–");
  set("tbSleep", b.sleepH != null ? b.sleepH + " h" : "–");
  set("tbStrain", b.strain != null ? b.strain : "–");
  let reco;
  if (b.recovery != null && b.recovery < 34) reco = "Erholung niedrig — heute leichter trainieren, genug Eiweiß + früh schlafen.";
  else if (b.strain != null && b.strain >= 14) reco = "Hohe Belastung — auf genug kcal + Eiweiß für die Regeneration achten.";
  else if (b.recovery != null && b.recovery >= 67) reco = "Gut erholt — guter Tag für eine intensive Einheit.";
  else reco = "Solider Tag — Ziele im Blick behalten.";
  set("tbReco", reco);
}

// ---------- Wochen-Report (letzte 7 Tage) ----------
function renderWeekReport() {
  const grid = $("#weekGrid"); if (!grid) return;
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(dayOffset(today(), -i));
  const kcals = [], prots = [], recs = [], sleeps = [];
  const kT = state.profile.kcalTarget || 0, pT = proteinTarget();
  let proteinHits = 0, daysLogged = 0;
  for (const d of days) {
    const es = state.entries.filter(e => e.date === d);
    if (es.length) {
      daysLogged++;
      kcals.push(es.reduce((a, e) => a + e.kcal, 0));
      const p = es.reduce((a, e) => a + e.protein, 0); prots.push(p);
      if (pT && p >= pT * 0.9) proteinHits++;
    }
    const b = state.bodyLog[d];
    if (b) { if (b.recovery != null) recs.push(b.recovery); if (b.sleepH != null) sleeps.push(b.sleepH); }
  }
  const avg = a => a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null;
  const avg1 = a => a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length * 10) / 10 : null;
  const cell = (val, lbl, sub) => `<div class="bcard"><div class="bval">${val == null ? "–" : val}</div><div class="blbl">${lbl}</div><div class="bsub">${sub || ""}</div></div>`;
  grid.innerHTML =
    cell(avg(kcals), "Ø kcal", kT ? "Ziel " + kT : "") +
    cell(avg(prots) != null ? avg(prots) + " g" : null, "Ø Eiweiß", pT ? "Ziel " + pT + " g" : "") +
    cell(daysLogged + "/7", "Tage geloggt", "Essen") +
    cell(pT ? proteinHits + "/" + daysLogged : null, "Eiweiß-Ziel", "Tage erreicht") +
    cell(avg(recs) != null ? avg(recs) + "%" : null, "Ø Recovery", recs.length ? recs.length + " Tage" : "") +
    cell(avg1(sleeps) != null ? avg1(sleeps) + " h" : null, "Ø Schlaf", "");
}

// ---------- Supplement → Recovery am Folgetag ----------
function renderSuppInsights() {
  const box = $("#insights"); if (!box) return;
  const rows = [];
  for (const date of Object.keys(state.bodyLog)) {
    const b = state.bodyLog[date]; if (!b || b.recovery == null) continue;
    const prev = dayOffset(date, -1);
    const taken = state.suppLog[prev];
    // Nur Vortage zählen, an denen überhaupt etwas abgehakt wurde — ein nicht geloggter Tag
    // ist kein Beweis für „nicht genommen“.
    if (!taken || !Object.values(taken).some(Boolean)) continue;
    rows.push({ rec: b.recovery, taken });
  }
  if (rows.length < 5) return;
  const out = [];
  for (const s of state.supplements) {
    const withS = rows.filter(r => r.taken[s.id]), without = rows.filter(r => !r.taken[s.id]);
    if (withS.length >= 3 && without.length >= 3) {
      const avg = a => Math.round(a.reduce((x, r) => x + r.rec, 0) / a.length);
      const diff = avg(withS) - avg(without);
      if (Math.abs(diff) >= 4) out.push({ name: s.name, aw: avg(withS), ao: avg(without), diff });
    }
  }
  if (!out.length) return;
  out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  box.insertAdjacentHTML("beforeend", `<h3 class="bsec" style="margin-top:14px">Supplements → Recovery am Folgetag</h3>` +
    out.slice(0, 3).map(o => {
      const good = o.diff > 0;
      return `<div class="insight ${good ? "good" : "bad"}">${good ? "🟢" : "🔻"} <b>${esc(o.name)}</b>: Folgetag-Recovery Ø <b>${o.aw}%</b> vs <b>${o.ao}%</b> ohne <span class="idiff">(${o.diff > 0 ? "+" : ""}${o.diff})</span></div>`;
    }).join(""));
}

// ---------- Haushalts-Portionen als zusätzliche Schnell-Mengen-Chips ----------
(function addPortionChips() {
  const wrap = $("#amountChips"); if (!wrap) return;
  for (const p of PORTIONS) {
    const b = document.createElement("button");
    b.type = "button"; b.dataset.g = p.g; b.textContent = p.t;
    b.onclick = () => setGramsScaled(p.g);
    wrap.appendChild(b);
  }
})();

// ---------- boot ----------
function renderAll() { renderDiary(); renderSupps(); renderWeight(); renderPhotos(); fillGoals(); renderWater(); renderTodayBody(); renderFoodsList(); }
try {
  $("#datePicker").value = selDate;
  const vl = $("#verLine"); if (vl) vl.textContent = "FitTracker " + APP_VERSION;
  renderAll();
  maybeOnboard();
  // Whoop beim Start still im Hintergrund laden → „Heute · Körper“ im Tagebuch ist sofort aktuell
  if (whoopKey()) loadWhoop().then(renderTodayBody).catch(() => {});
  // Rückkehr vom Whoop-Login → direkt zum Körper-Tab
  if (location.search.indexOf("whoop=ok") >= 0) {
    switchTab("body");
    try { history.replaceState(null, "", location.pathname); } catch {}
  }
  // Deep-Links: ?tab=body|supps|… (bookmarkbar) + ?add=1 (PWA-Schnellaktion „Hinzufügen")
  try {
    const params = new URLSearchParams(location.search);
    const tab = params.get("tab");
    if (tab && $("#tab-" + tab)) switchTab(tab);
    if (params.get("add") === "1") {
      const h = new Date().getHours();
      openSheet(h < 11 ? "fruehstueck" : h < 15 ? "mittag" : h < 21 ? "abend" : "snack");
    }
  } catch {}
} catch (e) {
  console.error(e);
  showErr("Fehler beim Start: " + (e && e.message ? e.message : e) + " — bitte Screenshot schicken.");
}
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
