// Smoke-Test: lädt die App headless, prüft dass nichts crasht und die Kernlogik stimmt.
// Lokal:  python3 -m http.server 8099 &  node tests/smoke.mjs
// CI:     siehe .github/workflows/check.yml
import { chromium } from "playwright";
const BASE = process.env.BASE || "http://localhost:8099/";
const fail = (m) => { console.error("❌ " + m); process.exitCode = 1; };
const ok = (m) => console.log("✅ " + m);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("dialog", (d) => d.accept(d.defaultValue())); // prompt/confirm/alert mit Standardwert bestätigen
page.on("pageerror", (e) => errors.push(e.message));
// Fremd-Requests (CDN, OFF, Worker) blocken → Test läuft offline + deterministisch
await page.route(/^(?!http:\/\/localhost)/, (r) => r.abort());
await page.goto(BASE);
await page.evaluate(() => { localStorage.clear(); localStorage.setItem("fittracker:onboarded", "1"); });
await page.reload();

// 1) Boot ohne Fehlerbanner
const err = await page.$eval("#errbar", (e) => getComputedStyle(e).display);
err === "none" ? ok("App startet ohne Fehler") : fail("Fehlerbanner sichtbar: " + (await page.textContent("#errbar")));

// 2) Eintrag über lokale Suche
await page.click("#fab");
await page.fill("#searchInput", "magerq");
await page.waitForSelector("#results .res");
await page.click("#results .res");
await page.fill("#fGrams", "250"); await page.dispatchEvent("#fGrams", "input");
await page.click("#saveEntry");
const sub = await page.textContent("#kcalSub");
sub.startsWith("168 /") ? ok("Magerquark 250 g = 168 kcal") : fail("kcal falsch: " + sub);

// 3) Durchblättern legt keine leeren Journal-/Supplement-Tage an (Insight-Verzerrung)
await page.click("#prevDay"); await page.click("#prevDay");
await page.click('nav.tabs button[data-tab="body"]');
await page.click('nav.tabs button[data-tab="supps"]');
const st = await page.evaluate(() => JSON.parse(localStorage.getItem("fittracker:db")));
Object.keys(st.journal).length === 0 && Object.keys(st.suppLog).length === 0
  ? ok("Keine Geister-Einträge beim Blättern") : fail("leere Tage angelegt: " + JSON.stringify([st.journal, st.suppLog]));

// 4) Supplement abhaken + wieder abhaken → Tag verschwindet wieder
await page.click("#suppList .supp .chk");
await page.click("#suppList .supp .chk");
const st2 = await page.evaluate(() => JSON.parse(localStorage.getItem("fittracker:db")));
Object.keys(st2.suppLog).length === 0 ? ok("Supplement an/aus sauber") : fail("suppLog: " + JSON.stringify(st2.suppLog));

// 5) Gewicht + Chart
await page.click('nav.tabs button[data-tab="weight"]');
await page.fill("#weightInput", "88.5"); await page.click("#saveWeight");
(await page.textContent("#weightList")).includes("88,5") ? ok("Gewicht gespeichert") : fail("Gewicht fehlt");

// 6) Vorlage: Frühstück speichern → an anderem Tag mit 1 Tipp einfügen
await page.click('nav.tabs button[data-tab="diary"]');
await page.evaluate(() => { document.querySelector("#datePicker").value = new Date().toISOString().slice(0,10); document.querySelector("#datePicker").dispatchEvent(new Event("change")); });
await page.click(".tplsave");
await page.click("#nextDay");
await page.click("#fab");
await page.waitForSelector("#tplChips .chip");
await page.click("#tplChips .chip");
const st3 = await page.evaluate(() => JSON.parse(localStorage.getItem("fittracker:db")));
st3.templates.length === 1 && st3.entries.length === 2 && st3.entries[0].date !== st3.entries[1].date
  ? ok("Vorlage speichern + mit 1 Tipp einfügen") : fail("Vorlage: " + JSON.stringify([st3.templates.length, st3.entries.map(e => e.date)]));

// 7) Kalorienziel: 2500 kcal/Tag gegessen, −0,5 kg/Woche → Verbrauch ≈ 3050, Vorschlag bei „halten“ ≈ 3050
await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem("fittracker:db"));
  const d0 = new Date(); db.entries = []; db.weights = [];
  for (let i = 1; i <= 21; i++) {
    const d = new Date(d0); d.setDate(d.getDate() - i); const ds = d.toLocaleDateString("sv-SE");
    db.entries.push({ id: "e" + i, date: ds, meal: "mittag", name: "x", grams: 100, kcal: 2500, protein: 0, carbs: 0, fat: 0 });
    if (i % 3 === 0) db.weights.push({ id: "w" + i, date: ds, kg: 90 - (21 - i) / 14 });
  }
  db.weights.sort((a, b) => a.date.localeCompare(b.date)); db.profile.goalRate = 0;
  localStorage.setItem("fittracker:db", JSON.stringify(db));
});
await page.reload();
await page.click('nav.tabs button[data-tab="goals"]');
const adapt = await page.textContent("#adaptBox");
const m = adapt.match(/(\d{4})\s*Verbrauch/);
m && Math.abs(+m[1] - 3050) <= 20 ? ok("Kalorienziel: Verbrauch " + m[1] + " kcal (erwartet ≈3050)") : fail("Adaptiv: " + adapt.slice(0, 160));
await page.selectOption("#goalRate", "-0.5");
const adapt2 = await page.textContent("#adaptBox");
/2500\s*Vorschlag/.test(adapt2) ? ok("−0,5 kg/Woche → Vorschlag 2500 kcal") : fail("Adaptiv −0,5: " + adapt2.slice(0, 160));
await page.click("#adaptApply");
(await page.evaluate(() => JSON.parse(localStorage.getItem("fittracker:db")).profile.kcalTarget)) === 2500 ? ok("Vorschlag übernommen") : fail("nicht übernommen");

errors.length ? fail("JS-Fehler: " + errors.join(" | ")) : ok("keine JS-Fehler");
await browser.close();
