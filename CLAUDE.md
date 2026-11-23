# MB FIT (Repo „fittracker“) — Kontext für Coding-Agenten

Marcos persönliche Fitness-App: Ernährung, Supplements, Wasser, Gewicht, Progress-Fotos, Journal und
Whoop-Körperdaten an einem Ort. Ein Nutzer (Marco), iPhone-Safari als Hauptgerät, Sprache Deutsch.

## Architektur
- **PWA, 100 % statisch** auf GitHub Pages (`https://mpb190799.github.io/fittracker/`, Branch `master`).
  Vanilla JS/HTML/CSS, kein Build, keine Frameworks. Dateien: `index.html`, `app.js`, `style.css`, `sw.js`.
- **Daten lokal**: `localStorage` Key `fittracker:db` (Form siehe `DEFAULT` in app.js) + IndexedDB für Fotos.
  Jede Änderung an der Datenform muss in `normalizeState()` abgesichert werden (alte Backups!).
- **Cloudflare Worker** `whoop-worker/` (`fittracker-whoop.mbcapitalstrategies.workers.dev`):
  Whoop-OAuth + Token-Refresh (KV `TOKENS`), `/whoop/today`, `/whoop/history`,
  `/food/search` (OFF-Proxy, wegen CORS), `/vision/food` (Foto-KI: primär Cloudflare Workers AI im
  eigenen Account, Binding `AI`, 10.000 Neurons/Tag gratis; Groq nur Notfall-Fallback ~0,1 Cent/Foto).
  Auth der App gegenüber dem Worker: Header `X-App-Token` = Secret `APP_TOKEN`.
  Secrets nur per `wrangler secret put` (`WHOOP_CLIENT_SECRET`, `APP_TOKEN`, `GROQ_API_KEY`), nie ins Repo.

## Regeln
- Alles, was lokal und kostenlos geht, direkt umsetzen. Alles mit laufenden Kosten (neue APIs, KI-Calls,
  bezahlte Dienste) vorher mit Marco abstimmen.
- Datenschutz ist ein Kernziel: keine neuen Drittanbieter ohne Rückfrage; Daten bleiben lokal.
- iOS-Safari-robust bleiben: kein `structuredClone` im Hot-Path, Fehler sichtbar über `#errbar`.
- Nur LESEN darf keinen State anlegen (Lehre aus Bug 11/2026: leere Journal-/Supplement-Tage verzerrten
  die Auswertungen). Schreib-Helfer: `jTodayW()`, `suppTakenMapW()`.
- Whoop-Tage: Zyklus = Einschlafen→Einschlafen; Zuordnung über `localDay()` im Worker, nie UTC-Datum.
- Bei jeder Änderung `APP_VERSION` (app.js) und `CACHE` (sw.js) hochzählen, sonst klebt die alte Version.
- Vision-Modelle verschwinden ohne Vorwarnung → Listen `CF_VISION_MODELS` (developers.cloudflare.com/workers-ai/models)
  und `GROQ_VISION_MODELS` (console.groq.com/docs/vision) prüfen; umstellbar per Worker-Variable
  `CF_VISION_MODEL` / `GROQ_VISION_MODEL`. Keine multimodalen Llama-Modelle (Meta-Lizenz schließt EU aus).
- Körper & Ziel (`bodyPlan`): Mifflin-St Jeor × Aktivitätsfaktor ± Tempo×7700/7. Tempo aus Zielgewicht-Richtung +
  Stufe (`CUT_MODES`/`BULK_MODES`, % Körpergewicht/Woche; Cut max. 1 kg/Woche). Untergrenze 1500 (Mann)/1200 (Frau)
  kcal; unter Grundumsatz nur Hinweis. Eiweiß bei Abnehmziel auf Zielgewicht bezogen.
- Ziel ist FETTabbau: Körperfett per US-Navy-Formel (`navyBf`, Bauch aus Gewicht-Eintrag `waistCm` + Hals im Profil)
  oder Waagenwert (`bfManual`). Körperfett-Ziel → Zielgewicht über fettfreie Masse (`goalW`). Anzeigen in kg Fett
  (1 kg Körperfett ≈ 7700 kcal).
- Sonderphasen (`state.phase`): Suppenwoche (kcal fix), Heilfasten Buchinger (1 Entlastungstag ≤1000, Fastentage
  250–500, 2 Aufbautage; >7 Tage nur mit Arzt-Hinweis), Intervallfasten 16:8 (Essensfenster). Phasentage zählen
  nicht in die Verbrauchsmessung (`adaptiveEstimate`).
- Eiweiß: g/kg × Basis (`proteinBasis`: current = Standard/Marcos Wunsch 2 g × aktuelles Gewicht, goal, lean).
- Ballaststoffe (DGE ≥ 30 g) und Zucker (Orientierung WHO < 10 % kcal) als optionale Felder `fiber`/`sugar` je Eintrag
  (OFF, lokale DB `LOCAL_FS`, Foto-KI); fehlende Angaben werden gezählt, nicht als 0 behandelt.
- „Was dir gut tut“ (`wellbeingInsights`): Merkmale von Tag D (Journal-Flags inkl. lesen/früh/handy, auto „spät
  gegessen“ aus Eintrags-Uhrzeit `at` ≥ 21:00, Supplements, Eiweiß/Zucker/Ballaststoffe/Wasser/über kcal) ↔ Schlaf
  & Erholung an D+1. Min. 3 Tage mit/ohne, ≥ 6 Nächte gesamt; Phasentage ausgenommen. Lebenskompass-Habits
  (Lesen, früh ins Bett) später per Sync statt Haken.
- Journal automatisch (`autoFlags`/`effFlags`): früh ins Bett (Whoop-Einschlafzeit der Folgenacht < 23:00), gut
  geschlafen (Schlaf ≥ 85 %), Kraft/Sport (Whoop-Workouts ≥ 15 min, Scope `read:workout`), Alkohol/Koffein ab 15 Uhr/
  spät gegessen aus Einträgen (Wortgrenzen ohne Lookbehind — älteres iOS-Safari!). Manuell (`journal[d].flags`,
  auch false) hat Vorrang.
- Whoop-Bonus (`whoopBonus`): Whoop-Tagesverbrauch über Plan-/Messverbrauch → 50 % davon ins Tagesziel (abschaltbar).
- Wochen-Check (`checkinSuggestion`): alle 7 Tage neues kcal-Ziel vorschlagen (Messung, sonst Formel).
- Backup (`doBackup`): Teilen-Menü (→ OneDrive), sonst Download; Erinnerung nach 7 Tagen (`fittracker:lastBackup`).
- Krafttraining/Sport = Journal-Flags `kraft`/`sport`, Karte „Training heute“ im Tagebuch.
- Kalorienziel-Automatik (`adaptiveEstimate`): Verbrauch = Ø kcal (Tage ≥ 800 kcal) − Gewichtstrend × 7700.
  Nie ohne genug Daten schätzen; Plausibilität 1200–6000 kcal und ≤ 2 kg/Woche Trend (Tippfehler-Schutz);
  Untergrenze 1500/1200 kcal wie im Plan.

## Design
- App-Name: **MB FIT** (Marcos Wahl 23.11.2026). Interne Keys (`fittracker:db`, Worker-Name) bleiben unverändert — sonst sind Daten/Whoop-Login weg.
- Markenwelt MB Capital: Gold `#D4AF37`, Dunkel `#080810`/`#0f0f1a`, Grün `#22c55e`, Rot `#ef4444`;
  Schriften Outfit (Text) + IBM Plex Mono (Zahlen), lokal in `fonts/` (kein Google-Fonts-Abruf).
- Ein Blickfang: Kompass-Zifferblatt im Tagebuch (außen kcal, innen Eiweiß). Rest ruhig halten:
  Überschriften in Satzschreibung (keine Großbuchstaben-Labels), Linien-Icons statt Emojis in der Navigation.
- App-Symbole: `python3 tools/make-icons.py` (Pillow) erzeugt icon-180/192/512.png; Favicon: `favicon.svg`.
- Farb-Variablen in `style.css :root`; app.js nutzt `var(--green|gold|red)` inline.

## Prüfen (Definition of Done)
```bash
node --check app.js && node --check whoop-worker/src/worker.js
node tests/worker.test.mjs                         # Worker-Logik, alles gemockt
python3 -m http.server 8099 & node tests/smoke.mjs # Browser-Smoke-Test (braucht playwright)
```
Läuft automatisch per GitHub Action `.github/workflows/check.yml` bei jedem Push.
Neue Bugs → zuerst einen Test schreiben, der ihn zeigt, dann fixen.

## Zusammenarbeit
- Andere Claude-Sitzungen (z. B. Lebenskompass) pushen ebenfalls auf `master` → vor jedem Push
  `git fetch --depth=50 origin master && git rebase origin/master`, Versionsnummern bei Konflikt hochzählen.
- Lebenskompass-Übergabe: Link `#toLK` → `lebenskompassLink()` (nur #-Teil der Adresse, kein Server).

## Deploy
- App: Push auf `master` → GitHub Pages.
- Worker: `cd whoop-worker && npx wrangler deploy` — oder automatisch per Action, sobald die
  Repo-Secrets `CLOUDFLARE_API_TOKEN` (+ `CLOUDFLARE_ACCOUNT_ID`) gesetzt sind.

## Roadmap (offen)
Siehe `PLAN.md`. Größter strategischer Punkt: Whoop langfristig durch eigenen Brustgurt (Polar H10)
ersetzen — Körper-Tab soll dann eine zweite Datenquelle bekommen, nicht nur Whoop.
