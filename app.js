// FitTracker — 100% client-side (GitHub Pages). Daten im Browser: localStorage + IndexedDB (Fotos).
// iOS-Safari-robust: kein structuredClone im Hot-Path, defensiver Boot, sichtbarer Fehler statt stiller Tod.
"use strict";
const APP_VERSION = "v8 · 2026-06-11";

const $ = (s) => document.querySelector(s);
const on = (sel, ev, fn) => { const el = $(sel); if (el) el.addEventListener(ev, fn); };
const clone = (o) => JSON.parse(JSON.stringify(o));
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
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
  { name: "Kreatin Monohydrat (Pulver)", per100: { kcal: 0, protein: 0, carbs: 0, fat: 0 } }
];

const DEFAULT = {
  profile: { kcalTarget: 2200, proteinPerKg: 2.0, carbTarget: 220, fatTarget: 70 },
  entries: [], weights: [], photos: [], foods: [],
  supplements: SEED_SUPPS.map(s => ({ id: uid(), ...s })),
  suppLog: {} // { "2026-06-11": { suppId: true } }
};
const RING_C = 2 * Math.PI * 42; // Umfang des Ring-Kreises (r=42)
const LS_KEY = "fittracker:db";

let state = load();
let selDate = today();
let per100 = null;

// ---------- persistence ----------
function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return clone(DEFAULT);
    const db = JSON.parse(raw);
    return {
      ...clone(DEFAULT), ...db,
      profile: { ...DEFAULT.profile, ...(db.profile || {}) },
      // supplements nur seeden, wenn der Key komplett fehlt (Bestandsdaten ohne Tabletten-Feature)
      supplements: Array.isArray(db.supplements) ? db.supplements : clone(DEFAULT.supplements),
      suppLog: db.suppLog && typeof db.suppLog === "object" ? db.suppLog : {},
      foods: Array.isArray(db.foods) ? db.foods : []
    };
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
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
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
}
function renderDiary() { renderSummary(); renderMeals(); }

// ---------- supplements ----------
function suppTakenMap() { return state.suppLog[selDate] || (state.suppLog[selDate] = {}); }
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
      const t = suppTakenMap();
      if (t[s.id]) delete t[s.id]; else t[s.id] = true;
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
  $("#saveEntry").textContent = entry ? "Speichern" : "Hinzufügen";
  renderFavChips();
  showSheet("food", true);
}
function showSheet(which, on) {
  const bg = which === "supp" ? "#suppBg" : "#sheetBg";
  const sh = which === "supp" ? "#suppSheet" : "#addSheet";
  $(bg).classList.toggle("show", on);
  $(sh).classList.toggle("show", on);
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
  // 2) Open Food Facts (neue Search-API) dazu
  try {
    const url = "https://search.openfoodfacts.org/search?q=" + encodeURIComponent(q) +
      "&page_size=25&lang=de&fields=product_name,product_name_de,brands,nutriments,code";
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    const data = await (await fetch(url, { signal: ctrl.signal })).json();
    clearTimeout(t);
    const off = (data.hits || data.products || []).map(parseOFF).filter(Boolean).filter(it => !seen.has(it.name.toLowerCase()));
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

// ---------- Schnell-Mengen ----------
document.querySelectorAll("#amountChips button").forEach(b => b.onclick = () => {
  if (b.dataset.g) $("#fGrams").value = b.dataset.g;
  else if (b.dataset.mult) { const g = Number($("#fGrams").value) || 100; $("#fGrams").value = Math.round(g * Number(b.dataset.mult)); }
  applyPer100();
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
    if (data.status !== 1) return alert("Barcode nicht in der Datenbank — bitte manuell eintragen.");
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
    row.innerHTML = `<div class="info"><div class="nm">${w.date}</div></div><div class="kc">${w.kg} kg</div><button class="x">✕</button>`;
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
  const pad = 24, gx = (i) => pad + i * (W - 2 * pad) / (pts.length - 1), gy = (v) => H - pad - (v - min) / (max - min) * (H - 2 * pad);
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
    img.onload = () => {
      let w = img.width, h = img.height;
      if (Math.max(w, h) > maxDim) { const s = maxDim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
async function renderPhotos() {
  const grid = $("#photoGrid"); if (!grid) return; grid.innerHTML = "";
  if (!state.photos.length) { grid.innerHTML = `<div class="empty">Noch keine Fotos.</div>`; return; }
  for (const p of [...state.photos].reverse()) {
    const d = document.createElement("div");
    d.className = "photo";
    d.innerHTML = `<img loading="lazy" /><div class="cap">${p.date}</div><button class="del">✕</button>`;
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
  Object.assign(state.profile, {
    kcalTarget: Number($("#goalKcal").value) || 0, proteinPerKg: Number($("#goalProteinPerKg").value) || 2,
    carbTarget: Number($("#goalCarb").value) || 0, fatTarget: Number($("#goalFat").value) || 0
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
    state = {
      ...clone(DEFAULT), ...data.state,
      profile: { ...DEFAULT.profile, ...(data.state.profile || {}) },
      supplements: Array.isArray(data.state.supplements) ? data.state.supplements : clone(DEFAULT.supplements),
      suppLog: data.state.suppLog || {}
    };
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
  if (tab === "body") loadWhoop();
}
on("#datePicker", "change", (e) => { selDate = e.target.value || today(); refreshDate(); });
on("#prevDay", "click", () => shiftDay(-1));
on("#nextDay", "click", () => shiftDay(1));
function shiftDay(d) {
  const dt = new Date(selDate + "T00:00:00"); dt.setDate(dt.getDate() + d);
  selDate = dt.toISOString().slice(0, 10);
  refreshDate();
}
function refreshDate() { $("#datePicker").value = selDate; renderDiary(); renderSupps(); }

// ---------- FAB (schnell hinzufügen) ----------
on("#fab", "click", () => {
  const h = new Date().getHours();
  const meal = h < 11 ? "fruehstueck" : h < 15 ? "mittag" : h < 21 ? "abend" : "snack";
  switchTab("diary"); openSheet(meal);
});

// ---------- Onboarding (Erststart) ----------
function showOb(on) { $("#obBg").classList.toggle("show", on); $("#obSheet").classList.toggle("show", on); }
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
  const rec = d.recovery, slp = d.sleep, str = d.strain;
  set("recVal", rec && rec.score != null ? rec.score + "%" : "–");
  set("slpVal", slp && slp.performance != null ? slp.performance + "%" : "–");
  set("strVal", str && str.strain != null ? str.strain : "–");
  set("hrvVal", rec && rec.hrv != null ? rec.hrv : "–");
  set("rhrVal", rec && rec.rhr != null ? rec.rhr : "–");
  const amp = $("#recAmpel");
  if (amp && rec && rec.score != null) {
    const s = rec.score;
    amp.textContent = s >= 67 ? "🟢 erholt" : s >= 34 ? "🟡 mittel" : "🔴 niedrig";
  } else if (amp) amp.textContent = "";
  const rv = $("#recVal");
  if (rv && rec && rec.score != null) rv.style.color = rec.score >= 67 ? "var(--green)" : rec.score >= 34 ? "var(--gold)" : "var(--red)";
  // Verknüpfung Körper ↔ Ernährung
  let reco = "";
  if (rec && rec.score != null && rec.score < 34) reco = "Erholung niedrig — heute eher leichte Einheit, genug Eiweiß + Schlaf priorisieren.";
  else if (str && str.strain != null && str.strain >= 14) reco = "Hohe Belastung heute — achte auf ausreichend kcal + Eiweiß für die Regeneration.";
  else if (rec && rec.score != null && rec.score >= 67) reco = "Gut erholt — guter Tag für eine intensive Einheit.";
  set("whoopReco", reco);
  set("whoopTs", d.ts ? "Stand: " + new Date(d.ts).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "");
}

// ---------- boot ----------
function renderAll() { renderDiary(); renderSupps(); renderWeight(); renderPhotos(); fillGoals(); }
try {
  $("#datePicker").value = selDate;
  const vl = $("#verLine"); if (vl) vl.textContent = "FitTracker " + APP_VERSION;
  renderAll();
  maybeOnboard();
  // Rückkehr vom Whoop-Login → direkt zum Körper-Tab
  if (location.search.indexOf("whoop=ok") >= 0) {
    switchTab("body");
    try { history.replaceState(null, "", location.pathname); } catch {}
  }
} catch (e) {
  console.error(e);
  showErr("Fehler beim Start: " + (e && e.message ? e.message : e) + " — bitte Screenshot schicken.");
}
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
