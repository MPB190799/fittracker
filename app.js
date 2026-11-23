// FitTracker — 100% client-side (GitHub Pages). Daten im Browser: localStorage + IndexedDB (Fotos).
// iOS-Safari-robust: kein structuredClone im Hot-Path, defensiver Boot, sichtbarer Fehler statt stiller Tod.
"use strict";
const APP_VERSION = "v22 · 2026-11-23";

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
// Ballaststoffe / Zucker je 100 g (Näherungswerte gängiger Nährwerttabellen) — [Ballaststoffe, Zucker]
const LOCAL_FS = {
  "Magerquark": [0, 4], "Skyr natur": [0, 4], "Haferflocken": [10, 1], "Banane": [2, 12], "Apfel": [2.4, 10], "Ei (Hühnerei)": [0, 1.1],
  "Hähnchenbrust": [0, 0], "Rinderhack (mager)": [0, 0], "Lachs": [0, 0], "Thunfisch (Dose, Wasser)": [0, 0], "Reis (gekocht)": [0.4, 0.1],
  "Kartoffeln (gekocht)": [1.8, 0.8], "Vollkornbrot": [7, 3], "Nudeln (gekocht)": [1.8, 0.6], "Milch 1,5%": [0, 4.9], "Gouda / Käse": [0, 0],
  "Olivenöl": [0, 0], "Mandeln": [12.5, 4.4], "Whey Protein (Pulver)": [0, 6], "Käsekuchen": [0.5, 20], "Reiswaffel": [4, 1], "Avocado": [6.7, 0.7],
  "Kreatin Monohydrat (Pulver)": [0, 0], "Vollkornnudeln (gekocht)": [4, 0.8], "Quinoa (gekocht)": [2.8, 0.9], "Linsen (gekocht)": [7.9, 1.8],
  "Kichererbsen (gekocht)": [7.6, 4.8], "Bohnen (Dose)": [5, 1], "Brokkoli": [2.6, 1.7], "Tomate": [1.2, 2.6], "Gurke": [0.5, 1.7], "Paprika": [2, 4],
  "Karotte": [2.8, 4.7], "Zwiebel": [1.7, 4.2], "Spinat": [2.2, 0.4], "Blattsalat": [1.3, 0.8], "Pute (Brust)": [0, 0], "Schweineschnitzel (natur)": [0, 0],
  "Hackfleisch gemischt": [0, 0], "Bratwurst": [0, 0.5], "Schinken (gekocht)": [0, 1], "Salami": [0, 1], "Forelle": [0, 0], "Garnelen": [0, 0],
  "Hüttenkäse (körnig)": [0, 2.7], "Joghurt (natur 3,5%)": [0, 4.7], "Griechischer Joghurt 10%": [0, 4], "Butter": [0, 0.7], "Frischkäse": [0, 3],
  "Mozzarella": [0, 1], "Brötchen (Weizen)": [3, 2], "Toastbrot": [3, 5], "Brezel": [2.5, 1], "Pizza Margherita": [2, 3.5], "Pommes frites": [3.8, 0.3],
  "Döner (mit allem)": [1.5, 2], "Müsli (gemischt)": [7, 18], "Cornflakes": [3, 9], "Honig": [0, 82], "Nutella": [3.4, 56], "Erdnussbutter": [6, 9],
  "Walnüsse": [6.7, 2.6], "Cashewkerne": [3.3, 6], "Dunkle Schokolade (85%)": [11, 14], "Orange": [2.4, 9], "Heidelbeeren": [2.4, 10],
  "Erdbeeren": [2, 4.9], "Weintrauben": [0.9, 16], "Bier (Pils)": [0, 0.3], "Rotwein": [0, 0.6], "Cola": [0, 10.6], "Orangensaft": [0.2, 8.4],
  "Proteinriegel": [8, 5]
};
for (const f of LOCAL_FOODS) { const fs = LOCAL_FS[f.name]; if (fs) { f.per100.fiber = fs[0]; f.per100.sugar = fs[1]; } }
const FIBER_TARGET = 30; // g/Tag, DGE-Richtwert (mindestens)

// Haushalts-Portionen für die Schnell-Mengen-Chips (g pro Einheit)
const PORTIONS = [
  { t: "Scheibe Brot", g: 45 }, { t: "Ei", g: 60 }, { t: "Handvoll", g: 30 },
  { t: "Glas (250 ml)", g: 250 }, { t: "Tasse", g: 200 }, { t: "EL", g: 15 }, { t: "TL", g: 5 }
];

const DEFAULT = {
  profile: { kcalTarget: 2200, proteinPerKg: 2.0, carbTarget: 220, fatTarget: 70, waterTarget: 2500, goalRate: 0,
    heightCm: null, birthYear: null, sex: "m", activity: 1.375, goalWeight: null, goalMode: "rec",
    whoopBonus: true, lastCheckin: null, proteinBasis: "current",
    neckCm: null, hipCm: null, bfManual: null, goalBf: null },
  phase: null, // { type: "soup"|"buchinger"|"if16", start, days, kcal, winStart, winEnd }
  entries: [], weights: [], photos: [], foods: [], templates: [], // templates: [{id,name,items:[{name,grams,kcal,protein,carbs,fat}]}]
  supplements: SEED_SUPPS.map(s => ({ id: uid(), ...s })),
  suppLog: {}, // { "2026-06-11": { suppId: true } }
  journal: {}, // { "2026-06-11": { flags:{}, mood:3, note:"" } }
  bodyLog: {}, // { "2026-06-11": { recovery, hrv, rhr, sleepH, sleepPerf, strain } }
  water: {}    // { "2026-06-11": ml }
};
const JFLAGS = [
  { k: "alkohol", t: "🍺 Alkohol" }, { k: "spaet", t: "🌙 spät gegessen" },
  { k: "koffein", t: "☕ Koffein spät" }, { k: "stress", t: "😰 Stress" },
  { k: "sport", t: "🏸 Sport/Cardio" }, { k: "kraft", t: "🏋️ Krafttraining" }, { k: "lesen", t: "📖 Gelesen" },
  { k: "frueh", t: "🛏️ Früh ins Bett" }, { k: "handy", t: "📱 Handy spät im Bett" }, { k: "gut", t: "😴 gut geschlafen" }
];
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
    templates: Array.isArray(db.templates) ? db.templates.filter(t => t && Array.isArray(t.items)) : [],
    journal: db.journal && typeof db.journal === "object" ? db.journal : {},
    bodyLog: db.bodyLog && typeof db.bodyLog === "object" ? db.bodyLog : {},
    water: db.water && typeof db.water === "object" ? db.water : {},
    phase: db.phase && typeof db.phase === "object" && db.phase.start ? db.phase : null
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
// Eiweiß pro kg: bei deutlichem Übergewicht auf das ZIELgewicht beziehen (gängige Praxis) —
// 2 g × 110 kg = 220 g wäre unnötig hoch. Ohne Zielgewicht wie bisher aufs aktuelle Gewicht.
// Worauf die g/kg Eiweiß gerechnet werden: aktuelles Gewicht (Standard, Marcos Wunsch), Zielgewicht oder fettfreie Masse
function proteinBaseKg() {
  const w = latestWeight(); if (!w) return null;
  const b = state.profile.proteinBasis || "current";
  if (b === "goal") { const g = goalW(); return g && g < w ? g : w; }
  if (b === "lean") { const c = bodyComp(); return c ? c.leanKg : w; }
  return w;
}
function proteinTarget() { const w = proteinBaseKg(); return w ? Math.round(w * (state.profile.proteinPerKg || 2)) : null; }
// Übergabe an Marcos Lebenskompass (Tagebuch-App): nur über den #-Teil der Adresse, der nie an einen Server geht.
// Hakt dort Gewohnheiten wie „Kcal-Ziel erreicht“ und genommene Supplements ab.
const LK_URL = "https://lebenskompass.pages.dev/";
function lebenskompassLink() {
  const es = dayEntries();
  const kcal = es.reduce((a, e) => a + (+e.kcal || 0), 0);
  const pinfo = phaseDayInfo(selDate);
  const kT = (pinfo && pinfo.kcal) || state.profile.kcalTarget || 0;
  const kcalOk = es.length > 0 && kT > 0 && kcal <= kT;
  const taken = suppTakenMap();
  const supp = state.supplements.filter(s => taken[s.id]).map(s => s.name);
  return LK_URL + "#fit=" + selDate + "&kcal=" + (kcalOk ? 1 : 0) + "&supp=" + encodeURIComponent(supp.join("|"));
}
function dayEntries() { return state.entries.filter(e => e.date === selDate); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function round1(n) { return Math.round(n * 10) / 10; }
function optNum(v) { if (v === "" || v == null) return null; const n = Number(String(v).replace(",", ".")); return isFinite(n) && n >= 0 ? round1(n) : null; }
function showErr(msg) { const b = $("#errbar"); if (b) { b.textContent = "⚠ " + msg; b.style.display = "block"; } }

// ---------- render diary ----------
function setRing(id, pct) {
  const el = $("#" + id); if (!el) return;
  const p = Math.min(1, Math.max(0, pct || 0));
  const C = 2 * Math.PI * Number(el.getAttribute("r") || 42); // Umfang je Ring (Kompass: außen kcal, innen Eiweiß)
  el.style.strokeDasharray = C;
  el.style.strokeDashoffset = C * (1 - p);
  el.classList.toggle("over", pct > 1.0001);
}
// Einmaliger Moment beim App-Start: die Zahl im Zifferblatt zählt hoch. Danach sofort-Updates.
let _counted = false;
function countUp(id, to) {
  const el = $("#" + id); if (!el) return;
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (_counted || reduce || !window.requestAnimationFrame) { el.textContent = to; _counted = true; return; }
  _counted = true;
  const t0 = performance.now(), dur = 900;
  const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(to * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function renderSummary() {
  const es = dayEntries();
  const sum = es.reduce((a, e) => ({ kcal: a.kcal + e.kcal, p: a.p + e.protein, c: a.c + e.carbs, f: a.f + e.fat,
    fi: a.fi + (e.fiber || 0), su: a.su + (e.sugar || 0), unk: a.unk + (e.fiber == null ? 1 : 0) }), { kcal: 0, p: 0, c: 0, f: 0, fi: 0, su: 0, unk: 0 });
  const pinfo = phaseDayInfo(selDate);
  const pT = pinfo && pinfo.fasting ? null : proteinTarget(); // an Fastentagen kein Eiweiß-Ziel
  const bonus = pinfo && pinfo.kcal ? 0 : whoopBonus(selDate);
  const kT = ((pinfo && pinfo.kcal) || state.profile.kcalTarget || 0) + bonus;
  const bl = $("#bonusLine"); if (bl) bl.innerHTML = bonus ? `inkl. <b>+${bonus}</b> Whoop-Bonus` : "";
  const set = (id, v) => { const el = $("#" + id); if (el) el.textContent = v; };
  // kcal-Ring (Mitte = übrig)
  const restK = Math.round(kT - sum.kcal);
  countUp("restKcal", restK);
  set("kcalSub", Math.round(sum.kcal) + " / " + kT);
  setRing("ringKcal", kT ? sum.kcal / kT : 0);
  const rk = $("#restKcal"); if (rk) rk.classList.toggle("neg", restK < 0);
  // Eiweiß-Ring
  const restP = pT != null ? Math.round(pT - sum.p) : null;
  set("restProt", restP != null ? restP : "–");
  set("protSub", pT != null ? Math.round(sum.p) + " / " + pT : (pinfo && pinfo.fasting ? "Fastentag" : "Gewicht?"));
  setRing("ringProt", pT ? sum.p / pT : 0);
  const rp = $("#restProt"); if (rp) rp.classList.toggle("neg", restP != null && restP < 0);
  // KH/Fett-Balken
  set("cVal", Math.round(sum.c)); set("cTgt", "/ " + state.profile.carbTarget);
  set("fVal", Math.round(sum.f)); set("fTgt", "/ " + state.profile.fatTarget);
  const bar = (id, val, tgt) => { const el = $("#" + id); if (el) el.style.width = (tgt ? Math.min(100, (val / tgt) * 100) : 0) + "%"; };
  bar("cBar", sum.c, state.profile.carbTarget);
  bar("fBar", sum.f, state.profile.fatTarget);
  // Ballaststoffe (DGE ≥ 30 g) und Zucker (WHO: freie Zucker < 10 % der kcal — hier Gesamtzucker als Orientierung)
  const sugarMax = Math.round(kT * 0.10 / 4);
  set("fiVal", Math.round(sum.fi)); set("fiTgt", "/ " + FIBER_TARGET + (sum.unk ? " · " + sum.unk + "× ohne Angabe" : ""));
  set("suVal", Math.round(sum.su)); set("suTgt", "/ max " + sugarMax);
  bar("fiBar", sum.fi, FIBER_TARGET); bar("suBar", sum.su, sugarMax);
  const fb = $("#fiBar"); if (fb) fb.classList.toggle("done", sum.fi >= FIBER_TARGET);
  const sb = $("#suBar"); if (sb) sb.classList.toggle("over", sum.su > sugarMax);
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
    if (items.length) {
      const tb = document.createElement("button");
      tb.className = "add tplsave"; tb.textContent = "★ Als Vorlage speichern";
      tb.onclick = () => saveTemplate(key, items);
      div.appendChild(tb);
    }
    card.appendChild(div);
  }
  const rep = document.createElement("button");
  rep.className = "ghost"; rep.style.cssText = "width:100%;margin-top:8px";
  rep.textContent = "Gestern wiederholen";
  rep.onclick = copyYesterday;
  card.appendChild(rep);
}
function copyYesterday() {
  const prev = dayOffset(selDate, -1);
  const items = state.entries.filter(e => e.date === prev);
  if (!items.length) return alert("Für gestern gibt es keine Einträge zum Übernehmen.");
  if (!confirm(`${items.length} Einträge von gestern (${prev}) auf heute übernehmen?`)) return;
  for (const e of items) state.entries.push({ id: uid(), date: selDate, meal: e.meal, ...tplItem(e) });
  persist(); renderDiary();
}
// ---------- Mahlzeiten-Vorlagen („mein Frühstück" mit 1 Tipp) ----------
const tplItem = (e) => ({ name: e.name, grams: e.grams, kcal: e.kcal, protein: e.protein, carbs: e.carbs, fat: e.fat, fiber: e.fiber ?? null, sugar: e.sugar ?? null });
function saveTemplate(meal, items) {
  const name = (prompt("Name der Vorlage:", "Mein " + MEALS[meal]) || "").trim();
  if (!name) return;
  const ex = state.templates.find(t => t.name.toLowerCase() === name.toLowerCase());
  if (ex && !confirm(`Vorlage „${name}" gibt es schon — überschreiben?`)) return;
  if (ex) ex.items = items.map(tplItem);
  else state.templates.push({ id: uid(), name, items: items.map(tplItem) });
  persist(); renderTemplatesList();
  alert(`Vorlage „${name}" gespeichert (${items.length} Lebensmittel). Beim Hinzufügen oben unter „Vorlagen" antippen.`);
}
function tplKcal(t) { return Math.round(t.items.reduce((a, i) => a + (i.kcal || 0), 0)); }
function applyTemplate(t) {
  const meal = $("#mealSelect").value || "snack";
  for (const it of t.items) state.entries.push({ id: uid(), date: selDate, meal, ...tplItem(it) });
  persist(); showSheet("food", false); renderDiary();
}
function renderTplChips() {
  const wrap = $("#tplWrap"), box = $("#tplChips"); if (!box || !wrap) return;
  if (!state.templates.length || $("#editId").value) { wrap.style.display = "none"; return; }
  wrap.style.display = "block"; box.innerHTML = "";
  for (const t of state.templates) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip tpl";
    b.textContent = "★ " + t.name + " · " + tplKcal(t) + " kcal";
    b.onclick = () => applyTemplate(t);
    box.appendChild(b);
  }
}
function renderTemplatesList() {
  const box = $("#tplList"); if (!box) return;
  if (!state.templates.length) { box.innerHTML = `<div class="empty">Noch keine Vorlagen — im Tagebuch unter einer Mahlzeit „★ Als Vorlage speichern" tippen.</div>`; return; }
  box.innerHTML = "";
  for (const t of state.templates) {
    const row = document.createElement("div");
    row.className = "entry";
    row.innerHTML = `<div class="info"><div class="nm">★ ${esc(t.name)}</div>
      <div class="sub">${t.items.length} Lebensmittel · ${tplKcal(t)} kcal · ${esc(t.items.map(i => i.name).join(", ").slice(0, 80))}</div></div>
      <button class="x" title="löschen">✕</button>`;
    row.querySelector(".x").onclick = () => {
      if (confirm(`Vorlage „${t.name}" löschen?`)) { state.templates = state.templates.filter(x => x.id !== t.id); persist(); renderTemplatesList(); }
    };
    box.appendChild(row);
  }
}

// ---------- Körper & Ziel: Startwert per Formel (Mifflin-St Jeor) ----------
// Grundumsatz = 10×kg + 6,25×cm − 5×Alter + 5 (Mann) bzw. −161 (Frau); × Aktivitätsfaktor = Verbrauch.
// Defizit/Überschuss = Tempo (kg/Woche) × 7700 / 7. Nie unter den Grundumsatz und nie unter 1500/1200 kcal.

// ---------- Whoop-Bonus: Mehrverbrauch an aktiven Tagen ----------
// Liegt Whoops Tagesverbrauch über deinem geplanten Verbrauch, darfst du die Hälfte davon zusätzlich essen.
// Nur die Hälfte, weil Tracker den Verbrauch eher überschätzen — so bleibt der Cut sicher.
function whoopBonus(date) {
  if (!state.profile.whoopBonus) return 0;
  const b = state.bodyLog[date]; if (!b || !(b.kcalBurn > 0)) return 0;
  const t = tdeeRef(); if (!t) return 0;
  const extra = b.kcalBurn - t;
  return extra > 150 ? Math.round(extra * 0.5 / 10) * 10 : 0;
}

// ---------- Krafttraining (über Journal-Flags) ----------
function trainCount(flag, n) { let c = 0; for (let i = 0; i < n; i++) { const j = state.journal[dayOffset(today(), -i)]; if (j && j.flags && j.flags[flag]) c++; } return c; }
function renderTrain() {
  const box = $("#trainChips"); if (!box) return;
  const j = jToday();
  box.innerHTML = "";
  for (const f of JFLAGS.filter(x => x.k === "kraft" || x.k === "sport")) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip" + (j.flags && j.flags[f.k] ? " on" : "");
    b.textContent = f.t;
    b.onclick = () => { const w = jTodayW(); w.flags[f.k] = !w.flags[f.k]; persist(); renderTrain(); renderJournal(); };
    box.appendChild(b);
  }
  const k7 = trainCount("kraft", 7);
  const wk = $("#trainWeek"); if (wk) wk.textContent = k7 + "× Kraft / 7 Tage";
  const h = $("#trainHint");
  if (h) h.textContent = planDir() < 0 && k7 === 0 ? "Diese Woche noch kein Krafttraining — 2–3× pro Woche schützt im Cut deine Muskeln, dann schmilzt vor allem Fett."
    : planDir() < 0 && k7 < 2 ? "Noch eine Krafteinheit diese Woche wäre ideal für den Muskelerhalt." : "";
}

// ---------- Backup (Teilen → OneDrive) + wöchentliche Erinnerung ----------
function lastBackup() { try { return localStorage.getItem("fittracker:lastBackup") || ""; } catch { return ""; } }
async function doBackup() {
  const photos = {};
  for (const p of state.photos) { const url = await idbGet(p.id); if (url) photos[p.id] = url; }
  const name = `mb-fit-backup-${today()}.json`;
  const blob = new Blob([JSON.stringify({ v: 1, state, photos }, null, 2)], { type: "application/json" });
  let ok = false;
  try {
    const file = new File([blob], name, { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "MB FIT Backup" }); ok = true; }
  } catch (e) { if (e && e.name === "AbortError") return; } // abgebrochen → nicht als gesichert merken
  if (!ok) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); ok = true; }
  try { localStorage.setItem("fittracker:lastBackup", today()); } catch {}
  renderNudges(); renderBackupInfo();
}
function renderBackupInfo() { const el = $("#lastBackupTxt"); if (el) el.textContent = lastBackup() ? "Letztes Backup: " + dateLabel(lastBackup()) + "." : "Noch kein Backup."; }

// ---------- Wochen-Check: neues Kalorienziel vorschlagen ----------
function checkinSuggestion() {
  const P = state.profile;
  if (phaseActiveOn(today())) return null;
  if (P.lastCheckin && P.lastCheckin > dayOffset(today(), -7)) return null;
  const a = adaptiveEstimate(), p = bodyPlan();
  const kcal = a.ok ? a.target : p.ok ? p.kcal : null; if (!kcal) return null;
  if (Math.abs(kcal - P.kcalTarget) < 50) return null;
  return { kcal, why: a.ok ? `aus deinem echten Verbrauch der letzten 4 Wochen (${a.tdee} kcal)` : "aus deinem aktuellen Gewicht" };
}

// ---------- Hinweise oben im Tagebuch ----------
function renderNudges() {
  const box = $("#nudges"); if (!box) return;
  if (selDate !== today()) { box.innerHTML = ""; return; }
  let html = "";
  const c = checkinSuggestion();
  if (c) html += `<div class="card nudge"><div class="nudge-t">Wochen-Check</div>
    <div class="nudge-s">Neues Tagesziel <b>${c.kcal} kcal</b> statt ${state.profile.kcalTarget} — ${c.why}.</div>
    <div class="row nudge-b"><button class="primary" id="ciApply">Übernehmen</button><button class="ghost" id="ciLater">Später</button></div></div>`;
  const lb = lastBackup(), hasData = state.entries.length + state.weights.length > 0;
  if (hasData && (!lb || lb <= dayOffset(today(), -7))) html += `<div class="card nudge"><div class="nudge-t">Backup fällig</div>
    <div class="nudge-s">${lb ? "Letztes Backup: " + dateLabel(lb) : "Du hast noch kein Backup"} — sichere deine Daten in OneDrive.</div>
    <div class="row nudge-b"><button class="primary" id="bkNow">Jetzt sichern</button></div></div>`;
  box.innerHTML = html;
  const ap = $("#ciApply"); if (ap) ap.onclick = () => { state.profile.kcalTarget = c.kcal; state.profile.lastCheckin = today(); persist(); fillGoals(); renderDiary(); renderNudges(); };
  const lt = $("#ciLater"); if (lt) lt.onclick = () => { state.profile.lastCheckin = today(); persist(); renderNudges(); };
  const bk = $("#bkNow"); if (bk) bk.onclick = doBackup;
}

// ---------- Fasten & Sonderphasen ----------
// Suppenwoche: festes kcal-Ziel. Heilfasten (Buchinger): 1 Entlastungstag ≤ 1000 kcal, Fastentage
// 250–500 kcal (Brühe/Saft/Tee), 2 Aufbautage. Intervallfasten 16:8: Essensfenster, kcal wie Plan.
const PHASES = {
  soup: { t: "Suppenwoche", days: 7, info: "Nur Suppen, kalorienarm. Tipp: Suppen mit Eiweiß (Linsen, Bohnen, Hähnchen) machen satt und schützen die Muskeln — dann schmilzt vor allem Fett." },
  buchinger: { t: "Heilfasten", days: 5, info: "Fastentage mit Gemüsebrühe, verdünntem Saft und Tee (250–500 kcal), dazu viel trinken (2,5–3 Liter). Davor ein Entlastungstag, danach zwei Aufbautage — die App plant sie automatisch ein. Krankenkassen raten, Heilfasten vorher mit dem Arzt abzusprechen. Hinweis: Die Waage fällt beim Fasten schneller als das Fett — ein Teil ist Wasser und kommt zurück." },
  if16: { t: "Intervallfasten 16:8", days: 30, info: "16 Stunden fasten, 8 Stunden essen. Die kcal bleiben wie in deinem Plan — die App zeigt dir im Tagebuch, ob dein Essensfenster gerade offen ist." }
};
function phaseLen(ph) { return ph.type === "buchinger" ? ph.days + 3 : ph.days; }
function phaseEnd(ph) { return dayOffset(ph.start, phaseLen(ph) - 1); }
function phaseActiveOn(date) { const ph = state.phase; return ph && date >= ph.start && date <= phaseEnd(ph) ? ph : null; }
function phaseDayInfo(date) { // → { ph, n, len, kcal|null, fasting, label }
  const ph = phaseActiveOn(date); if (!ph) return null;
  const [a, b] = [ph.start, date].map(x => { const [y, m, d] = x.split("-").map(Number); return Date.UTC(y, m - 1, d); });
  const n = Math.round((b - a) / 864e5) + 1, len = phaseLen(ph);
  if (ph.type === "soup") return { ph, n, len, kcal: ph.kcal, fasting: false, label: `Suppenwoche · Tag ${n} von ${len}` };
  if (ph.type === "if16") return { ph, n, len, kcal: null, fasting: false, label: `Intervallfasten 16:8 · Tag ${n} von ${len}` };
  if (n === 1) return { ph, n, len, kcal: 1000, fasting: false, label: "Heilfasten · Entlastungstag (leicht essen, max. 1000 kcal)" };
  if (n <= ph.days + 1) return { ph, n, len, kcal: ph.kcal || 500, fasting: true, label: `Heilfasten · Fastentag ${n - 1} von ${ph.days}` };
  return { ph, n, len, kcal: n === len ? 1500 : 1000, fasting: false, label: `Heilfasten · Aufbautag ${n - ph.days - 1} von 2 (langsam wieder essen)` };
}
function ifStatus(ph) {
  const now = new Date(), h = now.getHours() + now.getMinutes() / 60, a = Number(ph.winStart), b = Number(ph.winEnd);
  const open = a < b ? h >= a && h < b : h >= a || h < b;
  const until = open ? b : a;
  let diff = until - h; if (diff < 0) diff += 24;
  const hh = Math.floor(diff), mm = Math.round((diff - hh) * 60);
  return { open, txt: open ? `Essensfenster offen — noch ${hh} h ${mm} min (bis ${b}:00)` : `Fastenzeit — noch ${hh} h ${mm} min bis ${a}:00` };
}
function renderPhaseBanner() {
  const el = $("#phaseBanner"); if (!el) return;
  const info = phaseDayInfo(selDate);
  if (!info) { el.style.display = "none"; return; }
  el.style.display = "block";
  let sub = info.kcal ? `Heute: max. <b>${info.kcal} kcal</b>` : "";
  if (info.ph.type === "if16" && selDate === today()) { const st = ifStatus(info.ph); sub = `<span style="color:${st.open ? "var(--green)" : "var(--gold)"}">${st.txt}</span>`; }
  if (info.fasting) sub += " · nur Brühe, Saft, Tee — viel trinken";
  el.innerHTML = `<div class="phase-t">${esc(info.label)}</div><div class="phase-s">${sub}</div>
    <div class="phase-bar"><i style="width:${Math.round(info.n / info.len * 100)}%"></i></div>`;
}
function renderPhaseCard() {
  const act = $("#phaseActive"), form = $("#phaseForm"); if (!act || !form) return;
  const ph = state.phase;
  if (ph && phaseEnd(ph) >= today()) {
    form.style.display = "none";
    act.innerHTML = `<p class="hint" style="margin-top:0"><b>${PHASES[ph.type].t}</b> läuft vom ${dateLabel(ph.start)} bis ${dateLabel(phaseEnd(ph))}${ph.type === "if16" ? ` · Essen ${ph.winStart}–${ph.winEnd} Uhr` : ""}.</p>
      <button class="ghost" id="phStop" style="width:100%">Phase beenden</button>`;
    $("#phStop").onclick = () => { if (confirm("Phase wirklich beenden?")) { state.phase = null; persist(); renderPhaseCard(); renderPhaseBanner(); renderSummary(); } };
    return;
  }
  act.innerHTML = ""; form.style.display = "block";
  const t = $("#phType").value || "soup";
  if (!$("#phStart").value) $("#phStart").value = today();
  syncPhaseForm(t, false);
}
function syncPhaseForm(t, reset) {
  const P = PHASES[t];
  if (reset || !$("#phDays").value) $("#phDays").value = P.days;
  const floor = state.profile.sex === "w" ? 1200 : 1500;
  if (reset || !$("#phKcal").value) $("#phKcal").value = t === "buchinger" ? 500 : floor;
  $("#phDaysLbl").textContent = t === "buchinger" ? "Fastentage" : "Dauer (Tage)";
  $("#phKcalRow").style.display = t === "if16" ? "none" : "flex";
  $("#phWinRow").style.display = t === "if16" ? "flex" : "none";
  if (!$("#phWinStart").value) $("#phWinStart").value = 12;
  if (!$("#phWinEnd").value) $("#phWinEnd").value = 20;
  $("#phInfo").textContent = P.info;
}
on("#phType", "change", (e) => syncPhaseForm(e.target.value, true));
on("#phStartBtn", "click", () => {
  const type = $("#phType").value, days = Math.round(Number($("#phDays").value));
  const kcal = Math.round(Number($("#phKcal").value)) || null;
  if (!(days >= 1 && days <= 60)) return alert("Dauer zwischen 1 und 60 Tagen eingeben.");
  if (type === "buchinger" && days > 7 && !confirm("Mehr als 7 Fastentage solltest du nur mit ärztlicher Begleitung machen. Trotzdem planen?")) return;
  if (type === "buchinger" && kcal && (kcal < 200 || kcal > 600)) return alert("Beim Heilfasten sind 250–500 kcal pro Fastentag üblich.");
  state.phase = { type, start: $("#phStart").value || today(), days, kcal: type === "if16" ? null : kcal,
    winStart: Math.round(Number($("#phWinStart").value)) || 12, winEnd: Math.round(Number($("#phWinEnd").value)) || 20 };
  persist(); renderPhaseCard(); renderPhaseBanner(); renderSummary();
});
setInterval(() => { if (state.phase && state.phase.type === "if16") renderPhaseBanner(); }, 60000);

// ---------- Körperfett (US-Navy-Methode) ----------
// Mann: 495 / (1,0324 − 0,19077·log10(Bauch − Hals) + 0,15456·log10(Größe)) − 450
// Frau: 495 / (1,29579 − 0,35004·log10(Bauch + Hüfte − Hals) + 0,22100·log10(Größe)) − 450   (alles in cm)
function navyBf(waist, neck, hip, height, sex) {
  if (!(waist > 0 && neck > 0 && height > 0)) return null;
  const L = Math.log10;
  let v;
  if (sex === "w") { if (!(hip > 0) || waist + hip - neck <= 0) return null; v = 495 / (1.29579 - 0.35004 * L(waist + hip - neck) + 0.221 * L(height)) - 450; }
  else { if (waist - neck <= 0) return null; v = 495 / (1.0324 - 0.19077 * L(waist - neck) + 0.15456 * L(height)) - 450; }
  return v > 2 && v < 70 ? Math.round(v * 10) / 10 : null;
}
function latestWaist() { for (let i = state.weights.length - 1; i >= 0; i--) if (state.weights[i].waistCm) return state.weights[i]; return null; }
function bodyComp() {
  const w = latestWeight(); if (!w) return null;
  const P = state.profile, lw = latestWaist();
  let bf = lw ? navyBf(lw.waistCm, Number(P.neckCm), Number(P.hipCm), Number(P.heightCm), P.sex) : null, src = "Maßband";
  if (bf == null && Number(P.bfManual) > 0) { bf = Number(P.bfManual); src = "Waage"; }
  if (bf == null) return null;
  const fatKg = Math.round(w * bf / 100 * 10) / 10;
  return { bf, fatKg, leanKg: Math.round((w - fatKg) * 10) / 10, src, waist: lw && lw.waistCm };
}
// Zielgewicht: aus Körperfett-Ziel (fettfreie Masse bleibt gleich), sonst das eingetragene Zielgewicht
function goalW() {
  const P = state.profile, c = bodyComp(), gb = Number(P.goalBf);
  if (c && gb > 2 && gb < 60) return Math.round(c.leanKg / (1 - gb / 100) * 10) / 10;
  return Number(P.goalWeight) || null;
}
const fmtKg = (n) => (Math.round(n * 10) / 10).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Stufen in % Körpergewicht pro Woche (Sporternährung: 0,5–1 %/Woche; NHS/NICE: max. ~1 kg/Woche)
const CUT_MODES = { light: { t: "Leichter Cut", pct: 0.005 }, rec: { t: "Empfohlen", pct: 0.0075 }, hard: { t: "Krasser Cut", pct: 0.01 } };
const BULK_MODES = { light: { t: "Leichter Aufbau", pct: 0.001 }, rec: { t: "Empfohlen", pct: 0.0025 }, hard: { t: "Zügiger Aufbau", pct: 0.005 } };
function planDir() { // −1 abnehmen, +1 aufbauen, 0 halten
  const w = latestWeight(), gw = goalW() || 0;
  if (!w || !gw || Math.abs(gw - w) < 0.5) return 0;
  return gw < w ? -1 : 1;
}
function planRate(mode) { // kg/Woche (negativ = abnehmen)
  const w = latestWeight(), dir = planDir(); if (!dir) return 0;
  const m = (dir < 0 ? CUT_MODES : BULK_MODES)[mode || state.profile.goalMode || "rec"] || CUT_MODES.rec;
  let kg = m.pct * w; if (dir < 0) kg = Math.min(kg, 1.0);
  return Math.round(dir * kg * 100) / 100;
}
function bodyPlan(modeOverride) {
  const P = state.profile, w = latestWeight();
  const h = Number(P.heightCm), by = Number(P.birthYear), act = Number(P.activity) || 1.375;
  const need = [];
  if (!w) need.push("dein aktuelles Gewicht (Tab Gewicht)");
  if (!(h > 120 && h < 230)) need.push("deine Größe");
  const age = by > 1920 ? new Date().getFullYear() - by : null;
  if (!(age >= 14 && age <= 100)) need.push("dein Geburtsjahr");
  if (need.length) return { ok: false, need };
  const bmr = Math.round(10 * w + 6.25 * h - 5 * age + (P.sex === "w" ? -161 : 5));
  const tdee = Math.round(bmr * act);
  const gw = goalW();
  const rate = planRate(modeOverride);
  const warn = "";
  // Untergrenze: 1500 (Mann) / 1200 (Frau) kcal — übliche Grenze für Diäten ohne ärztliche Begleitung
  const floor = P.sex === "w" ? 1200 : 1500;
  let kcal = Math.round((tdee + rate * KCAL_PER_KG / 7) / 10) * 10;
  let floored = false;
  if (kcal < floor) { kcal = floor; floored = true; }
  const belowBmr = kcal < bmr;
  const realRate = Math.round((kcal - tdee) * 7 / KCAL_PER_KG * 100) / 100; // kg/Woche nach Boden-Korrektur
  let eta = null;
  if (gw && realRate && Math.sign(gw - w) === Math.sign(realRate)) {
    const weeks = Math.abs(gw - w) / Math.abs(realRate);
    const d = new Date(); d.setDate(d.getDate() + Math.round(weeks * 7));
    eta = { weeks: Math.round(weeks), label: MON[d.getMonth()] + " " + d.getFullYear() };
  }
  const protBase = proteinBaseKg() || w;
  const protein = Math.round(protBase * (P.proteinPerKg || 2));
  const fat = Math.round(Math.max(0.8 * protBase, kcal * 0.25 / 9));
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const bmi = Math.round(w / ((h / 100) ** 2) * 10) / 10;
  const comp = bodyComp(), gb = Number(P.goalBf) || null;
  const fatToLose = comp && gw && gw < w ? Math.round((w - gw) * 10) / 10 : null; // bei KF-Ziel = reines Fett (fettfreie Masse bleibt)
  const deficit = tdee - kcal; // kcal/Tag
  return { ok: true, w, age, bmr, tdee, kcal, floored, belowBmr, realRate, eta, protein, fat, carbs, gw, warn, bmi, comp, gb, fatToLose, deficit };
}
function fillPlanInputs() {
  const P = state.profile, set = (id, v) => { const el = $("#" + id); if (el && document.activeElement !== el) el.value = v == null ? "" : v; };
  set("pHeight", P.heightCm); set("pBirth", P.birthYear); set("pSex", P.sex || "m");
  set("pAct", String(P.activity || 1.375)); set("pGoalW", P.goalWeight);
  { const wb = $("#pWhoopBonus"); if (wb) wb.checked = P.whoopBonus !== false; }
  set("pNeck", P.neckCm); set("pHip", P.hipCm); set("pGoalBf", P.goalBf); set("pBfManual", P.bfManual);
  const hr = $("#hipRow"); if (hr) hr.style.display = P.sex === "w" ? "flex" : "none";
  const gwEl = $("#pGoalW"); if (gwEl) { const usesBf = Number(P.goalBf) > 0 && bodyComp(); gwEl.disabled = !!usesBf; gwEl.placeholder = usesBf ? "≈ " + fmtKg(goalW()) + " kg (aus Körperfett-Ziel)" : "nur falls kein Körperfett-Ziel"; }
  const bh = $("#bfHint"); if (bh) { const c = bodyComp(); bh.innerHTML = c ? `Körperfett jetzt ≈ <b>${c.bf.toLocaleString("de-DE")} %</b> (${c.src === "Maßband" ? "aus Bauch " + c.waist + " cm und Hals" : "laut Waage"}). Bauch misst du im Tab Gewicht mit — Höhe Bauchnabel, morgens, entspannt.` : "Körperfett rechnet die App aus Bauch- und Halsumfang (US-Navy-Methode). Den Bauch misst du im Tab Gewicht mit — Höhe Bauchnabel, morgens, entspannt."; }
}
function renderModes() {
  const box = $("#planModes"), lbl = $("#modeLbl"); if (!box) return;
  const dir = planDir();
  if (!dir) { box._html = ""; box.innerHTML = `<p class="hint" style="margin:0">Trag ein Körperfett-Ziel (oder Zielgewicht) ein — dann kannst du wählen, wie stark du cutten willst. Ohne Ziel rechnet die App mit „Gewicht halten“.</p>`; if (lbl) lbl.textContent = "Wie stark?"; return; }
  if (lbl) lbl.textContent = dir < 0 ? "Wie stark willst du cutten?" : "Wie schnell willst du aufbauen?";
  const modes = dir < 0 ? CUT_MODES : BULK_MODES, cur = state.profile.goalMode || "rec";
  const html = ["light", "rec", "hard"].map(k => {
    const p = bodyPlan(k), r = planRate(k);
    const kc = p.ok ? p.kcal + " kcal" : "–";
    return `<button type="button" class="mode${k === cur ? " on" : ""}${k === "rec" ? " rec" : ""}" data-mode="${k}">
      <span class="mode-t">${modes[k].t}</span><span class="mode-k">${kc}</span><span class="mode-r">${r > 0 ? "+" + Math.abs(r).toLocaleString("de-DE") + " kg/Woche" : "−" + Math.abs(r).toLocaleString("de-DE") + " kg Fett/Woche"}</span></button>`;
  }).join("");
  if (box._html !== html) { box.innerHTML = html; box._html = html; } // kein Neuzeichnen beim Antippen (siehe renderPlan)
  box.querySelectorAll(".mode").forEach(b => b.onclick = () => { state.profile.goalMode = b.dataset.mode; persist(); renderPlan(); renderAdaptive(); });
}
function renderPlan() {
  const box = $("#planBox"); if (!box) return;
  fillPlanInputs();
  renderModes();
  const r = bodyPlan();
  if (!r.ok) { box.innerHTML = `<p class="hint">Für deinen Vorschlag fehlt noch: <b>${r.need.join(", ")}</b>.</p>`; box._html = ""; return; }
  const fmt = (n) => Math.round(n).toLocaleString("de-DE");
  const fatG = Math.round(r.deficit / 7.7); // 1 kg Körperfett ≈ 7700 kcal → 1 g ≈ 7,7 kcal
  const rateTxt = r.realRate === 0 ? "Gewicht halten" : r.realRate > 0 ? "+" + Math.abs(r.realRate).toLocaleString("de-DE") + " kg pro Woche"
    : `≈ ${Math.abs(r.realRate).toLocaleString("de-DE")} kg Fett pro Woche · ${fmt(r.deficit)} kcal Defizit ≈ ${fatG} g Fett pro Tag`;
  const compTxt = r.comp ? `<div class="comp-line"><span>Körperfett jetzt <b>${r.comp.bf.toLocaleString("de-DE")} %</b> · ${fmtKg(r.comp.fatKg)} kg Fett</span>${r.gb && r.fatToLose ? `<span>Ziel ${r.gb.toLocaleString("de-DE")} % → noch <b>${fmtKg(r.fatToLose)} kg Fett</b> weg (bei ≈ ${fmtKg(r.gw)} kg)</span>` : ""}</div>` : "";
  const html = `
    <div class="plan-hero"><span class="plan-num">${r.kcal}</span><span class="plan-unit">kcal pro Tag darfst du essen</span><span class="plan-rate">${rateTxt}</span>${r.eta ? `<span class="plan-rate">Ziel erreicht ca. ${r.eta.label} (${r.eta.weeks} Wochen)</span>` : ""}</div>
    ${compTxt}
    <div class="body-grid">
      <div class="bcard"><div class="bval">${r.protein}</div><div class="blbl">Eiweiß g</div></div>
      <div class="bcard"><div class="bval">${r.carbs}</div><div class="blbl">Kohlenh. g</div></div>
      <div class="bcard"><div class="bval">${r.fat}</div><div class="blbl">Fett g</div></div>
    </div>
    <p class="hint">Grundumsatz ${fmt(r.bmr)} kcal · Verbrauch mit Alltag ${fmt(r.tdee)} kcal · BMI ${r.bmi.toLocaleString("de-DE")} · ${r.w.toLocaleString("de-DE")} kg, ${r.age} Jahre.${r.floored ? ` <b>Auf die Untergrenze von ${r.kcal} kcal angehoben — schneller geht es nicht vernünftig.</b>` : r.belowBmr ? " Du isst damit unter deinem Grundumsatz — für einen Cut okay, achte auf genug Eiweiß und Krafttraining, damit vor allem Fett schmilzt." : ""}</p>
    ${r.warn ? `<p class="hint" style="color:var(--red)">${r.warn}</p>` : ""}
    <button class="primary" id="planApply">Als meine Tagesziele übernehmen</button>`;
  // Nur neu zeichnen, wenn sich wirklich etwas geändert hat — sonst geht ein Tipp auf „Übernehmen“
  // verloren, wenn gleichzeitig das Eingabefeld seinen change-Event feuert (Blur beim Antippen).
  if (box._html !== html) { box.innerHTML = html; box._html = html; }
  $("#planApply").onclick = () => {
    Object.assign(state.profile, { kcalTarget: r.kcal, carbTarget: r.carbs, fatTarget: r.fat });
    persist(); fillGoals(); renderDiary(); renderAdaptive();
    const b = $("#planApply"); if (b) { b.textContent = "Übernommen ✓"; setTimeout(() => { box._html = ""; renderPlan(); }, 1400); }
  };
}
function savePlanField(key, raw, num) {
  const v = num ? (raw === "" ? null : Number(String(raw).replace(",", "."))) : raw;
  state.profile[key] = v; persist(); renderPlan(); renderAdaptive(); fillGoals(); renderSummary(); drawWeightChart(); renderGoalProgress();
}
on("#pHeight", "change", (e) => savePlanField("heightCm", e.target.value, true));
on("#pBirth", "change", (e) => savePlanField("birthYear", e.target.value, true));
on("#pSex", "change", (e) => savePlanField("sex", e.target.value, false));
on("#pAct", "change", (e) => savePlanField("activity", e.target.value, true));
on("#pGoalW", "change", (e) => savePlanField("goalWeight", e.target.value, true));
on("#pWhoopBonus", "change", (e) => { state.profile.whoopBonus = e.target.checked; persist(); renderSummary(); });
on("#pNeck", "change", (e) => savePlanField("neckCm", e.target.value, true));
on("#pHip", "change", (e) => savePlanField("hipCm", e.target.value, true));
on("#pGoalBf", "change", (e) => savePlanField("goalBf", e.target.value, true));
on("#pBfManual", "change", (e) => savePlanField("bfManual", e.target.value, true));
function renderComp() {
  const box = $("#compBox"); if (!box) return;
  const c = bodyComp();
  if (!c) { box.innerHTML = `<p class="hint">Miss beim Wiegen auch den Bauch und trag im Tab Ziele deinen Halsumfang ein — dann siehst du hier dein Körperfett und wie viel davon schon weg ist.</p>`; return; }
  // Fettverlust seit der ersten Messung mit Bauchumfang
  const first = state.weights.find(x => x.waistCm), P = state.profile;
  let lost = "";
  if (first && first.id !== latestWaist().id) {
    const bf0 = navyBf(first.waistCm, Number(P.neckCm), Number(P.hipCm), Number(P.heightCm), P.sex);
    if (bf0 != null) { const d = Math.round((first.kg * bf0 / 100 - c.fatKg) * 10) / 10; lost = `<div class="bcard"><div class="bval" style="color:${d >= 0 ? "var(--green)" : "var(--red)"}">${d >= 0 ? "−" : "+"}${fmtKg(Math.abs(d))}</div><div class="blbl">kg Fett seit ${dateLabel(first.date)}</div></div>`; }
  }
  box.innerHTML = `<div class="body-grid comp-grid">
    <div class="bcard"><div class="bval">${c.bf.toLocaleString("de-DE")}<small>%</small></div><div class="blbl">Körperfett</div></div>
    <div class="bcard"><div class="bval">${fmtKg(c.fatKg)}</div><div class="blbl">kg Fett</div></div>
    ${lost || `<div class="bcard"><div class="bval">${fmtKg(c.leanKg)}</div><div class="blbl">kg fettfrei</div></div>`}
  </div>`;
}
function renderGoalProgress() {
  renderComp();
  const el = $("#goalProgress"); if (!el) return;
  const w = latestWeight(), gw = goalW() || 0, c = bodyComp(), gb = Number(state.profile.goalBf);
  if (c && gb && gw && gw < w) { el.innerHTML = `Noch <b>${fmtKg(w - gw)} kg Fett</b> bis ${gb.toLocaleString("de-DE")} % Körperfett (≈ ${fmtKg(gw)} kg).`; return; }
  if (!w || !gw) { el.textContent = ""; return; }
  const diff = Math.round((w - gw) * 10) / 10;
  el.innerHTML = diff === 0 ? "Zielgewicht erreicht." : `Noch <b>${Math.abs(diff).toLocaleString("de-DE")} kg</b> bis zu deinem Ziel von ${gw.toLocaleString("de-DE")} kg.`;
}

// ---------- Mitwachsendes Kalorienziel (aus Gewichtstrend + gegessenen kcal) ----------
// Idee wie MacroFactor: echter Verbrauch = Ø gegessen − (Gewichtsänderung × 7700 kcal/kg).
// Rein lokal gerechnet. Ehrlich: nur mit genug Daten, sonst sagt die App, was fehlt.
const KCAL_PER_KG = 7700, ADAPT_DAYS = 28;
function linSlope(pts) { // pts: [{x,y}] → Steigung (y pro x)
  const n = pts.length, mx = pts.reduce((a, p) => a + p.x, 0) / n, my = pts.reduce((a, p) => a + p.y, 0) / n;
  let num = 0, den = 0; for (const p of pts) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2; }
  return den ? num / den : 0;
}
function adaptiveEstimate() {
  const end = today(), start = dayOffset(end, -(ADAPT_DAYS - 1));
  const dnum = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
  // Tage mit realistisch vollständigem Log (≥ 800 kcal) — heute nicht, der läuft noch
  const byDay = {};
  // Phasentage (Fasten/Suppe) zählen nicht: Wasserverlust würde den Verbrauch verfälschen
  for (const e of state.entries) if (e.date >= start && e.date < end && !phaseActiveOn(e.date)) byDay[e.date] = (byDay[e.date] || 0) + e.kcal;
  const days = Object.values(byDay).filter(k => k >= 800);
  const ws = state.weights.filter(w => w.date >= start && w.date <= end);
  const need = [];
  if (days.length < 10) need.push(`${10 - days.length} weitere vollständig geloggte Tage`);
  const spanDays = ws.length ? dnum(ws[ws.length - 1].date) - dnum(ws[0].date) : 0;
  if (ws.length < 3 || spanDays < 10) need.push("mind. 3 Wiegungen über ≥ 10 Tage");
  if (need.length) return { ok: false, need, loggedDays: days.length, weighIns: ws.length };
  const intake = days.reduce((a, k) => a + k, 0) / days.length;
  const slopeKgDay = linSlope(ws.map(w => ({ x: dnum(w.date), y: w.kg })));
  const tdee = intake - slopeKgDay * KCAL_PER_KG;
  // Plausibilität: Tippfehler beim Gewicht (z.B. 11,0 statt 110) oder Sprünge würden absurde Werte liefern.
  // Außerhalb 1200–6000 kcal oder > 2 kg/Woche Trend → lieber keine Schätzung als eine falsche.
  if (!(tdee >= 1200 && tdee <= 6000) || Math.abs(slopeKgDay * 7) > 2)
    return { ok: false, need: ["einen gleichmäßigeren Gewichtsverlauf — prüf deine Einträge auf Tippfehler"], loggedDays: days.length, weighIns: ws.length };
  const rate = planRate(); // kg/Woche, aus Zielgewicht + gewählter Stufe
  let target = tdee + rate * KCAL_PER_KG / 7;
  target = Math.round(Math.max(state.profile.sex === "w" ? 1200 : 1500, target) / 10) * 10; // gleiche Untergrenze wie im Plan
  return { ok: true, intake: Math.round(intake), tdee: Math.round(tdee), trendWeek: Math.round(slopeKgDay * 7 * 100) / 100, target, loggedDays: days.length, weighIns: ws.length };
}
function renderAdaptive() {
  const box = $("#adaptBox"); if (!box) return;
  const r = adaptiveEstimate();
  if (!r.ok) {
    box.innerHTML = `<p class="hint">Noch zu wenig Daten (letzte ${ADAPT_DAYS} Tage: ${r.loggedDays} Tage geloggt, ${r.weighIns} Wiegungen). Es fehlen: <b>${r.need.join(" und ")}</b>.</p>`;
    return;
  }
  const diff = r.target - state.profile.kcalTarget;
  box.innerHTML = `<div class="body-grid">
      <div class="bcard"><div class="bval">${r.tdee}</div><div class="blbl">Verbrauch</div><div class="bsub">kcal/Tag (geschätzt)</div></div>
      <div class="bcard"><div class="bval">${r.trendWeek > 0 ? "+" : ""}${r.trendWeek}</div><div class="blbl">Trend</div><div class="bsub">kg/Woche</div></div>
      <div class="bcard"><div class="bval">${r.target}</div><div class="blbl">Vorschlag</div><div class="bsub">kcal/Tag</div></div>
    </div>
    <p class="hint">Basis: Ø ${r.intake} kcal an ${r.loggedDays} Tagen, ${r.weighIns} Wiegungen. Aktuelles Ziel ${state.profile.kcalTarget} kcal${diff ? ` (${diff > 0 ? "+" : ""}${diff})` : " — passt"}.</p>
    ${Math.abs(diff) >= 50 ? `<button class="primary" id="adaptApply">Vorschlag ${r.target} kcal übernehmen</button>` : ""}`;
  const b = $("#adaptApply");
  if (b) b.onclick = () => { state.profile.kcalTarget = r.target; persist(); fillGoals(); renderDiary(); renderAdaptive(); };
}


function renderDiary() { renderSummary(); renderMeals(); renderWater(); renderTodayBody(); renderTrain(); renderNudges(); }

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
  $("#fFiber").value = entry && entry.fiber != null ? entry.fiber : "";
  $("#fSugar").value = entry && entry.sugar != null ? entry.sugar : "";
  $("#searchInput").value = ""; $("#results").innerHTML = ""; $("#per100hint").textContent = "";
  const vb = $("#visionBox"); if (vb) vb.innerHTML = "";
  const vh = $("#visionHint"); if (vh) vh.value = "";
  $("#saveEntry").textContent = entry ? "Speichern" : "Hinzufügen";
  renderFavChips();
  renderTplChips();
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
  $("#fFiber").value = per100.fiber != null ? round1(per100.fiber * g / 100) : "";
  $("#fSugar").value = per100.sugar != null ? round1(per100.sugar * g / 100) : "";
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
    for (const id of ["fFiber", "fSugar"]) if ($("#" + id).value !== "") scale(id, round1);
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
  return { name: name.slice(0, 100), per100: { kcal: +kcal, protein: +(n.proteins_100g || 0), carbs: +(n.carbohydrates_100g || 0), fat: +(n.fat_100g || 0),
    fiber: n.fiber_100g != null ? +n.fiber_100g : null, sugar: n.sugars_100g != null ? +n.sugars_100g : null } };
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
for (const id of ["fKcal", "fProtein", "fCarbs", "fFat", "fFiber", "fSugar"]) {
  on("#" + id, "input", () => { per100 = null; $("#per100hint").textContent = ""; });
}

// ---------- Favoriten / eigene Lebensmittel ----------
function foodKey(name) { return String(name || "").trim().toLowerCase(); }
function rememberFood(e) {
  if (!e.name) return;
  const g = e.grams || 0;
  const per100 = g ? { kcal: e.kcal / g * 100, protein: e.protein / g * 100, carbs: e.carbs / g * 100, fat: e.fat / g * 100 }
    : { kcal: e.kcal, protein: e.protein, carbs: e.carbs, fat: e.fat };
  if (e.fiber != null) per100.fiber = g ? e.fiber / g * 100 : e.fiber;
  if (e.sugar != null) per100.sugar = g ? e.sugar / g * 100 : e.sugar;
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
  $("#scanBtn").textContent = "Scan stoppen";
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
  const b = $("#scanBtn"); if (b) b.innerHTML = '<svg class="bi" viewBox="0 0 24 24"><path d="M4 6v12M7 6v12M11 6v12M14 6v12M17 6v12M20 6v12"/></svg>Barcode';
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
    protein: Math.max(0, round1(Number($("#fProtein").value) || 0)), carbs: Math.max(0, round1(Number($("#fCarbs").value) || 0)), fat: Math.max(0, round1(Number($("#fFat").value) || 0)),
    fiber: optNum($("#fFiber").value), sugar: optNum($("#fSugar").value)
  };
  // Uhrzeit merken (für „spät gegessen“ in der Schlaf-Auswertung) — nur bei neuen Einträgen für heute
  if (!$("#editId").value && selDate === today()) { const d = new Date(); e.at = pad2(d.getHours()) + ":" + pad2(d.getMinutes()); }
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
  const kg = Number(String($("#weightInput").value).replace(",", "."));
  const waist = Number(String(($("#waistInput") || {}).value || "").replace(",", ".")) || null;
  const ex = state.weights.find(w => w.date === selDate);
  if (!kg && !(waist && ex)) return alert(waist ? "Für den Tag gibt es noch kein Gewicht — bitte Gewicht mit eintragen." : "Gewicht eingeben.");
  state.weights = state.weights.filter(w => w.date !== selDate);
  state.weights.push({ id: uid(), date: selDate, kg: kg || ex.kg, waistCm: waist || (ex && ex.waistCm) || null });
  const wi = $("#waistInput"); if (wi) wi.value = "";
  state.weights.sort((a, b) => a.date.localeCompare(b.date));
  persist(); $("#weightInput").value = ""; renderWeight(); renderSummary(); fillGoals(); renderPlan(); renderGoalProgress();
});
function renderWeight() {
  const list = $("#weightList"); if (!list) return; list.innerHTML = "";
  [...state.weights].reverse().forEach(w => {
    const row = document.createElement("div");
    row.className = "entry";
    row.innerHTML = `<div class="info"><div class="nm">${esc(dateLabel(w.date))}</div>${w.waistCm ? `<div class="sub">Bauch ${String(w.waistCm).replace(".", ",")} cm</div>` : ""}</div><div class="kc">${(Math.round(w.kg * 10) / 10).toLocaleString("de-DE", { minimumFractionDigits: 1 })} kg</div><button class="x" aria-label="Eintrag löschen">✕</button>`;
    row.querySelector(".x").onclick = () => { state.weights = state.weights.filter(x => x.id !== w.id); persist(); renderWeight(); renderSummary(); fillGoals(); renderGoalProgress(); };
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
  if (pts.length < 2) { ctx.fillStyle = "#8c8aa0"; ctx.font = "14px Outfit, sans-serif"; ctx.fillText("Ab 2 Einträgen erscheint hier dein Verlauf.", 4, 80); return; }
  const gw = goalW() || 0;
  const ys = pts.map(p => p.kg); let min = Math.min(...ys), max = Math.max(...ys);
  // Zielgewicht einblenden, wenn es nicht absurd weit weg ist (sonst wird die Kurve flach)
  const showGoal = gw && Math.abs(gw - (gw < min ? min : max)) <= Math.max(6, (max - min) * 2);
  if (showGoal) { min = Math.min(min, gw); max = Math.max(max, gw); }
  if (min === max) { min -= 1; max += 1; }
  // x nach echtem Datum (Lücken sichtbar), nicht gleichmäßig nach Index
  const dnum = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  const t0 = dnum(pts[0].date), span = Math.max(1, dnum(pts[pts.length - 1].date) - t0);
  const pad = 24, gx = (i) => pad + (dnum(pts[i].date) - t0) / span * (W - 2 * pad), gy = (v) => H - pad - (v - min) / (max - min) * (H - 2 * pad);
  const grad = ctx.createLinearGradient(0, pad, 0, H - pad);
  grad.addColorStop(0, "rgba(212,175,55,.22)"); grad.addColorStop(1, "rgba(212,175,55,0)");
  ctx.beginPath(); pts.forEach((p, i) => { i ? ctx.lineTo(gx(i), gy(p.kg)) : ctx.moveTo(gx(i), gy(p.kg)); });
  ctx.lineTo(gx(pts.length - 1), H - pad); ctx.lineTo(gx(0), H - pad); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
  ctx.strokeStyle = "#D4AF37"; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.beginPath();
  pts.forEach((p, i) => { i ? ctx.lineTo(gx(i), gy(p.kg)) : ctx.moveTo(gx(i), gy(p.kg)); }); ctx.stroke();
  if (showGoal) {
    ctx.save(); ctx.strokeStyle = "rgba(34,197,94,.75)"; ctx.setLineDash([5, 5]); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(pad, gy(gw)); ctx.lineTo(W - pad, gy(gw)); ctx.stroke(); ctx.restore();
    ctx.fillStyle = "#22c55e"; ctx.font = "11px 'IBM Plex Mono', monospace"; ctx.fillText("Ziel " + gw, W - pad - 60, gy(gw) - 6);
  }
  const li = pts.length - 1; ctx.fillStyle = "#D4AF37"; ctx.beginPath(); ctx.arc(gx(li), gy(pts[li].kg), 4, 0, 7); ctx.fill();
  ctx.fillStyle = "#8c8aa0"; ctx.font = "11px 'IBM Plex Mono', monospace"; ctx.fillText(max.toFixed(1), 2, gy(max) - 6); ctx.fillText(min.toFixed(1), 2, gy(min) + 14);
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
  const w = latestWeight(), pt = proteinTarget(), base = proteinBaseKg();
  $("#proteinCalc").textContent = !w ? "Trag dein Gewicht ein → Eiweiß-Ziel rechnet sich automatisch."
    : `= ${pt} g Eiweiß/Tag, gerechnet auf ${({ current: "dein aktuelles Gewicht", goal: "dein Zielgewicht", lean: "deine fettfreie Masse" })[state.profile.proteinBasis || "current"]} (${fmtKg(base)} kg).`;
  const pb = $("#goalProtBasis"); if (pb) pb.value = state.profile.proteinBasis || "current";
}
on("#goalProtBasis", "change", (e) => { state.profile.proteinBasis = e.target.value; persist(); fillGoals(); renderSummary(); renderPlan(); });
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
on("#exportBtn", "click", doBackup);
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
  if (tab === "goals") { renderFoodsList(); renderTemplatesList(); renderPlan(); renderAdaptive(); }
}
on("#toLK", "click", (e) => { e.currentTarget.href = lebenskompassLink(); });
on("#datePicker", "change", (e) => { selDate = e.target.value || today(); refreshDate(); });
on("#prevDay", "click", () => shiftDay(-1));
on("#nextDay", "click", () => shiftDay(1));
function shiftDay(d) {
  selDate = dayOffset(selDate, d);
  refreshDate();
}
const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"], MON = ["Jan", "Feb", "März", "Apr", "Mai", "Juni", "Juli", "Aug", "Sep", "Okt", "Nov", "Dez"];
function dateLabel(ds) {
  const t = today();
  if (ds === t) return "Heute";
  if (ds === dayOffset(t, -1)) return "Gestern";
  if (ds === dayOffset(t, 1)) return "Morgen";
  const [y, m, d] = ds.split("-").map(Number), dt = new Date(y, m - 1, d);
  return WD[dt.getDay()] + ", " + d + ". " + MON[m - 1] + (y !== new Date().getFullYear() ? " " + y : "");
}
function refreshDate() { $("#datePicker").value = selDate; const l = $("#dateLabel"); if (l) l.textContent = dateLabel(selDate); renderDiary(); renderSupps(); renderJournal(); renderPhaseBanner(); }

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
  if (amp) { amp.textContent = rec.score != null ? (rec.score >= 67 ? "gut erholt" : rec.score >= 34 ? "mittel erholt" : "wenig erholt") : ""; amp.style.color = rec.score == null ? "" : rec.score >= 67 ? "var(--green)" : rec.score >= 34 ? "var(--gold)" : "var(--red)"; }
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
    state.bodyLog[today()] = { ...(state.bodyLog[today()] || {}), recovery: rec.score, hrv: rec.hrv, rhr: rec.rhr, sleepH: slp.asleepH, sleepPerf: slp.performance, strain: str.strain, kcalBurn: str.kcal };
    renderSummary(); renderNudges();
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
    b.onclick = () => { const w = jTodayW(); w.flags[f.k] = !w.flags[f.k]; persist(); renderJournal(); renderTrain(); };
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
  if (pts.length < 2) { ctx.fillStyle = "#8c8aa0"; ctx.font = "14px Outfit, sans-serif"; ctx.fillText("Ab 2 Tagen mit Körperdaten erscheint hier der Verlauf.", 4, 75); return; }
  const pad = 22, n = pts.length;
  const gx = (i) => pad + i * (W - 2 * pad) / (n - 1);
  // Recovery 0-100 (gold)
  const gyR = (v) => H - pad - (v / 100) * (H - 2 * pad);
  ctx.strokeStyle = "#D4AF37"; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.beginPath();
  let started = false;
  pts.forEach((p, i) => { if (p.recovery == null) return; const x = gx(i), y = gyR(p.recovery); started ? ctx.lineTo(x, y) : ctx.moveTo(x, y); started = true; });
  ctx.stroke();
  ctx.fillStyle = "#D4AF37"; pts.forEach((p, i) => { if (p.recovery == null) return; ctx.beginPath(); ctx.arc(gx(i), gyR(p.recovery), 2.5, 0, 7); ctx.fill(); });
  // Schlaf h 0-10 (blau)
  const gyS = (v) => H - pad - (Math.min(v, 10) / 10) * (H - 2 * pad);
  ctx.strokeStyle = "#7c8cf8"; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath(); started = false;
  pts.forEach((p, i) => { if (p.sleepH == null) return; const x = gx(i), y = gyS(p.sleepH); started ? ctx.lineTo(x, y) : ctx.moveTo(x, y); started = true; });
  ctx.stroke(); ctx.setLineDash([]);
}
// ---------- „Was dir gut tut“: Tag D (was du gemacht hast) ↔ Nacht danach (Schlaf/Erholung an D+1) ----------
// Früher wurde Tag D mit der Erholung von Tag D verglichen — Alkohol am Abend wirkt aber erst in der Nacht danach.
function dayLogged(d) { return state.entries.some(e => e.date === d) || jLogged(state.journal[d]) || (state.suppLog[d] && Object.values(state.suppLog[d]).some(Boolean)); }
function dayFeatures(d) {
  const f = {}, j = state.journal[d] || {}, flags = j.flags || {};
  for (const x of JFLAGS) if (x.k !== "gut") f["j:" + x.k] = !!flags[x.k];
  const es = state.entries.filter(e => e.date === d);
  if (es.some(e => e.at && e.at >= "21:00")) f["j:spaet"] = true; // spät gegessen automatisch aus der Uhrzeit
  if (state.suppLog[d] && Object.values(state.suppLog[d]).some(Boolean)) for (const sp of state.supplements) f["s:" + sp.id] = !!state.suppLog[d][sp.id];
  if (es.length) {
    const kcal = es.reduce((a, e) => a + e.kcal, 0), p = es.reduce((a, e) => a + e.protein, 0), pT = proteinTarget();
    if (pT) f["n:prot"] = p >= pT * 0.9;
    f["n:over"] = kcal > (state.profile.kcalTarget || 0) * 1.15;
    if (es.every(e => e.sugar != null)) f["n:sugar"] = es.reduce((a, e) => a + e.sugar, 0) > (state.profile.kcalTarget || 2000) * 0.10 / 4;
    if (es.every(e => e.fiber != null)) f["n:fiber"] = es.reduce((a, e) => a + e.fiber, 0) >= FIBER_TARGET;
  }
  if (state.water[d]) f["n:water"] = state.water[d] >= (state.profile.waterTarget || 2500);
  return f;
}
function featLabel(k) {
  if (k.startsWith("j:")) { const x = JFLAGS.find(x => "j:" + x.k === k); return x ? x.t : k; }
  if (k.startsWith("s:")) { const sp = state.supplements.find(x => "s:" + x.id === k); return sp ? "💊 " + sp.name : null; }
  return ({ "n:prot": "🥩 Eiweiß-Ziel erreicht", "n:over": "🍽️ deutlich über kcal-Ziel", "n:sugar": "🍬 viel Zucker", "n:fiber": "🥦 30 g Ballaststoffe", "n:water": "💧 Wasser-Ziel erreicht" })[k] || k;
}
function wellbeingInsights() {
  const rows = [];
  for (const d of Object.keys(state.bodyLog)) {
    const prev = dayOffset(d, -1), b = state.bodyLog[d];
    if (!b || (b.sleepPerf == null && b.recovery == null) || !dayLogged(prev) || phaseActiveOn(prev)) continue;
    rows.push({ f: dayFeatures(prev), sleep: b.sleepPerf, rec: b.recovery });
  }
  const keys = new Set(); rows.forEach(r => Object.keys(r.f).forEach(k => keys.add(k)));
  const out = [];
  for (const k of keys) {
    const res = {};
    for (const m of ["sleep", "rec"]) {
      const w = rows.filter(r => r.f[k] === true && r[m] != null), wo = rows.filter(r => r.f[k] === false && r[m] != null);
      if (w.length >= 3 && wo.length >= 3) {
        const avg = (a) => a.reduce((s, r) => s + r[m], 0) / a.length;
        res[m] = { diff: Math.round(avg(w) - avg(wo)), n: Math.min(w.length, wo.length) };
      }
    }
    if (!res.sleep && !res.rec) continue;
    const score = ((res.sleep ? res.sleep.diff : 0) + (res.rec ? res.rec.diff : 0)) / ((res.sleep ? 1 : 0) + (res.rec ? 1 : 0));
    const n = Math.max(res.sleep ? res.sleep.n : 0, res.rec ? res.rec.n : 0);
    const label = featLabel(k);
    if (label && Math.abs(score) >= 3) out.push({ k, label, res, score, n });
  }
  return { rows: rows.length, out: out.sort((a, b) => Math.abs(b.score) - Math.abs(a.score)) };
}
function renderInsights() {
  const box = $("#insights"); if (!box) return;
  const { rows, out } = wellbeingInsights();
  if (rows < 6) { box.innerHTML = `<p class="hint">Noch ${6 - rows} Nächte mit Whoop-Daten und Einträgen vom Vortag bis zur ersten Auswertung. Hak im Journal einfach ab, was war — Essen, Supplements und Uhrzeiten zählen automatisch mit.</p>`; return; }
  if (!out.length) { box.innerHTML = `<p class="hint">Bei ${rows} Nächten noch keine klaren Muster — wird mit jedem Tag genauer.</p>`; return; }
  const strength = (o) => o.n >= 8 && Math.abs(o.score) >= 6 ? "deutlich" : o.n >= 5 ? "mittel" : "erste Tendenz";
  const line = (o) => {
    const parts = [];
    if (o.res.sleep) parts.push(`Schlaf ${o.res.sleep.diff > 0 ? "+" : ""}${o.res.sleep.diff} %`);
    if (o.res.rec) parts.push(`Erholung ${o.res.rec.diff > 0 ? "+" : ""}${o.res.rec.diff} %`);
    return `<div class="insight ${o.score > 0 ? "good" : "bad"}"><b>${esc(o.label)}</b><span class="idiff">${parts.join(" · ")} in der Nacht danach · ${strength(o)}</span></div>`;
  };
  const good = out.filter(o => o.score > 0).slice(0, 5), bad = out.filter(o => o.score < 0).slice(0, 5);
  box.innerHTML = (good.length ? `<h3 class="bsec" style="margin-top:4px">Tut dir gut</h3>` + good.map(line).join("") : "")
    + (bad.length ? `<h3 class="bsec">Eher nicht</h3>` + bad.map(line).join("") : "")
    + `<p class="hint">Aus ${rows} Nächten deiner eigenen Daten. Das sind Zusammenhänge, keine Beweise — sie werden mit jedem Tag genauer.</p>`;
}
on("#histRefresh", "click", () => loadHistory(true));

// ---------- Foto-KI: Essen erkennen (Cloudflare Workers AI über Worker, optional mit Text-Hinweis) ----------
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
        : /^cf_limit/.test(err || "") ? "Tageskontingent der Gratis-Foto-KI aufgebraucht — morgen wieder, bis dahin Suche/Barcode"
        : err === "groq_429" ? "Foto-KI gerade ausgelastet — in einer Minute nochmal"
        : err === "groq_401" ? "Foto-KI-Schlüssel auf dem Server ungültig"
        : /^groq_|^fetch_|^cf_/.test(err || "") ? "Foto-KI-Dienst gerade nicht erreichbar (" + err + ")"
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
// Prüf-Liste nach dem Foto: jede Zutat einzeln entfernen, Menge ändern (Werte rechnen mit), Namen korrigieren,
// dann alles auf einmal übernehmen. Werte werden pro Gramm aus der KI-Schätzung hochgerechnet.
let visionItems = [];
const VKEYS = ["kcal", "protein", "carbs", "fat", "fiber", "sugar"];
function renderVision(d) {
  const box = $("#visionBox"); if (!box) return;
  if (!d.items || !d.items.length) {
    box.innerHTML = `<div class="vision-msg">Kein Essen erkannt${d.note ? " — " + esc(d.note) : ""}. Klareres Foto versuchen oder manuell eintragen.</div>`;
    return;
  }
  visionItems = d.items.map(it => {
    const g0 = Math.max(1, Math.round(it.grams) || 100), perG = {};
    for (const k of VKEYS) perG[k] = it[k] != null ? it[k] / g0 : null;
    return { name: it.name, g0, grams: g0, perG, conf: it.confidence };
  });
  box._note = d.note || "";
  drawVisionList();
}
function vVal(it, k) { return it.perG[k] == null ? null : it.perG[k] * it.grams; }
function drawVisionList() {
  const box = $("#visionBox"); if (!box) return;
  if (!visionItems.length) { box.innerHTML = `<div class="vision-msg">Alles entfernt — Foto neu machen oder unten manuell eintragen.</div>`; return; }
  const tot = visionItems.reduce((a, it) => a + (vVal(it, "kcal") || 0), 0);
  let html = `<div class="vision-head">Erkannt — prüfen, Mengen anpassen, Falsches mit ✕ entfernen:</div>`;
  visionItems.forEach((it, i) => {
    const conf = it.conf != null ? Math.round(it.conf * 100) : null;
    html += `<div class="vrow" data-i="${i}">
      <div class="vrow-top"><input class="vname" value="${esc(it.name)}" aria-label="Name" /><button class="vdel" aria-label="${esc(it.name)} entfernen">✕</button></div>
      <div class="vrow-bot">
        <div class="vqty"><button class="vminus" aria-label="weniger">−</button><input class="vg" type="number" inputmode="numeric" value="${Math.round(it.grams)}" aria-label="Menge in Gramm" /><span>g</span><button class="vplus" aria-label="mehr">+</button></div>
        <div class="vmac"><b>${Math.round(vVal(it, "kcal"))}</b> kcal · ${round1(vVal(it, "protein"))} P${conf != null && conf < 60 ? ` · <span class="vunsure">unsicher</span>` : ""}</div>
      </div></div>`;
  });
  if (box._note) html += `<div class="vision-msg">${esc(box._note)}</div>`;
  html += `<button class="primary" id="visionAddAll" style="margin-top:6px">${visionItems.length > 1 ? `Alle ${visionItems.length} übernehmen` : "Übernehmen"} · ${Math.round(tot)} kcal</button>
    <p class="hint" style="text-align:center">Fehlt eine Zutat? Nach dem Übernehmen einfach über Suche oder Barcode ergänzen.</p>`;
  box.innerHTML = html;
  box.querySelectorAll(".vrow").forEach(row => {
    const i = +row.dataset.i, it = visionItems[i];
    const step = Math.max(5, Math.round(it.g0 * 0.25 / 5) * 5); // 25 % der geschätzten Menge, auf 5 g gerundet
    row.querySelector(".vdel").onclick = () => { visionItems.splice(i, 1); drawVisionList(); };
    row.querySelector(".vminus").onclick = () => { it.grams = Math.max(0, it.grams - step); drawVisionList(); };
    row.querySelector(".vplus").onclick = () => { it.grams += step; drawVisionList(); };
    row.querySelector(".vg").onchange = (e) => { it.grams = Math.max(0, Number(e.target.value) || 0); drawVisionList(); };
    row.querySelector(".vname").oninput = (e) => { it.name = e.target.value; };
  });
  $("#visionAddAll").onclick = () => addVisionAll(visionItems.filter(it => it.grams > 0 && it.name.trim()).map(it => {
    const o = { name: it.name.trim(), grams: it.grams }; for (const k of VKEYS) o[k] = vVal(it, k); return o;
  }));
}
function fillFromVision(it) {
  per100 = it.grams > 0 ? { kcal: it.kcal / it.grams * 100, protein: it.protein / it.grams * 100, carbs: it.carbs / it.grams * 100, fat: it.fat / it.grams * 100,
    fiber: it.fiber != null ? it.fiber / it.grams * 100 : null, sugar: it.sugar != null ? it.sugar / it.grams * 100 : null } : null;
  $("#fName").value = it.name;
  $("#fGrams").value = Math.round(it.grams) || 100;
  $("#fKcal").value = Math.round(it.kcal);
  $("#fProtein").value = round1(it.protein);
  $("#fCarbs").value = round1(it.carbs);
  $("#fFat").value = round1(it.fat);
  $("#fFiber").value = it.fiber != null ? round1(it.fiber) : "";
  $("#fSugar").value = it.sugar != null ? round1(it.sugar) : "";
  $("#per100hint").textContent = "Aus Foto geschätzt — Menge/Werte oben bei Bedarf anpassen, dann Hinzufügen.";
  $("#visionBox").innerHTML = "";
  $("#fName").scrollIntoView({ behavior: "smooth", block: "center" });
}
function addVisionAll(items) {
  const meal = $("#mealSelect").value || "snack";
  for (const it of items) {
    const e = { date: selDate, meal, name: it.name, grams: Math.round(it.grams) || 0, kcal: Math.round(it.kcal), protein: round1(it.protein), carbs: round1(it.carbs), fat: round1(it.fat),
      fiber: it.fiber != null ? round1(it.fiber) : null, sugar: it.sugar != null ? round1(it.sugar) : null };
    if (selDate === today()) { const d = new Date(); e.at = pad2(d.getHours()) + ":" + pad2(d.getMinutes()); }
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
    for (let i = 0; i < n; i++) { const s = document.createElement("span"); s.className = "wseg" + (i < filled ? " on" : ""); dots.appendChild(s); }
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
  set("tbRec", b.recovery != null ? b.recovery + "%" : "–");
  const tr = $("#tbRec"); if (tr) tr.style.color = b.recovery == null ? "" : b.recovery >= 67 ? "var(--green)" : b.recovery >= 34 ? "var(--gold)" : "var(--red)";
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
    cell(avg1(sleeps) != null ? avg1(sleeps) + " h" : null, "Ø Schlaf", "") + weekFatCell(days) +
    cell(trainCount("kraft", 7) + "×", "Krafttraining", "Ziel 2–3×") + cell(trainCount("sport", 7) + "×", "Sport/Cardio", "");
}

// Fett-Bilanz der Woche: Σ(Verbrauch − gegessen) / 7700 — Verbrauch gemessen (falls genug Daten), sonst Formel
function tdeeRef() { const a = adaptiveEstimate(); if (a.ok) return a.tdee; const p = bodyPlan(); return p.ok ? p.tdee : null; }
function weekFatCell(days) {
  const t = tdeeRef(); if (!t) return "";
  let bal = 0, n = 0;
  for (const d of days) { if (d === today()) continue; const k = state.entries.filter(e => e.date === d).reduce((a, e) => a + e.kcal, 0); if (k >= 300) { bal += t - k; n++; } }
  if (!n) return "";
  const kg = bal / 7700;
  return `<div class="bcard"><div class="bval" style="color:${kg >= 0 ? "var(--green)" : "var(--red)"}">${kg >= 0 ? "−" : "+"}${fmtKg(Math.abs(kg))}</div><div class="blbl">kg Fett</div><div class="bsub">rechnerisch, ${n} Tage</div></div>`;
}

// ---------- Supplement → Recovery am Folgetag ----------
function renderSuppInsights() { /* in renderInsights (wellbeingInsights) aufgegangen */ }

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
function renderAll() { renderPhaseBanner(); renderPhaseCard(); renderAll0(); renderBackupInfo(); }
function renderAll0() { renderDiary(); renderSupps(); renderWeight(); renderPhotos(); fillGoals(); renderWater(); renderTodayBody(); renderFoodsList(); renderTemplatesList(); renderPlan(); renderAdaptive(); renderGoalProgress(); }
try {
  $("#datePicker").value = selDate;
  { const l = $("#dateLabel"); if (l) l.textContent = dateLabel(selDate); }
  const vl = $("#verLine"); if (vl) vl.textContent = "MB FIT " + APP_VERSION;
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
