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
await page.fill("#pGoalW", "80"); await page.dispatchEvent("#pGoalW", "change");
await page.click('#planModes .mode[data-mode="light"]');
const rate7 = await page.evaluate(() => planRate());
const adapt2 = await page.textContent("#adaptBox");
const exp7 = Math.round((3050 + rate7 * 1100) / 10) * 10;
const got7 = +(adapt2.match(/(\d{4})\s*Vorschlag/) || [])[1];
Math.abs(got7 - exp7) <= 10 && rate7 < 0 && (await page.evaluate(() => JSON.parse(localStorage.getItem("fittracker:db")).profile.goalMode)) === "light" ? ok(`Leichter Cut (${rate7} kg/Woche) → Vorschlag ${got7} kcal`) : fail("Adaptiv leicht: " + adapt2.slice(0, 160));
await page.click("#adaptApply");
(await page.evaluate(() => JSON.parse(localStorage.getItem("fittracker:db")).profile.kcalTarget)) === got7 ? ok("Vorschlag übernommen") : fail("nicht übernommen");

// 8) Körper & Ziel (Mifflin-St Jeor): 110 kg, 185 cm, Mann, Sitzjob + 1–3× Sport, Ziel 90 kg, −0,5 kg/Woche
await page.evaluate(() => { const db = JSON.parse(localStorage.getItem("fittracker:db")); db.weights.push({ id: "wx", date: new Date().toLocaleDateString("sv-SE"), kg: 110 }); localStorage.setItem("fittracker:db", JSON.stringify(db)); });
await page.reload();
await page.click('nav.tabs button[data-tab="goals"]');
await page.fill("#pHeight", "185"); await page.dispatchEvent("#pHeight", "change");
await page.fill("#pBirth", "1999"); await page.dispatchEvent("#pBirth", "change");
await page.selectOption("#pAct", "1.375");
await page.fill("#pGoalW", "90"); await page.dispatchEvent("#pGoalW", "change");
await page.click('#planModes .mode[data-mode="rec"]');
const age = new Date().getFullYear() - 1999, bmr = Math.round(10 * 110 + 6.25 * 185 - 5 * age + 5);
const rate8 = await page.evaluate(() => planRate());
const expKcal = Math.max(1500, Math.round((Math.round(bmr * 1.375) + rate8 * 1100) / 10) * 10);
const plan = await page.textContent("#planBox");
const num = +(plan.match(/([\d.]+)\s*kcal pro Tag/) || [])[1]?.replace(".", "");
num === expKcal && /220\s*Eiweiß/.test(plan) ? ok(`Empfohlener Cut (${rate8} kg/Woche): ${num} kcal, 220 g Eiweiß (2 g × 110 kg)`) : fail(`Plan: erwartet ${expKcal}: ` + plan.slice(0, 200));
await page.click("#planApply");
{ const kt = await page.evaluate(() => JSON.parse(localStorage.getItem("fittracker:db")).profile.kcalTarget); kt === expKcal ? ok("Plan als Tagesziel übernommen") : fail("Plan nicht übernommen: " + kt + " statt " + expKcal); }
// Stufen: Krass < Empfohlen < Leicht, und nie unter 1500 kcal
const kc = async (m) => { await page.click(`#planModes .mode[data-mode="${m}"]`); const t = await page.textContent("#planBox"); return +(t.match(/([\d.]+)\s*kcal pro Tag/) || [])[1]; };
const [kl, kr, kh] = [await kc("light"), await kc("rec"), await kc("hard")];
kh < kr && kr < kl ? ok(`Stufen: leicht ${kl} · empfohlen ${kr} · krass ${kh} kcal`) : fail(`Stufen falsch: ${kl}/${kr}/${kh}`);
await page.selectOption("#pAct", "1.2");
const plan2 = await page.textContent("#planBox");
const num2 = +(plan2.match(/([\d.]+)\s*kcal pro Tag/) || [])[1]?.replace(".", "");
num2 >= 1500 ? ok(`Untergrenze gehalten (${num2} kcal ≥ 1500)`) : fail("unter 1500: " + num2);

// 9) Körperfett (US-Navy): Quelle-Beispiel Bauch 102,1 / Hals 38,6 / 182,88 cm → 26,8 %
const navy = await page.evaluate(() => navyBf(102.1, 38.6, null, 182.88, "m"));
navy === 26.8 ? ok("US-Navy-Formel: 26,8 % (wie Referenz)") : fail("Navy: " + navy);
// Körperfett-Ziel → Zielgewicht aus fettfreier Masse, Anzeige in kg Fett
await page.click('nav.tabs button[data-tab="weight"]');
await page.fill("#weightInput", "110"); await page.fill("#waistInput", "118"); await page.click("#saveWeight");
await page.click('nav.tabs button[data-tab="goals"]');
await page.fill("#pNeck", "42"); await page.dispatchEvent("#pNeck", "change");
await page.fill("#pGoalBf", "15"); await page.dispatchEvent("#pGoalBf", "change");
const comp = await page.evaluate(() => ({ c: bodyComp(), g: goalW() }));
const expG = Math.round(comp.c.leanKg / 0.85 * 10) / 10;
comp.c && Math.abs(comp.g - expG) < 0.11 ? ok(`KF ${comp.c.bf} %, ${comp.c.fatKg} kg Fett → Ziel 15 % bei ≈ ${comp.g} kg`) : fail("KF-Ziel: " + JSON.stringify(comp));
const pt = await page.textContent("#planBox"), md = await page.textContent("#planModes");
/kg Fett pro Woche/.test(pt) && /noch [\d,]+ kg Fett/.test(pt) && /kg Fett\/Woche/.test(md) ? ok("Plan & Stufen zeigen Fett-Einheiten") : fail("Fett-Anzeige: " + pt.slice(0, 200));

// 10) Sonderphasen: Suppenwoche 1500 kcal; Heilfasten Tag 2 = Fastentag 500 kcal ohne Eiweiß-Ziel
await page.selectOption("#phType", "soup"); await page.fill("#phKcal", "1500"); await page.click("#phStartBtn");
await page.click('nav.tabs button[data-tab="diary"]');
(await page.textContent("#kcalSub")).trim().endsWith("/ 1500") && /Suppenwoche · Tag 1 von 7/.test(await page.textContent("#phaseBanner"))
  ? ok("Suppenwoche: Tagesziel 1500 kcal + Banner") : fail("Suppe: " + await page.textContent("#kcalSub"));
await page.evaluate(() => { state.phase = { type: "buchinger", start: dayOffset(today(), -1), days: 5, kcal: 500 }; persist(); renderAll(); });
(await page.textContent("#kcalSub")).trim().endsWith("/ 500") && (await page.textContent("#protSub")).includes("Fastentag")
  ? ok("Heilfasten: Fastentag 500 kcal, kein Eiweiß-Ziel") : fail("Buchinger: " + await page.textContent("#kcalSub") + " | " + await page.textContent("#protSub"));
await page.evaluate(() => { state.phase = { type: "buchinger", start: dayOffset(today(), -6), days: 5, kcal: 500 }; persist(); renderAll(); });
/Aufbautag 1 von 2/.test(await page.textContent("#phaseBanner")) ? ok("Heilfasten: Aufbautage automatisch geplant") : fail("Aufbau: " + await page.textContent("#phaseBanner"));

// 11) Backup-Erinnerung → sichern → verschwindet (ohne Teilen-Menü: Download)
await page.evaluate(() => { state.phase = null; persist(); localStorage.removeItem("fittracker:lastBackup"); renderAll(); });
await page.click('nav.tabs button[data-tab="diary"]');
const hasBk = await page.$("#bkNow");
const dl = page.waitForEvent("download").catch(() => null);
if (hasBk) await page.click("#bkNow");
await dl;
hasBk && (await page.evaluate(() => localStorage.getItem("fittracker:lastBackup"))) === (await page.evaluate(() => today())) && !(await page.$("#bkNow"))
  ? ok("Backup-Erinnerung → gesichert → Erinnerung weg") : fail("Backup-Flow");

// 11b) Gewichtssprung (88 → 110 kg) darf keine absurde Verbrauchsschätzung liefern
const adj = await page.evaluate(() => adaptiveEstimate());
!adj.ok || (adj.tdee >= 1200 && adj.tdee <= 6000) ? ok("Unplausibler Gewichtssprung → keine falsche Schätzung") : fail("Adaptiv absurd: " + adj.tdee);

// 12) Whoop-Bonus: Whoop-Verbrauch 600 über Plan → +300 kcal im Tagesziel
const bon = await page.evaluate(() => { const t = tdeeRef(); state.bodyLog[today()] = { kcalBurn: t + 600 }; state.profile.whoopBonus = true; persist(); renderAll(); return { t, kT: state.profile.kcalTarget }; });
const sub12 = (await page.textContent("#kcalSub")).trim();
sub12.endsWith("/ " + (bon.kT + 300)) && /\+300/.test(await page.textContent("#bonusLine")) ? ok(`Whoop-Bonus: +300 kcal (Ziel ${bon.kT + 300})`) : fail("Bonus: " + sub12);
await page.evaluate(() => { state.bodyLog = {}; persist(); renderAll(); });

// 13) Krafttraining antippen → Journal-Flag + Wochenzähler
await page.click('#trainChips .chip:has-text("Krafttraining")');
(await page.evaluate(() => state.journal[today()].flags.kraft)) === true && /1× Kraft/.test(await page.textContent("#trainWeek"))
  ? ok("Krafttraining geloggt, Wochenzähler 1×") : fail("Training");

// 14) Wochen-Check: Vorschlag weicht ab → Banner → übernehmen
const ci = await page.evaluate(() => { state.profile.lastCheckin = null; state.profile.kcalTarget = 3333; persist(); renderAll(); return checkinSuggestion(); });
if (ci && await page.$("#ciApply")) { await page.click("#ciApply"); }
ci && (await page.evaluate(() => state.profile.kcalTarget)) === ci.kcal && !(await page.$("#ciApply"))
  ? ok(`Wochen-Check: ${ci.kcal} kcal vorgeschlagen und übernommen`) : fail("Check-in: " + JSON.stringify(ci));

// 15) Eiweiß-Basis umschaltbar: Zielgewicht → weniger als bei aktuellem Gewicht
const pCur = await page.evaluate(() => proteinTarget());
await page.click('nav.tabs button[data-tab="goals"]'); await page.selectOption("#goalProtBasis", "goal");
const pGoal = await page.evaluate(() => proteinTarget());
pCur === Math.round(2 * (await page.evaluate(() => latestWeight()))) && pGoal < pCur ? ok(`Eiweiß: ${pCur} g (aktuelles Gewicht) / ${pGoal} g (Zielgewicht)`) : fail(`Eiweiß-Basis ${pCur}/${pGoal}`);
await page.selectOption("#goalProtBasis", "current");

// 16) Ballaststoffe & Zucker + Uhrzeit beim Eintragen
await page.click('nav.tabs button[data-tab="diary"]');
await page.evaluate(() => { state.entries = state.entries.filter(e => e.date !== today()); persist(); renderAll(); });
await page.click("#fab"); await page.fill("#searchInput", "haferflo"); await page.waitForSelector("#results .res"); await page.click("#results .res");
await page.click("#saveEntry");
const fi = (await page.textContent("#fiVal")).trim(), su = (await page.textContent("#suVal")).trim(), at = await page.evaluate(() => state.entries.find(e => e.date === today()).at);
fi === "10" && su === "1" && /^\d\d:\d\d$/.test(at || "") ? ok(`Haferflocken 100 g: 10 g Ballaststoffe, 1 g Zucker, Uhrzeit ${at}`) : fail(`Ballast/Zucker ${fi}/${su}/${at}`);

// 17) „Was dir gut tut“: Lesen am Abend ↔ Schlaf in der Nacht danach (nicht am selben Tag!)
await page.evaluate(() => {
  state.journal = {}; state.bodyLog = {}; state.suppLog = {}; state.phase = null;
  for (let i = 1; i <= 12; i++) {
    const d = dayOffset(today(), -i - 1), next = dayOffset(d, 1), reads = i % 2 === 0;
    state.journal[d] = { flags: { lesen: reads, alkohol: !reads && i % 3 === 0 }, mood: 0, note: "" };
    state.bodyLog[next] = { sleepPerf: reads ? 90 : 74, recovery: reads ? 70 : 58 };
  }
  persist();
});
await page.click('nav.tabs button[data-tab="body"]'); await page.waitForTimeout(300);
await page.evaluate(() => renderInsights());
const ins = await page.textContent("#insights");
/Tut dir gut[\s\S]*Gelesen[\s\S]*Schlaf \+16 %/.test(ins) ? ok("Auswertung: Lesen → Schlaf +16 % in der Nacht danach") : fail("Insights: " + ins.slice(0, 220));

// 18) Foto-Prüfliste: 3 Zutaten erkannt → Mais raus, Reis +1 Schritt → übernehmen
await page.route("**/vision/food", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, model: "test",
  items: [ { name: "Reis", grams: 200, kcal: 260, protein: 5, carbs: 56, fat: 1, fiber: 1, sugar: 0, confidence: 0.9 },
           { name: "Hähnchen", grams: 150, kcal: 248, protein: 46, carbs: 0, fat: 5, confidence: 0.85 },
           { name: "Mais", grams: 50, kcal: 43, protein: 1.6, carbs: 9.5, fat: 0.6, confidence: 0.4 } ], note: "" }) }));
await page.evaluate(() => { localStorage.setItem("fittracker:whoopkey", "test"); state.entries = state.entries.filter(e => e.date !== today()); persist(); renderAll(); });
await page.click('nav.tabs button[data-tab="diary"]'); await page.click("#fab");
await page.setInputFiles("#foodPhotoInput", new URL("./meal.jpg", import.meta.url).pathname);
await page.waitForSelector(".vrow");
await page.click('.vrow:has(input[value="Mais"]) .vdel');
await page.click('.vrow:has(input[value="Reis"]) .vplus');
const btn = await page.textContent("#visionAddAll");
await page.click("#visionAddAll");
const ve = await page.evaluate(() => state.entries.filter(e => e.date === today()).map(e => [e.name, e.grams, e.kcal]));
const reis = ve.find(x => x[0] === "Reis");
ve.length === 2 && reis && reis[1] === 250 && reis[2] === 325 && /573 kcal/.test(btn)
  ? ok("Foto-Prüfliste: Mais entfernt, Reis 250 g / 325 kcal, 2 Einträge übernommen") : fail("Prüfliste: " + JSON.stringify(ve) + " | " + btn);

// 19) Journal automatisch: Whoop (Einschlafen, Workout) + Einträge (Alkohol, Koffein spät) — ohne Fehlalarme
const af = await page.evaluate(() => {
  const d = dayOffset(today(), -3), n = dayOffset(d, 1);
  state.journal = {}; state.bodyLog[d] = { workouts: [{ sport: "Weightlifting", min: 60, strain: 9 }, { sport: "Badminton", min: 90, strain: 12 }] };
  state.bodyLog[n] = { bed: "22:30", sleepPerf: 88 };
  state.entries = state.entries.filter(e => e.date !== d).concat([
    { id: "a1", date: d, meal: "abend", name: "Rotwein", grams: 200, kcal: 170, protein: 0, carbs: 5, fat: 0, at: "20:00" },
    { id: "a2", date: d, meal: "mittag", name: "Schweinebraten", grams: 200, kcal: 400, protein: 40, carbs: 0, fat: 25, at: "12:00" },
    { id: "a3", date: d, meal: "snack", name: "Espresso", grams: 30, kcal: 1, protein: 0, carbs: 0, fat: 0, at: "16:10" },
    { id: "a4", date: d, meal: "snack", name: "Tomate", grams: 100, kcal: 18, protein: 1, carbs: 4, fat: 0, at: "17:00" } ]);
  persist(); return effFlags(d);
});
af.frueh && af.gut && af.kraft && af.sport && af.alkohol && af.koffein && !af.spaet ? ok("Auto-Journal: früh ins Bett, gut geschlafen, Kraft, Sport, Alkohol, Koffein spät erkannt") : fail("Auto: " + JSON.stringify(af));
const noFalse = await page.evaluate(() => { const d = dayOffset(today(), -4); state.entries.push({ id: "b1", date: d, meal: "mittag", name: "Schweinebraten mit Tomate und Käseplatte", grams: 300, kcal: 600, protein: 40, carbs: 10, fat: 40, at: "18:00" }); return effFlags(d); });
!noFalse.alkohol && !noFalse.koffein ? ok("Keine Fehlalarme (Schweinebraten, Tomate, Käseplatte)") : fail("Fehlalarm: " + JSON.stringify(noFalse));
// Manuelles Überschreiben: Krafttraining war auto an → antippen → aus
await page.evaluate(() => { selDate = dayOffset(today(), -3); refreshDate(); });
await page.click('nav.tabs button[data-tab="body"]');
await page.click('#jflags .chip:has-text("Krafttraining")');
(await page.evaluate(() => effFlags(dayOffset(today(), -3)).kraft)) === false ? ok("Antippen überschreibt Automatik") : fail("Override");
await page.evaluate(() => { selDate = today(); refreshDate(); });

// 20) Fortschrittsfotos: Pose „Rücken“, zwei Fotos an zwei Tagen → Vorher/Nachher + KI-Vergleich (simuliert)
await page.route("**/vision/compare", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, summary: "Taille wirkt schmaler.", changes: [{ area: "Taille", text: "sichtbar schmaler", trend: "besser" }], note: "" }) }));
await page.click('nav.tabs button[data-tab="photos"]');
await page.click('#poseChips .chip:has-text("Rücken")');
await page.evaluate(() => { selDate = dayOffset(today(), -42); refreshDate(); });
await page.setInputFiles("#photoInput", new URL("./body1.jpg", import.meta.url).pathname);
await page.waitForFunction(() => state.photos.some(p => p.pose === "back"));
await page.evaluate(() => { selDate = today(); refreshDate(); });
await page.setInputFiles("#photoInput", new URL("./body2.jpg", import.meta.url).pathname);
await page.waitForFunction(() => state.photos.filter(p => p.pose === "back").length === 2);
await page.waitForSelector("#cmpCard", { state: "visible" });
await page.fill("#cmpRange", "30"); await page.dispatchEvent("#cmpRange", "input");
const clip = await page.$eval("#cmpImgB", (e) => e.style.clipPath);
/42 Tage dazwischen/.test(await page.textContent("#cmpInfo")) && clip.includes("30%") ? ok("Vorher/Nachher: 42 Tage, Regler funktioniert") : fail("Vergleich: " + clip);
await page.click("#aiCmpBtn");
await page.waitForSelector(".ai-cmp");
/Taille/.test(await page.textContent("#aiCmpBox")) ? ok("KI-Vergleich angezeigt (nach Rückfrage)") : fail("KI-Vergleich");

// 21) Waagen-Körperfett beim Wiegen
await page.click('nav.tabs button[data-tab="weight"]');
await page.fill("#weightInput", "109.6"); await page.fill("#bfScaleInput", "31.5"); await page.click("#saveWeight");
/Waage 31,5 % KF/.test(await page.textContent("#weightList")) ? ok("Waagen-KF gespeichert und angezeigt") : fail("Waage-KF");

errors.length ? fail("JS-Fehler: " + errors.join(" | ")) : ok("keine JS-Fehler");
await browser.close();
