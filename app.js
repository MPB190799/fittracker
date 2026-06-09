// FitTracker — 100% client-side (GitHub Pages). Daten im Browser: localStorage + IndexedDB (Fotos).
const $ = (s) => document.querySelector(s);
const today = () => new Date().toISOString().slice(0, 10);
const MEALS = { fruehstueck: "Frühstück", mittag: "Mittag", abend: "Abend", snack: "Snack" };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id" + Date.now() + Math.random().toString(16).slice(2));

const DEFAULT = { profile: { kcalTarget: 2200, proteinPerKg: 2.0, carbTarget: 220, fatTarget: 70 }, entries: [], weights: [], photos: [] };
const LS_KEY = "fittracker:db";

let state = load();
let selDate = today();
let per100 = null;

// ---------- persistence ----------
function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return structuredClone(DEFAULT);
    const db = JSON.parse(raw);
    return { ...structuredClone(DEFAULT), ...db, profile: { ...DEFAULT.profile, ...(db.profile || {}) } };
  } catch { return structuredClone(DEFAULT); }
}
function persist() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }

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

// ---------- render diary ----------
function renderSummary() {
  const es = dayEntries();
  const sum = es.reduce((a, e) => ({ kcal: a.kcal + e.kcal, p: a.p + e.protein, c: a.c + e.carbs, f: a.f + e.fat }), { kcal: 0, p: 0, c: 0, f: 0 });
  const pT = proteinTarget();
  const set = (id, v) => $("#" + id).textContent = v;
  set("kcalVal", Math.round(sum.kcal)); set("pVal", Math.round(sum.p)); set("cVal", Math.round(sum.c)); set("fVal", Math.round(sum.f));
  $("#kcalTgt").textContent = "/ " + state.profile.kcalTarget;
  $("#pTgt").textContent = pT ? "/ " + pT : "(Gewicht?)";
  $("#cTgt").textContent = "/ " + state.profile.carbTarget;
  $("#fTgt").textContent = "/ " + state.profile.fatTarget;
  const bar = (id, val, tgt) => {
    const el = $("#" + id);
    el.style.width = (tgt ? Math.min(100, (val / tgt) * 100) : 0) + "%";
    el.parentElement.parentElement.querySelector(".val").classList.toggle("over", tgt && val > tgt);
  };
  bar("kcalBar", sum.kcal, state.profile.kcalTarget);
  bar("pBar", sum.p, pT || 0);
  bar("cBar", sum.c, state.profile.carbTarget);
  bar("fBar", sum.f, state.profile.fatTarget);
}
function renderMeals() {
  const es = dayEntries();
  const card = $("#mealsCard");
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

// ---------- add/edit sheet ----------
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
  showSheet(true);
}
function showSheet(on) {
  $("#sheetBg").classList.toggle("show", on);
  $("#addSheet").classList.toggle("show", on);
  if (!on) stopScan();
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
$("#searchInput").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (q.length < 2) { $("#results").innerHTML = ""; return; }
  searchTimer = setTimeout(() => offSearch(q), 350);
});
async function offSearch(q) {
  $("#results").innerHTML = `<div class="empty">Suche…</div>`;
  try {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&fields=product_name,brands,nutriments,code`;
    const data = await (await fetch(url)).json();
    renderResults((data.products || []).map(parseOFF).filter(Boolean));
  } catch { $("#results").innerHTML = `<div class="empty">Suche fehlgeschlagen (offline?).</div>`; }
}
function parseOFF(p) {
  const n = p.nutriments || {};
  const name = [p.product_name, p.brands].filter(Boolean).join(" · ").trim();
  if (!name) return null;
  const kcal = n["energy-kcal_100g"] ?? (n["energy_100g"] ? n["energy_100g"] / 4.184 : null);
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
    d.innerHTML = `<div class="nm">${esc(it.name)}</div><div class="sub">${Math.round(it.per100.kcal)} kcal · ${round1(it.per100.protein)}P /100g</div>`;
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
$("#fGrams").addEventListener("input", applyPer100);
for (const id of ["fKcal", "fProtein", "fCarbs", "fFat"]) {
  $("#" + id).addEventListener("input", () => { per100 = null; $("#per100hint").textContent = ""; });
}

// ---------- Barcode ----------
let scanner = null;
$("#scanBtn").onclick = () => scanner ? stopScan() : startScan();
async function startScan() {
  if (!window.Html5Qrcode) return alert("Scanner lädt noch — kurz warten.");
  if (!window.isSecureContext) { alert("Kamera-Scan braucht HTTPS. Auf der GitHub-Pages-URL (https://…) funktioniert es."); return; }
  $("#reader").style.display = "block";
  $("#scanBtn").textContent = "⏹ Scan stoppen";
  scanner = new Html5Qrcode("reader");
  try {
    await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 150 } },
      async (code) => { await stopScan(); await barcodeLookup(code); }, () => {});
  } catch (e) { alert("Kamera nicht verfügbar: " + e); stopScan(); }
}
async function stopScan() {
  $("#scanBtn") && ($("#scanBtn").textContent = "📷 Barcode scannen");
  $("#reader") && ($("#reader").style.display = "none");
  if (scanner) { try { await scanner.stop(); scanner.clear(); } catch {} scanner = null; }
}
async function barcodeLookup(code) {
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,nutriments`;
    const data = await (await fetch(url)).json();
    if (data.status !== 1) return alert("Barcode nicht in der Datenbank — bitte manuell eintragen.");
    const it = parseOFF(data.product);
    if (it) pickFood(it); else alert("Keine Nährwerte zu diesem Produkt — manuell eintragen.");
  } catch { alert("Lookup fehlgeschlagen."); }
}

// ---------- save entry ----------
$("#saveEntry").onclick = () => {
  const e = {
    date: selDate, meal: $("#mealSelect").value, name: $("#fName").value.trim(),
    grams: Math.max(0, Number($("#fGrams").value) || 0), kcal: Math.max(0, Math.round(Number($("#fKcal").value) || 0)),
    protein: Math.max(0, round1(Number($("#fProtein").value) || 0)), carbs: Math.max(0, round1(Number($("#fCarbs").value) || 0)), fat: Math.max(0, round1(Number($("#fFat").value) || 0))
  };
  if (!e.name) return alert("Name fehlt.");
  const id = $("#editId").value;
  if (id) { const ex = state.entries.find(x => x.id === id); if (ex) Object.assign(ex, e); }
  else state.entries.push({ id: uid(), ...e });
  persist(); showSheet(false); renderDiary();
};
$("#closeSheet").onclick = () => showSheet(false);
$("#sheetBg").onclick = () => showSheet(false);

// ---------- weight ----------
$("#saveWeight").onclick = () => {
  const kg = Number($("#weightInput").value);
  if (!kg) return alert("Gewicht eingeben.");
  state.weights = state.weights.filter(w => w.date !== selDate);
  state.weights.push({ id: uid(), date: selDate, kg });
  state.weights.sort((a, b) => a.date.localeCompare(b.date));
  persist(); $("#weightInput").value = ""; renderWeight(); renderSummary(); fillGoals();
};
function renderWeight() {
  const list = $("#weightList"); list.innerHTML = "";
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
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = 160;
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
$("#addPhoto").onclick = () => $("#photoInput").click();
$("#photoInput").onchange = async (e) => {
  const file = e.target.files[0]; if (!file) return;
  const dataUrl = await resizeImage(file, 1280, 0.82);
  const id = uid();
  await idbPut(id, dataUrl);
  state.photos.push({ id, date: selDate, note: "" });
  state.photos.sort((a, b) => a.date.localeCompare(b.date));
  persist(); e.target.value = ""; switchTab("photos"); renderPhotos();
};
function resizeImage(file, maxDim, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img;
      if (Math.max(w, h) > maxDim) { const s = maxDim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.src = URL.createObjectURL(file);
  });
}
async function renderPhotos() {
  const grid = $("#photoGrid"); grid.innerHTML = "";
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
$("#saveGoals").onclick = () => {
  Object.assign(state.profile, {
    kcalTarget: Number($("#goalKcal").value) || 0, proteinPerKg: Number($("#goalProteinPerKg").value) || 2,
    carbTarget: Number($("#goalCarb").value) || 0, fatTarget: Number($("#goalFat").value) || 0
  });
  persist(); renderDiary(); fillGoals(); alert("Ziele gespeichert.");
};

// ---------- backup export / import ----------
$("#exportBtn").onclick = async () => {
  const photos = {};
  for (const p of state.photos) { const url = await idbGet(p.id); if (url) photos[p.id] = url; }
  const blob = new Blob([JSON.stringify({ v: 1, state, photos }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `fittracker-backup-${today()}.json`;
  a.click();
};
$("#importBtn").onclick = () => $("#importFile").click();
$("#importFile").onchange = async (e) => {
  const file = e.target.files[0]; if (!file) return;
  if (!confirm("Backup einspielen? Überschreibt aktuelle Daten auf diesem Gerät.")) { e.target.value = ""; return; }
  try {
    const data = JSON.parse(await file.text());
    if (!data.state) throw new Error("kein gültiges Backup");
    state = { ...structuredClone(DEFAULT), ...data.state, profile: { ...DEFAULT.profile, ...(data.state.profile || {}) } };
    persist();
    for (const [id, url] of Object.entries(data.photos || {})) await idbPut(id, url);
    renderAll(); alert("Backup eingespielt.");
  } catch (err) { alert("Import fehlgeschlagen: " + err.message); }
  e.target.value = "";
};

// ---------- tabs & date ----------
document.querySelectorAll("nav.tabs button").forEach(b => b.onclick = () => switchTab(b.dataset.tab));
function switchTab(tab) {
  document.querySelectorAll("nav.tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tabpage").forEach(p => p.classList.toggle("active", p.id === "tab-" + tab));
  if (tab === "weight") drawWeightChart();
  if (tab === "photos") renderPhotos();
}
$("#datePicker").value = selDate;
$("#datePicker").onchange = (e) => { selDate = e.target.value || today(); renderDiary(); };
$("#prevDay").onclick = () => shiftDay(-1);
$("#nextDay").onclick = () => shiftDay(1);
function shiftDay(d) {
  const dt = new Date(selDate); dt.setDate(dt.getDate() + d);
  selDate = dt.toISOString().slice(0, 10);
  $("#datePicker").value = selDate; renderDiary();
}

// ---------- boot ----------
function renderAll() { renderDiary(); renderWeight(); renderPhotos(); fillGoals(); }
renderAll();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
