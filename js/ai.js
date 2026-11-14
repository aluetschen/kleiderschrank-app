// KI-Erkennung eines Kleidungsstücks per Claude API.
// Der API-Schlüssel liegt nur lokal auf dem Gerät und geht direkt an api.anthropic.com.
import Anthropic from '../vendor/anthropic-sdk.js';
import { SPORTTEILE } from './sport.js';

const SCHEMA = {
  type: 'object',
  properties: {
    kategorie: { type: 'string', enum: ['oberteil', 'unterteil', 'kleid', 'schicht', 'jacke', 'schuhe', 'accessoire'] },
    bezeichnung: { type: 'string' },
    farben: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, hex: { type: 'string' }, neutral: { type: 'boolean' } },
        required: ['name', 'hex', 'neutral'],
        additionalProperties: false,
      },
    },
    muster: { type: 'string', enum: ['uni', 'gemustert'] },
    formalitaet: { type: 'integer', enum: [1, 2, 3, 4, 5] },
    waerme: { type: 'integer', enum: [1, 2, 3, 4, 5] },
    saisons: { type: 'array', items: { type: 'string', enum: ['fruehling', 'sommer', 'herbst', 'winter'] } },
    anlaesse: { type: 'array', items: { type: 'string', enum: ['buero', 'freizeit', 'sport', 'festlich', 'ausgehen'] } },
    regenfest: { type: 'boolean' },
    sportteil: { type: 'string', enum: Object.keys(SPORTTEILE) },
    sportarten: { type: 'array', items: { type: 'string', enum: ['laufen', 'rad'] } },
  },
  required: ['kategorie', 'bezeichnung', 'farben', 'muster', 'formalitaet', 'waerme', 'saisons', 'anlaesse', 'regenfest', 'sportteil', 'sportarten'],
  additionalProperties: false,
};

const SYSTEM = `Du analysierst Fotos von Kleidungsstücken für eine Kleiderschrank-App.
Beschreibe das Hauptkleidungsstück im Bild.
- kategorie: oberteil (T-Shirt, Hemd, Bluse, Top), unterteil (Hose, Rock, Shorts), kleid (Kleid, Overall), schicht (Pullover, Strickjacke, Hoodie, Sakko/Blazer), jacke (Jacke, Mantel), schuhe, accessoire (Schal, Mütze, Gürtel, Tasche).
- bezeichnung: kurz auf Deutsch, z. B. "Hellblaues Oxford-Hemd".
- farben: 1–3 Hauptfarben, wichtigste zuerst, mit deutschem Namen und Hex-Wert. neutral=true für Schwarz, Weiß, Grau, Beige, Camel, Braun, Navy, Denim/Jeansblau, Oliv.
- formalitaet: 1 = Sport/Lounge, 2 = lässig, 3 = smart casual, 4 = Business, 5 = festlich.
- waerme: 1 = sehr leicht (Sommer), 3 = mittel, 5 = sehr warm (Winter).
- anlaesse: alle passenden Anlässe.
- regenfest: true nur bei wasserabweisenden Jacken/Schuhen.
- sportteil: nur bei Funktionskleidung fürs Laufen oder Radfahren die Funktion angeben, sonst "keins":
  unterhemd, oben_kurz (Trikot/Laufshirt kurzarm), oben_lang, weste, windjacke, regenjacke, thermojacke, unten_kurz (Radhose/Laufshorts), unten_lang (Tights/Winterradhose), armlinge, knielinge, beinlinge, handschuhe_kurz, handschuhe_lang, handschuhe_winter, ueberschuhe, kopf_duenn (Stirnband/Unterhelmmütze), kopf_warm, halstuch, schuhe (Lauf- oder Radschuhe).
  Sportteile bekommen den Anlass "sport" und passend kategorie (z. B. Armlinge/Handschuhe = accessoire, Weste = jacke).
- sportarten: wofür das Sportteil gedacht ist: "laufen", "rad" oder beides (Radtrikot, Radhose, Radschuhe = rad). Bei Alltagskleidung leer.`;

export async function analyzeClothing(blob, apiKey) {
  if (!apiKey) throw new Error('Kein API-Schlüssel hinterlegt (Einstellungen).');
  const data = await blobToBase64(blob);
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  let res;
  try {
    res = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
          { type: 'text', text: 'Analysiere dieses Kleidungsstück.' },
        ],
      }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('API-Schlüssel ungültig.');
    if (e instanceof Anthropic.RateLimitError) throw new Error('Zu viele Anfragen – bitte kurz warten.');
    if (e instanceof Anthropic.APIConnectionError) throw new Error('Keine Verbindung zur KI.');
    if (e instanceof Anthropic.APIError) throw new Error(`KI-Fehler (${e.status ?? '?'}): ${e.message}`);
    throw e;
  }
  if (res.stop_reason === 'refusal') throw new Error('Die KI konnte das Bild nicht auswerten.');
  if (res.stop_reason === 'max_tokens') throw new Error('Antwort der KI war unvollständig.');
  const text = res.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('Keine Antwort der KI.');
  return JSON.parse(text);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
