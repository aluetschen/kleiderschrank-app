// Virtuelle Anprobe: Google Gemini setzt die vorgeschlagenen Kleidungsstücke auf das Ganzkörperfoto.
// Der Google-API-Schlüssel und das Foto liegen nur auf dem Gerät; für jede Anprobe gehen
// das Foto und die Bilder der Kleidungsstücke an Google.
import { db } from './db.js';
import { KATEGORIEN, SLOT_ORDER } from './outfits.js';

export const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image';
const MAX_CACHE = 40; // so viele Anprobe-Bilder werden höchstens aufbewahrt

const SLOT_EN = {
  jacke: 'jacket or coat (wear it open so the layers underneath stay visible)',
  schicht: 'sweater, cardigan or blazer (mid layer)',
  oberteil: 'top / shirt (base layer)',
  kleid: 'dress or jumpsuit',
  unterteil: 'trousers, skirt or shorts',
  schuhe: 'shoes',
  accessoire: 'accessory',
};

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(b64, type) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

// Schlüssel für den Zwischenspeicher: gleiches Outfit + gleiches Foto = gleiches Bild
export function tryOnKey(slots, photoVersion) {
  return 'tryon:' + photoVersion + ':' + SLOT_ORDER.filter((k) => slots[k]).map((k) => slots[k].id).join('|');
}

export async function getCachedTryOn(slots, photoVersion) {
  const hit = await db.get(tryOnKey(slots, photoVersion));
  return hit ? hit.blob : null;
}

async function storeTryOn(key, blob) {
  await db.set(key, { blob, at: Date.now() });
  const index = ((await db.get('tryonIndex')) || []).filter((k) => k !== key);
  index.push(key);
  while (index.length > MAX_CACHE) await db.del(index.shift()); // älteste Bilder löschen
  await db.set('tryonIndex', index);
}

export async function clearTryOnCache() {
  for (const k of (await db.get('tryonIndex')) || []) await db.del(k);
  await db.set('tryonIndex', []);
}

/**
 * Erzeugt das Anprobe-Bild.
 * slots: { jacke: item, oberteil: item, ... }   body: { blob, version }
 */
export async function generateTryOn({ slots, body, apiKey, model }) {
  if (!apiKey) throw new Error('Kein Google-API-Schlüssel hinterlegt (Einstellungen → Anprobe).');
  if (!body?.blob) throw new Error('Noch kein Ganzkörperfoto hinterlegt (Einstellungen → Anprobe).');

  const pieces = SLOT_ORDER.filter((k) => slots[k]).map((k) => ({ slot: k, item: slots[k] }));
  const parts = [
    { text: 'IMAGE 1 – the person (full-body photo):' },
    { inline_data: { mime_type: body.blob.type || 'image/jpeg', data: await blobToBase64(body.blob) } },
  ];
  for (const [n, p] of pieces.entries()) {
    parts.push({ text: `IMAGE ${n + 2} – ${SLOT_EN[p.slot]}: ${p.item.bezeichnung || KATEGORIEN[p.slot]}` });
    parts.push({ inline_data: { mime_type: p.item.image.type || 'image/jpeg', data: await blobToBase64(p.item.image) } });
  }
  parts.push({
    text: [
      'Create one photorealistic full-body image of the person from IMAGE 1 wearing exactly the clothing items shown in the other images, combined as one outfit.',
      'Keep the person\'s face, hair, skin tone, body shape, pose and the background unchanged.',
      'Replace the clothes the person is currently wearing. Match colour, pattern, material and cut of each item as closely as possible.',
      'Some clothing images may be drawings – render them as real fabric.',
      'Do not add any clothing, jewellery or accessories that are not listed. Show the whole body from head to shoes.',
    ].join(' '),
  });

  const body2 = { contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } };
  const call = (version) => fetch(`https://generativelanguage.googleapis.com/${version}/models/${encodeURIComponent(model || DEFAULT_IMAGE_MODEL)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body2),
  });

  let res;
  try {
    res = await call('v1beta');
    if (res.status === 404) res = await call('v1'); // manche Modelle gibt es nur unter v1
  } catch {
    throw new Error('Keine Verbindung zu Google.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.error?.message || '';
    if (res.status === 400 && /api key/i.test(msg)) throw new Error('Google-API-Schlüssel ungültig.');
    if (res.status === 403) throw new Error('Google verweigert den Zugriff – ist die Gemini API für den Schlüssel freigeschaltet?');
    if (res.status === 404) throw new Error(`Bildmodell „${model}" nicht gefunden – Modellname in den Einstellungen prüfen.`);
    if (res.status === 429) throw new Error('Google-Limit erreicht – bitte später erneut versuchen.');
    throw new Error(`Google-Fehler (${res.status}): ${msg}`);
  }
  if (json.promptFeedback?.blockReason) throw new Error('Google hat die Anfrage abgelehnt (' + json.promptFeedback.blockReason + ').');
  const cand = json.candidates?.[0];
  const outParts = cand?.content?.parts || [];
  const img = outParts.map((p) => p.inlineData || p.inline_data).find((d) => d?.data);
  if (!img) {
    const text = outParts.map((p) => p.text).filter(Boolean).join(' ');
    throw new Error('Google hat kein Bild geliefert' + (cand?.finishReason && cand.finishReason !== 'STOP' ? ` (${cand.finishReason})` : '') + (text ? `: ${text.slice(0, 160)}` : '.'));
  }
  const blob = base64ToBlob(img.data, img.mimeType || img.mime_type || 'image/png');
  await storeTryOn(tryOnKey(slots, body.version), blob);
  return blob;
}
