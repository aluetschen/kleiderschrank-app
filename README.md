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

## Bewertungen

**Outfits: 👎 / 👍 / ❤️** (unter dem Vorschlag)
- **👍 Gut:** jedes Paar im Outfit +1. **❤️ Lieblingsoutfit:** jedes Paar +2, landet in *Deine Lieblingsoutfits* und lässt sich mit einem Tipp anziehen. Erneutes Tippen nimmt die Bewertung zurück.
- **👎 Passt nicht** mit Grund (mehrere möglich). Jeder Grund korrigiert gezielt eine Regel:
  - *Zu warm / zu kalt:* Die App rechnet künftig mit ±1 °C (persönliches Wärmeempfinden, max. ±4 °C).
  - *Farben passen nicht:* Die Farbkombinationen dieses Outfits werden unattraktiver.
  - *Stil passt nicht zum Anlass:* Die Teile bekommen für diesen Anlass Abzüge.
  - *Ein bestimmtes Teil:* Die Paarungen dieses Teils mit dem Rest bekommen deutliche Abzüge.
  - Die Kombination selbst kommt nie wieder.

**Einzelteile: ❤️ Lieblingsteil / Normal / 👎 Ungern** (im Editor oder per Herz in der Teile-Liste)
- Lieblingsteile werden bevorzugt (+6) und dürfen im Wochenplan **bis zu 2× pro Woche** vorkommen. Teile, die nach dem Tragen in die Wäsche kommen, nur mit genug Abstand (Wäschedauer).
- Ungern getragene Teile (−30) kommen nur, wenn wirklich nichts anderes passt. Lieber wiederholt die App ein anderes Teil.
- Schrank-Filter *❤️ Lieblingsteile* und *👎 Ungern* (Kandidaten zum Aussortieren).

**Stilles Signal** (ohne extra Bewertung)
- *Das ziehe ich an:* jedes Paar im getragenen Outfit +0,5.
- *Teil ausgetauscht:* leichtes Minus für das Teil und seine Paarung im Outfit.
- *Oft gezeigt, nie getragen:* Das Teil verliert langsam an Gewicht.

Übersicht und Zurücksetzen unter *Einstellungen → Gelernte Vorlieben*.

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
   - **Deine Bewertungen:** Lieblingsteil +6, ungern −30, gemochtes Paar +3, abgelehntes Paar −12, unpassende Farben −6, Lieblingsoutfit +12 (Details unter *Bewertungen*).
5. Aus den **Top 5** wird gewichtet zufällig gewählt – so kommt nicht immer dasselbe heraus.
6. **Wochenplan:** Tag für Tag; einmal verplante Teile sind für die restliche Woche gesperrt (außer den erlaubten Kategorien, standardmäßig Hosen, Schuhe, Jacken, Accessoires). Geht eine Kategorie aus, wird nur in dieser wiederholt – die am seltensten verplanten Teile zuerst, und nie zweimal exakt dasselbe Outfit. Sporttage plant der Sport-Modus.

## Design & Bedienung (Version 2.0)

- **Startseite „Heute"**: Sind Teile im Schrank, öffnet die App direkt mit dem Tages-Outfit.
- **Erste Schritte**: Eine Checkliste führt durch Ort, Kleidung und die optionalen Extras (Erkennung, Anprobe). Sind die Pflichtschritte erledigt, schrumpft sie auf eine Zeile; ausblendbar.
- **Look-Karte**: Das Outfit erscheint als Collage der Einzelteile bzw. als Anprobe-Bild, darunter die Begründungen als Tags, die Bewertung und die Teile-Liste.
- **Aktionsleiste**: „Neu mischen" und „Anziehen" bleiben beim Scrollen immer erreichbar.
- **Woche**: Tagesleiste mit Wetter oben (tippen springt zum Tag), Tageskarten mit Icon-Buttons (Fixieren, Neu, Angezogen) und Status-Markern.
- **Einstellungen**: In Gruppen (Planung, KI & Anprobe, Daten) mit aufklappbaren Zeilen und dem aktuellen Wert auf einen Blick.
- **Editor**: Abschnitte als Karten, Schalter statt Checkboxen, Speichern-Leiste unten fixiert, Navigation ausgeblendet.
- **Gestaltung**: Warme Neutraltöne, Serifen-Titel (iOS „New York"), eigenes Linien-Icon-Set, schwebende Glas-Navigation, Hell- und Dunkelmodus, Meldungen oben statt über den Buttons.

## Technik

- Reines HTML/CSS/JavaScript, kein Build-Schritt. Daten in IndexedDB (lokal).
- Anprobe: Gemini API (`generateContent` mit Foto + Kleidungsbildern), siehe `js/tryon.js`.
- Wetter: [Open-Meteo](https://open-meteo.com) (kostenlos, ohne Schlüssel).
- KI: Claude API (`claude-opus-5-5`, niedriger Denkaufwand, strukturierte JSON-Antwort). Das Foto wird vorher auf max. 1024 px verkleinert. Kosten ca. 1–2 Cent pro Foto.
- `vendor/anthropic-sdk.js` ist das offizielle `@anthropic-ai/sdk` (v1.2.0), für den Browser gebündelt:
  `npx esbuild entry.js --bundle --format=esm --minify --platform=browser` mit `entry.js` = `export { default } from "@anthropic-ai/sdk";`
- Nach Änderungen an der App in `sw.js` die Cache-Version erhöhen, damit iPhones das Update laden.
