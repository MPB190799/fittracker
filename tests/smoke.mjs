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
(await page.textContent("#weightList")).includes("88.5") ? ok("Gewicht gespeichert") : fail("Gewicht fehlt");

errors.length ? fail("JS-Fehler: " + errors.join(" | ")) : ok("keine JS-Fehler");
await browser.close();
