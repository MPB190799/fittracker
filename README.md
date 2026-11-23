# FitTracker

Persönlicher Kalorien-, Makro-, Gewichts- & Progress-Foto-Tracker (MyFitnessPal-Style).
Statische PWA auf GitHub Pages, kein Account. Deine Einträge bleiben in deinem Browser. Ein kleiner eigener Cloudflare-Worker (`whoop-worker/`) übernimmt Whoop, Online-Suche und Foto-Erkennung.

## Live
`https://mpb190799.github.io/fittracker/` (GitHub Pages, Branch `master`)

## Features
- **Tagebuch:** Mahlzeiten (Frühstück/Mittag/Abend/Snack), Kalorien + Eiweiß/KH/Fett mit Ziel-Balken
- **Suche + Barcode:** [Open Food Facts](https://world.openfoodfacts.org) (Mio. Produkte, deutsche dabei). Barcode-Scan via Handy-Kamera (braucht HTTPS → auf der Pages-URL gegeben)
- **Alles editierbar:** Einträge bearbeiten/löschen, eigene Lebensmittel manuell anlegen, Ziele frei einstellen
- **Eiweiß-Ziel = 2 g/kg:** koppelt sich automatisch an dein zuletzt eingetragenes Gewicht (Faktor änderbar)
- **Gewicht:** Eintrag pro Tag + Verlaufs-Chart
- **Progress-Fotos:** per Kamera aufnehmen, Galerie zum Vergleichen (lokal in IndexedDB)
- **Backup:** Export/Import als JSON-Datei (Tab „Ziele") — für Geräte-/Browser-Wechsel
- **Mahlzeiten-Vorlagen:** „Mein Frühstück" einmal speichern, danach mit 1 Tipp eintragen
- **Automatisches Kalorienziel:** echter Verbrauch aus Gewichtstrend + gegessenen kcal, Vorschlag je nach Ziel (abnehmen/halten/aufbauen)
- **Foto-KI:** Essen fotografieren (+ optional kurze Beschreibung) → Nährwerte geschätzt
- **PWA:** „Zum Homescreen hinzufügen" → wie eine echte App, läuft offline

## Daten & Privatsphäre
Einträge, Gewicht, Fotos, Journal bleiben **lokal im Browser** (localStorage + IndexedDB). Kein Tracking.
Ausnahmen, alle über den eigenen Worker: Suchbegriffe → Open Food Facts, **Essensfotos → Cloudflare Workers AI im eigenen Account** (gratis bis 10.000 Neurons/Tag; Groq nur als Notfall), Whoop-Daten werden von Whoop abgeholt.
Repo darf öffentlich sein — der Code enthält keine persönlichen Daten, Secrets liegen nur im Worker. ⚠️ Browser-Daten löschen = Tracking weg → regelmäßig Backup exportieren.

## Lokal testen
Reine statische Seite — kein Build:
```bash
cd fittracker
python3 -m http.server 8080   # dann http://localhost:8080
```
(Barcode-Scan geht lokal nur über `localhost`, nicht über die LAN-IP — auf der HTTPS-Pages-URL überall.)

## Tests
`node tests/worker.test.mjs` (Worker-Logik) und `node tests/smoke.mjs` (Browser, braucht Playwright + lokalen Server). Laufen automatisch bei jedem Push (GitHub Action).

## Tech
Vanilla JS + HTML + CSS, keine Frameworks, keine Dependencies (html5-qrcode via CDN für den Scan). Worker: Cloudflare Workers + KV. Kontext für Coding-Agenten: `CLAUDE.md`.
