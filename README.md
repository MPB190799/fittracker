# FitTracker

Persönlicher Kalorien-, Makro-, Gewichts- & Progress-Foto-Tracker (MyFitnessPal-Style).
**100% statisch** — läuft auf GitHub Pages, kein Server, kein Account. Daten bleiben in deinem Browser.

## Live
GitHub Pages aktivieren (Settings → Pages → Branch `main` / Root), dann erreichbar unter:
`https://<dein-user>.github.io/fittracker/`

## Features
- **Tagebuch:** Mahlzeiten (Frühstück/Mittag/Abend/Snack), Kalorien + Eiweiß/KH/Fett mit Ziel-Balken
- **Suche + Barcode:** [Open Food Facts](https://world.openfoodfacts.org) (Mio. Produkte, deutsche dabei). Barcode-Scan via Handy-Kamera (braucht HTTPS → auf der Pages-URL gegeben)
- **Alles editierbar:** Einträge bearbeiten/löschen, eigene Lebensmittel manuell anlegen, Ziele frei einstellen
- **Eiweiß-Ziel = 2 g/kg:** koppelt sich automatisch an dein zuletzt eingetragenes Gewicht (Faktor änderbar)
- **Gewicht:** Eintrag pro Tag + Verlaufs-Chart
- **Progress-Fotos:** per Kamera aufnehmen, Galerie zum Vergleichen (lokal in IndexedDB)
- **Backup:** Export/Import als JSON-Datei (Tab „Ziele") — für Geräte-/Browser-Wechsel
- **PWA:** „Zum Homescreen hinzufügen" → wie eine echte App, läuft offline

## Daten & Privatsphäre
Alles bleibt **lokal im Browser** (localStorage + IndexedDB). Nichts wird hochgeladen, kein Tracking, keine API-Keys.
Repo darf öffentlich sein — der Code enthält keine persönlichen Daten. ⚠️ Browser-Daten löschen = Tracking weg → regelmäßig Backup exportieren.

## Lokal testen
Reine statische Seite — kein Build:
```bash
cd fittracker
python3 -m http.server 8080   # dann http://localhost:8080
```
(Barcode-Scan geht lokal nur über `localhost`, nicht über die LAN-IP — auf der HTTPS-Pages-URL überall.)

## Tech
Vanilla JS + HTML + CSS, keine Frameworks, keine Dependencies (html5-qrcode via CDN für den Scan).
