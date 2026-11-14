# Kleiderschrank – Outfit-Planer fürs iPhone

Web-App (PWA): Kleidung fotografieren, automatisch per KI erkennen lassen und Outfits nach **Wetter, Anlass, Farbe/Stil und Abwechslung** vorschlagen lassen – für einen Tag oder eine ganze Woche.

## Installation aufs iPhone

1. Repo-Einstellungen → **Pages** → Source: „Deploy from a branch", Branch `main`, Ordner `/ (root)`.
2. Nach ca. 1 Minute ist die App unter `https://<benutzername>.github.io/<repo-name>/` erreichbar.
3. Auf dem iPhone in **Safari** öffnen → Teilen-Symbol → **„Zum Home-Bildschirm"**.
4. In der App unter *Einstellungen*: Claude-API-Schlüssel eintragen (console.anthropic.com) und Ort fürs Wetter wählen.

> Wichtig: Die Daten liegen nur auf dem Gerät (im Speicher der Home-Bildschirm-App, getrennt von Safari). Unter *Einstellungen → Sicherung* regelmäßig exportieren.

## Sport-Modus (Laufen, Rennrad, Gravel)

Im Outfit-Tab den Anlass **Sport** wählen, dann Sportart, Startzeit und Dauer. Die App liest die **stündliche Vorhersage** für genau diesen Zeitraum (tiefste und höchste Temperatur, stärkster Wind, höchstes Regenrisiko) und stellt die Kleidung nach dem Zwiebelprinzip zusammen.

- **Gefühlte Temperatur:** Rennrad zählt 3 °C kälter (Fahrtwind), Gravel 2 °C, Wind ab 25 km/h weitere 2 °C. Beim Laufen gilt die gemessene Temperatur, weil man schnell warm wird.
- **Regeln (Rad):** ab 16 °C gefühlt kurz/kurz; 12–16 °C Unterhemd, Weste, Knielinge; 6–12 °C Langarm, Weste, Beinlinge, Langfinger; unter 6 °C Windjacke, Überschuhe, Mütze; unter 4 °C Winterjacke, lange Winterhose, Winterhandschuhe. Bei ≥ 50 % Regen Regenjacke und Überschuhe.
- **Abnehmbare Teile:** Wird es während der Einheit um 5 °C oder mehr wärmer, bevorzugt die App Armlinge/Beinlinge und Weste.
- Fehlt ein Teil im Schrank oder liegt es in der Wäsche, steht das direkt dabei.
- Sportteile bekommen im Editor unter *Sportbekleidung* ihre Funktion (z. B. Armlinge, Weste). Die KI-Erkennung füllt das automatisch aus.
- Im Wochenplan einen Tag auf *Sport* stellen: Sportart, Startzeit und Dauer pro Tag einstellbar.

## Wäschekorb

- *Das ziehe ich an* legt Teile automatisch in den Wäschekorb: Oberteile (einstellbar) sowie Sport-Basisschichten (Trikots, Hosen, Unterhemden, Linge, Buff, Mütze). Schuhe, Jacken und Handschuhe nicht.
- Teile im Wäschekorb werden nicht vorgeschlagen und sind nach 3 Tagen (einstellbar) automatisch wieder verfügbar, auch im Wochenplan.
- Manuell: Teil öffnen → *In die Wäsche* / *Wieder sauber*. Im Schrank-Filter *🧺 Wäsche* gibt es *Alles wieder sauber*.

## Daumen hoch / runter

- **👍 Gefällt mir:** Das Outfit wird Favorit, und alle Paare darin (z. B. Sakko + Chino) bekommen Pluspunkte. Favoriten stehen unten im Outfit-Tab und lassen sich mit einem Tipp anziehen.
- **👎 Passt nicht:** Du tippst die Teile an, die nicht passen. Deren Paarungen mit dem Rest bekommen deutliche Abzüge, und genau diese Kombination kommt nie wieder. Ohne Auswahl wird nur die Kombination gesperrt.
- Zurücksetzen unter *Einstellungen → Deine Bewertungen*.

## Virtuelle Anprobe (Google Gemini)

Unter *Einstellungen → Anprobe* ein Ganzkörperfoto hochladen und einen Google-API-Schlüssel eintragen (aistudio.google.com → „Get API key"). Danach zeigt die App beim Tages-Outfit und im Wochenplan (*Anprobe & Details*) auf Knopfdruck, wie das Outfit an dir aussieht.

- Bildmodell: standardmäßig `gemini-3.1-flash-image`, in den Einstellungen änderbar.
- Kosten: wenige Cent pro Bild. Jedes Bild wird nur einmal erzeugt und auf dem Gerät gespeichert (max. 40). Gleiches Outfit = kein neuer Aufruf.
- Datenschutz: Für jede Anprobe gehen dein Foto und die Kleidungsbilder an Google. Im kostenlosen Kontingent darf Google die Daten zur Verbesserung nutzen, mit Bezahlkonto nicht (Google-Nutzungsbedingungen).
- Die Bilder sind KI-generiert: Passform und Details können abweichen.

## Beispiel-Schrank zum Ausprobieren

Ohne eigene Fotos testen: im leeren Schrank auf **„Beispiel-Schrank laden"** tippen (oder *Einstellungen → Beispiel-Schrank*). Dann kommen 47 gezeichnete Teile für Alltag, Büro, Festlich, Laufen und Rennrad in den Schrank, fertig beschrieben und ohne API-Kosten. Über *Entfernen* verschwinden nur diese Teile, eigene bleiben erhalten.

Die Bilder liegen in [`demo/`](demo/) und lassen sich auch in die Fotos-App speichern, um die KI-Erkennung über **+** zu testen. Erzeugt werden sie mit `python3 tools/make_demo.py`.

## Funktionen

| Ansicht | Was passiert |
|---|---|
| **Schrank** | Foto aufnehmen oder aus der Mediathek wählen (auch mehrere). Die KI erkennt Kategorie, Farben, Muster, Stil, Wärme, Jahreszeiten und Anlässe – alles lässt sich korrigieren. |
| **Outfit** | Tag + Anlass wählen → Vorschlag mit Anprobe-Bild und Liste der Einzelteile. ↻ tauscht ein Teil gegen die nächstbeste Alternative. „Das ziehe ich an" merkt sich das Datum. |
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
   - **Deine Bewertungen:** +3 je gemochtem Paar, −12 je abgelehntem Paar, +10 für Favoriten.
5. Aus den **Top 5** wird gewichtet zufällig gewählt – so kommt nicht immer dasselbe heraus.
6. **Wochenplan:** Tag für Tag; einmal verplante Teile sind für die restliche Woche gesperrt (außer den erlaubten Kategorien, standardmäßig Hosen, Schuhe, Jacken, Accessoires). Geht eine Kategorie aus, wird nur in dieser wiederholt – die am seltensten verplanten Teile zuerst, und nie zweimal exakt dasselbe Outfit. Sporttage plant der Sport-Modus.

## Technik

- Reines HTML/CSS/JavaScript, kein Build-Schritt. Daten in IndexedDB (lokal).
- Anprobe: Gemini API (`generateContent` mit Foto + Kleidungsbildern), siehe `js/tryon.js`.
- Wetter: [Open-Meteo](https://open-meteo.com) (kostenlos, ohne Schlüssel).
- KI: Claude API (`claude-opus-5-5`, niedriger Denkaufwand, strukturierte JSON-Antwort). Das Foto wird vorher auf max. 1024 px verkleinert. Kosten ca. 1–2 Cent pro Foto.
- `vendor/anthropic-sdk.js` ist das offizielle `@anthropic-ai/sdk` (v1.2.0), für den Browser gebündelt:
  `npx esbuild entry.js --bundle --format=esm --minify --platform=browser` mit `entry.js` = `export { default } from "@anthropic-ai/sdk";`
- Nach Änderungen an der App in `sw.js` die Cache-Version erhöhen, damit iPhones das Update laden.
