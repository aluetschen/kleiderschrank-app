# Kleiderschrank – Outfit-Planer fürs iPhone

Web-App (PWA): Kleidung fotografieren, automatisch per KI erkennen lassen und Outfits nach **Wetter, Anlass, Farbe/Stil und Abwechslung** vorschlagen lassen – für einen Tag oder eine ganze Woche.

## Installation aufs iPhone

1. Repo-Einstellungen → **Pages** → Source: „Deploy from a branch", Branch `main`, Ordner `/ (root)`.
2. Nach ca. 1 Minute ist die App unter `https://<benutzername>.github.io/<repo-name>/` erreichbar.
3. Auf dem iPhone in **Safari** öffnen → Teilen-Symbol → **„Zum Home-Bildschirm"**.
4. In der App unter *Einstellungen*: Claude-API-Schlüssel eintragen (console.anthropic.com) und Ort fürs Wetter wählen.

> Wichtig: Die Daten liegen nur auf dem Gerät (im Speicher der Home-Bildschirm-App, getrennt von Safari). Unter *Einstellungen → Sicherung* regelmäßig exportieren.

## Funktionen

| Ansicht | Was passiert |
|---|---|
| **Schrank** | Foto aufnehmen oder aus der Mediathek wählen (auch mehrere). Die KI erkennt Kategorie, Farben, Muster, Stil, Wärme, Jahreszeiten und Anlässe – alles lässt sich korrigieren. |
| **Outfit** | Tag + Anlass wählen → Vorschlag. Auf ein Teil tippen tauscht es gegen die nächstbeste Alternative. „Das ziehe ich an" merkt sich das Datum. |
| **Woche** | 7 Tage ab heute oder ab Montag, je Tag Anlass (Standard aus den Einstellungen) und Wetter. Tage lassen sich fixieren, einzeln neu würfeln oder Teil für Teil tauschen. |
| **Einstellungen** | API-Schlüssel, Ort, Standard-Anlass je Wochentag, welche Kategorien im Wochenplan mehrfach vorkommen dürfen, Sicherung. |

## So funktioniert die Outfit-Logik (`js/outfits.js`)

1. **Temperatur bestimmen:** Gefühlte Tagestemperatur = (2 × Höchstwert + Tiefstwert) / 3. Ohne Wetterdaten: Durchschnittswert der Jahreszeit.
2. **Bausteine festlegen:** Oberteil + Hose/Rock *oder* Kleid, dazu Schuhe. Unter 15 °C kommt ein Pullover dazu, unter 13 °C oder bei ≥ 50 % Regenrisiko eine Jacke. Accessoires gelegentlich.
3. **Kandidaten:** Pro Baustein nur Teile, die für den Anlass markiert sind (wenn es keine gibt, notfalls alle).
4. **500 Zufallskombinationen** werden gebildet und mit Punkten bewertet:
   - **Wetter:** Abzug, wenn die Wärmestufe (1–5) nicht zur Temperatur passt; Bonus für regenfeste Jacke/Schuhe bei Regen.
   - **Anlass / Jahreszeit:** Abzug für unpassende Teile.
   - **Stil:** Abzug, wenn die Formalität der Teile weit auseinanderliegt (Sakko + Jogginghose).
   - **Farbe:** Neutrale Farben (Schwarz, Weiß, Grau, Beige, Navy, Denim …) passen immer. Ein Farbakzent = Bonus, zwei Akzente nur Ton-in-Ton oder als Komplementärkontrast, mehr als zwei = Abzug. Mehr als ein gemustertes Teil = Abzug.
   - **Abwechslung:** Abzug für Teile, die in den letzten 3 Tagen getragen wurden, Bonus für lange nicht oder nie getragene.
5. Aus den **Top 5** wird gewichtet zufällig gewählt – so kommt nicht immer dasselbe heraus.
6. **Wochenplan:** Tag für Tag; einmal verplante Teile sind für die restliche Woche gesperrt (außer den erlaubten Kategorien, z. B. Schuhe). Reicht der Schrank nicht, werden Teile wiederholt – die am seltensten verplanten zuerst, und nie zweimal exakt dasselbe Outfit.

## Technik

- Reines HTML/CSS/JavaScript, kein Build-Schritt. Daten in IndexedDB (lokal).
- Wetter: [Open-Meteo](https://open-meteo.com) (kostenlos, ohne Schlüssel).
- KI: Claude API (`claude-opus-5-5`, niedriger Denkaufwand, strukturierte JSON-Antwort). Das Foto wird vorher auf max. 1024 px verkleinert. Kosten ca. 1–2 Cent pro Foto.
- `vendor/anthropic-sdk.js` ist das offizielle `@anthropic-ai/sdk` (v1.2.0), für den Browser gebündelt:
  `npx esbuild entry.js --bundle --format=esm --minify --platform=browser` mit `entry.js` = `export { default } from "@anthropic-ai/sdk";`
- Nach Änderungen an der App in `sw.js` die Cache-Version erhöhen, damit iPhones das Update laden.
