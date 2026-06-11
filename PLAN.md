# FitTracker — Master-Plan „Alles in einem, einwandfrei & schön"

Stand: 2026-06-11 · Repo: `MPB190799/fittracker` (branch `master`) · Live: https://mpb190799.github.io/fittracker/

Ziel (Marco): Eine App, die **komplett funktioniert**, **sehr gut aussieht (UX)**, **sich flüssig bedienen lässt**, in der man **problemlos scannt und das Produkt gefunden wird** ODER **schnell nach Lebensmittel sucht + Menge eingibt**, und in der zusätzlich **Whoop-Daten** landen — damit alles an einem Ort ist.

---

## 0. Architektur-Entscheidung (zuerst, weil sie alles trägt)

Heute: 100 % statische PWA auf GitHub Pages, Daten nur lokal im Browser. Das ist gut für Essen/Supplements/Gewicht/Fotos — aber **Whoop geht so nicht** (OAuth-Secret + Token-Refresh + kein Browser-CORS).

**Entscheidung: dünnes Backend = 1 Cloudflare Worker** (du hast Cloudflare schon).
- Worker hält `client_secret`, macht OAuth-Token-Austausch, speichert die (rotierenden) Whoop-Refresh-Tokens in **Workers KV**, und bietet 2-3 schlanke Endpunkte: `/auth/start`, `/auth/callback`, `/whoop/today` (liefert Recovery/Sleep/Strain als sauberes JSON an die PWA).
- Die PWA bleibt statisch auf Pages; sie ruft nur den Worker. Essen/Supplements/Gewicht bleiben **lokal** (Privatsphäre, offline).
- Kosten: Cloudflare-Free-Tier reicht locker (1 Nutzer).

**Marco-Gates (nur du kannst das):**
1. Whoop-Developer-App anlegen auf developer.whoop.com → `client_id` + `client_secret` + Redirect-URI (= Worker-Callback). Scopes: `read:recovery read:sleep read:cycles read:profile`.
2. Whoop-Account einmal autorisieren (OAuth-Login).
3. Cloudflare-Worker-Deploy freigeben (ich baue ihn, du bestätigst Deploy/Secrets — analog eurer Infra-Gates).

---

## Phase 1 — Scannen & Suche „einwandfrei" (höchste Alltagspriorität)

**1a. Barcode-Scan iPhone-fest**
- `html5-qrcode` behalten, aber: Kamera-Auswahl Rückkamera erzwingen, `playsinline`, Torch/Zoom wenn verfügbar, klarer Status („Halte den Barcode in den Rahmen").
- Fallback-Kette: Scan → wenn Produkt nicht in OFF → automatisch zweite Quelle (siehe 1c) → sonst „manuell eintragen" mit vorausgefülltem Namen.
- ✅ schon live: manuelle EAN-Eingabe als Sicherheitsnetz.
- Akzeptanz: 9 von 10 deutschen Supermarkt-Barcodes werden gefunden ODER sauberer Fallback ohne Sackgasse.

**1b. Suche schnell + treffsicher**
- Debounce 300 ms, Abbruch alter Requests, Skeleton-Ladezustand.
- Deutsche Namen bevorzugt (`lc=de`, ✅ live), Marken anzeigen, pro Treffer Portionsgröße wenn vorhanden.
- **Zuletzt benutzt / Favoriten**: häufig gegessene Lebensmittel oben als 1-Tap-Chips (lokal gelernt) → das ist der eigentliche Speed-Hebel im Alltag.
- „Eigene Lebensmittel"-Bibliothek: einmal angelegt (z. B. „Mein Proteinshake"), danach 1-Tap.

**1c. Datenquelle robuster**
- Primär Open Food Facts (frei). 503-Lastfehler abgefangen (✅ `sort_by` entfernt).
- Optional zweite Quelle für Lücken (z. B. FoodRepo/USDA FDC) hinter demselben Worker, damit kein zweiter API-Key im Browser liegt.
- Mengen-Eingabe verbessern: Schnell-Buttons (½, 1, 2 Portionen; 100 g; „Stück"), Gramm↔Portion-Umschalter.

---

## Phase 2 — UX & Design „sehr gut aussehen + flüssig bedienen"

- **Visueller Refresh**: konsistente Spacing-Skala, größere Touch-Targets (≥44 px), Tagesfortschritt als Ringe (kcal/Protein) statt nur Balken, sanfte Übergänge, Haptik-freundliche Buttons.
- **Bedien-Flow**: ein zentraler „+"-FAB (schnell-hinzufügen), Bottom-Sheet mit Tabs „Scan | Suche | Manuell | Favoriten" statt langem Formular.
- **Tagesbild auf einen Blick**: oben „Rest heute" (✅ live) + darunter Recovery-Ampel (aus Whoop, Phase 3).
- **Dunkel/Hell**, Brand-Gold beibehalten, Safe-Area iPhone (✅ vorhanden), Pull-to-refresh.
- **Onboarding** (erststart): Ziel-Setup in 3 Schritten (Gewicht → Ziel-kcal/Protein → fertig).
- Akzeptanz: Hinzufügen eines gescannten Produkts in ≤3 Taps; nichts hakt/ruckelt auf iPhone-Safari.

---

## Phase 3 — Whoop-Integration (das „alles in einem")

- Cloudflare Worker (siehe Phase 0) mit OAuth-Flow + KV-Token-Store + rotierendem Refresh.
- PWA-Tab/Karte **„Körper"**: heutige **Recovery %** (Ampel grün/gelb/rot), **Schlaf** (Dauer + Performance %), **Strain** (Tages-Belastung), **Ruhepuls/HRV**.
- Hinweis-Logik: Recovery erst nach abgeschlossenem Schlafzyklus verfügbar, Strain final erst nach Mitternacht → UI zeigt „wird aktualisiert".
- **Verknüpfung Whoop ↔ Ernährung** (der eigentliche Mehrwert): bei hohem Strain → höhere kcal/Protein-Empfehlung des Tages; Recovery-Trend neben Gewicht-/kcal-Trend.
- Webhooks optional (Worker empfängt Whoop-Updates) — später; v1 reicht Pull beim App-Start + Pull-to-refresh.
- Akzeptanz: Nach einmaligem Login erscheinen Recovery/Schlaf/Strain automatisch, ohne erneutes Einloggen (Token-Refresh im Worker).

---

## Phase 4 — Reliabilität, Daten-Sicherheit, PWA

- **Auto-Backup**: wöchentliche Erinnerung + optional verschlüsseltes Backup in deine OneDrive/Cloud (über Worker), damit Browserdaten-Verlust ≠ alles weg.
- Service Worker network-first (✅ live) + Versions-Hinweis „neue Version geladen".
- Fehler sichtbar statt still (✅ `#errbar` live).
- Leichte **E2E-Smoke-Checks** (Playwright headless auf dem Server) bei jedem Push: lädt App, fügt Eintrag hinzu, prüft Summen — fängt „nichts klickbar"-Regression automatisch ab.

---

## Phase 5 — Nice-to-have (nach Wunsch)

- Wasser-Tracking, Schritte (Apple Health Export), Supplement-Streaks + Historie-Chart.
- Mahlzeiten-Vorlagen („mein Frühstück" als 1-Tap-Set), Wochen-Report.
- Apple-Health-Brücke (Gewicht/Schritte) — iOS nur über Umweg, später bewerten.

---

## Reihenfolge / Vorschlag

1. **Phase 1 + 2** sofort autonom (kein Gate, reiner Frontend-Code) — macht die App im Alltag „einwandfrei + schön". 
2. **Phase 3 (Whoop)** sobald du die 3 Marco-Gates erledigt hast (Whoop-App-Registrierung + Cloudflare-Freigabe). Ich baue Worker + UI parallel vor.
3. **Phase 4/5** laufend.

## Offene Fragen an Marco
- Whoop: hast du ein aktives Whoop-Abo + Zugriff auf developer.whoop.com? (API braucht beides)
- Backend ok auf **Cloudflare Worker** (empfohlen) — oder lieber gar kein Backend und Whoop per manuellem Export?
- Design: aktuelles Dunkel-Gold behalten/aufpolieren — oder kompletter neuer Look?
