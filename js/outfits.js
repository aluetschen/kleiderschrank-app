// Outfit-Logik: Welche Teile passen zusammen – zu Wetter, Anlass, Farbe und Abwechslung?
import { hexToHsl, isNeutral, hueDistance } from './colors.js';
import { inLaundry } from './sport.js';

export const KATEGORIEN = {
  oberteil: 'Oberteil',
  unterteil: 'Hose / Rock',
  kleid: 'Kleid / Overall',
  schicht: 'Pullover / Strickjacke',
  jacke: 'Jacke / Mantel',
  schuhe: 'Schuhe',
  accessoire: 'Accessoire',
};
export const ANLAESSE = {
  buero: 'Büro', freizeit: 'Freizeit', sport: 'Sport', festlich: 'Festlich', ausgehen: 'Ausgehen',
};
export const SAISONS = { fruehling: 'Frühling', sommer: 'Sommer', herbst: 'Herbst', winter: 'Winter' };
export const SLOT_ORDER = ['jacke', 'schicht', 'oberteil', 'kleid', 'unterteil', 'schuhe', 'accessoire'];

const DAY = 86400000;

export function seasonOf(date) {
  const m = date.getMonth();
  if (m >= 2 && m <= 4) return 'fruehling';
  if (m >= 5 && m <= 7) return 'sommer';
  if (m >= 8 && m <= 10) return 'herbst';
  return 'winter';
}

// Gefühlte Tagestemperatur: Höchstwert zählt doppelt, weil man tagsüber unterwegs ist
export function dayTemp(weather, date) {
  if (weather && Number.isFinite(weather.tmax)) return Math.round((weather.tmax * 2 + weather.tmin) / 3);
  return { winter: 3, fruehling: 13, sommer: 23, herbst: 12 }[seasonOf(date)]; // Ersatzwert ohne Wetterdaten
}

// Wärmestufe 1 (sehr leicht) bis 5 (sehr warm), die zur Temperatur passt
function targetWarmth(t) {
  if (t >= 24) return 1;
  if (t >= 18) return 2;
  if (t >= 12) return 3;
  if (t >= 5) return 4;
  return 5;
}

function daysSince(dateStr, ref) {
  if (!dateStr) return Infinity;
  return Math.floor((ref - new Date(dateStr + 'T12:00:00')) / DAY);
}

// ---------- Bewertung eines Outfits ----------
function colorScore(items, reasons) {
  const primaries = items.filter((i) => i.kategorie !== 'accessoire').map((i) => (i.farben || [])[0]).filter(Boolean);
  const accents = primaries.filter((c) => !isNeutral(c)).map((c) => hexToHsl(c.hex)).filter(Boolean);
  if (accents.length === 0) { reasons.push('Neutrale, ruhige Farben'); return 4; }
  if (accents.length === 1) { reasons.push('Ein Farbakzent auf neutraler Basis'); return 8; }
  if (accents.length === 2) {
    const d = hueDistance(accents[0].h, accents[1].h);
    if (d <= 40) { reasons.push('Ton-in-Ton-Farben'); return 8; }
    if (d >= 150) { reasons.push('Komplementärfarben als Kontrast'); return 5; }
    return -10;
  }
  return -8 * (accents.length - 2);
}

export function scoreOutfit(outfit, ctx) {
  const items = Object.values(outfit);
  const reasons = [];
  let s = 100;
  const tw = targetWarmth(ctx.temp);
  let weatherPenalty = 0, occasionMiss = 0, reused = 0;

  for (const it of items) {
    const w = it.waerme || 3;
    if (['oberteil', 'unterteil', 'kleid', 'schicht'].includes(it.kategorie)) {
      // Schicht und Jacke dürfen leichter sein, weil sie über etwas getragen werden
      const target = it.kategorie === 'schicht' ? Math.max(2, tw - 1) : tw;
      weatherPenalty += Math.abs(w - target);
    } else if (it.kategorie === 'jacke') {
      weatherPenalty += Math.abs(w - Math.max(1, tw - (ctx.temp < 5 ? 0 : 1)));
    } else if (it.kategorie === 'schuhe') {
      if (ctx.temp < 8 && w <= 1) weatherPenalty += 3;
      if (ctx.temp >= 24 && w >= 4) weatherPenalty += 3;
    }
    if (it.kategorie !== 'accessoire' && !(it.anlaesse || []).includes(ctx.occasion)) { s -= 25; occasionMiss++; }
    if ((it.saisons || []).length && !it.saisons.includes(ctx.season)) s -= 6;
    if (ctx.softExclude.has(it.id)) s -= 4;
    const rc = ctx.reuse.get(it.id) || 0;
    if (rc) { s -= 15 * rc; reused++; } // je öfter schon verplant, desto stärker vermeiden
    const since = daysSince(it.lastWorn, ctx.date);
    if (since < 3) s -= 8;
    else if (since === Infinity) s += 3;
    else if (since > 21) s += 2;
    if (ctx.rain && (it.kategorie === 'jacke' || it.kategorie === 'schuhe')) s += it.regenfest ? 4 : -6;
  }
  s -= 7 * weatherPenalty;
  if (reused) reasons.push(`${reused} Teil(e) diese Woche schon verplant – der Schrank reicht nicht für 7 verschiedene Outfits`);
  if (weatherPenalty <= 1) reasons.push(`Passt zu ${ctx.temp} °C`);
  if (occasionMiss) reasons.push(`${occasionMiss} Teil(e) nicht als „${ANLAESSE[ctx.occasion]}" markiert`);

  const forms = items.filter((i) => i.kategorie !== 'accessoire').map((i) => i.formalitaet || 3);
  const spread = forms.length ? Math.max(...forms) - Math.min(...forms) : 0;
  s -= 6 * spread;
  if (spread <= 1) reasons.push('Stimmiger Stil');

  s += colorScore(items, reasons);

  const patterned = items.filter((i) => i.muster === 'gemustert' && i.kategorie !== 'accessoire').length;
  if (patterned > 1) s -= 12 * (patterned - 1);

  // Bewertung einzelner Teile: Lieblingsteile bevorzugt, ungern getragene nur als Notlösung
  const favs = items.filter((i) => i.bewertung === 'liebling').length;
  const unloved = items.filter((i) => i.bewertung === 'ungern').length;
  s += 6 * favs - 30 * unloved;
  if (favs) reasons.unshift(`❤️ ${favs === 1 ? 'Ein Lieblingsteil' : `${favs} Lieblingsteile`} dabei`);
  if (unloved) reasons.push('Enthält ein Teil, das du ungern trägst – es gab keine bessere Alternative');

  if (ctx.prefs) scorePrefs(items, outfit, ctx, reasons, (d) => { s += d; });

  return { score: Math.round(s), reasons };
}

// Gelerntes aus deinen Bewertungen und deinem Verhalten
function scorePrefs(items, outfit, ctx, reasons, add) {
  const p = ctx.prefs;
  const clothes = items.filter((i) => i.kategorie !== 'accessoire');
  // Paare: 👍/❤️/Tragen geben Plus, 👎 mit "Teil" gibt deutliche Abzüge
  let like = 0, dislike = 0;
  for (let a = 0; a < items.length; a++) {
    for (let b = a + 1; b < items.length; b++) {
      const v = p.pairs[pairKey(items[a].id, items[b].id)] || 0;
      if (v > 0) like += Math.min(v, 3); else dislike -= v;
    }
  }
  add(3 * like - 12 * dislike);
  // Farbpaare, die dir nicht gefallen haben ("Farben passen nicht")
  const names = [...new Set(clothes.map((i) => ((i.farben || [])[0]?.name || '').toLowerCase()).filter(Boolean))];
  let colorBad = 0;
  for (let a = 0; a < names.length; a++) for (let b = a + 1; b < names.length; b++) colorBad += Math.min(0, p.colorPairs[pairKey(names[a], names[b])] || 0);
  add(6 * colorBad);
  // Teile, die für diesen Anlass nicht gepasst haben ("Stil passt nicht zum Anlass")
  for (const i of clothes) add(10 * Math.min(0, p.occ[i.id + '|' + ctx.occasion] || 0));
  // Stilles Signal: oft ausgetauscht oder oft gezeigt, aber nie getragen
  for (const i of items) {
    add(-2 * Math.min(p.swaps[i.id] || 0, 5));
    const shown = p.shown[i.id] || 0;
    if (shown >= 8 && !i.wornCount) add(-Math.min(8, 2 + Math.floor((shown - 8) / 4)));
  }
  const key = outfitKey(outfit);
  if (p.ratings[key] === 2) { add(12); reasons.unshift('❤️ Eines deiner Lieblingsoutfits'); }
  else if (p.ratings[key] === 1) { add(5); reasons.unshift('👍 Hat dir schon gefallen'); }
  else if (like >= 3) reasons.unshift('👍 Kombinationen, die dir gefallen haben');
}

// ---------- Kontext & Kandidaten ----------
export function pairKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }

export function makeContext({ items, date, weather, occasion, exclude = new Set(), softExclude = new Set(), reuse = new Map(), prefs = null, laundryDays = 3 }) {
  const laundry = items.filter((i) => inLaundry(i, date, laundryDays));
  items = items.filter((i) => !laundry.includes(i)); // was in der Wäsche liegt, wird nicht vorgeschlagen
  // Persönliches Wärmeempfinden ("zu warm"/"zu kalt") verschiebt die Temperatur
  const temp = dayTemp(weather, date) + (prefs?.tempOffset || 0);
  const rain = !!weather && (weather.rain ?? 0) >= 50;
  const isSport = occasion === 'sport';
  const ctx = {
    items, date, weather, occasion, exclude, softExclude, reuse, prefs, laundry, temp, rain,
    season: seasonOf(date),
    needSchicht: isSport ? temp < 8 : temp < 15,
    needJacke: temp < 13 || rain,
  };
  ctx.pools = {};
  for (const cat of Object.keys(KATEGORIEN)) {
    const all = items.filter((i) => i.kategorie === cat);
    const matching = all.filter((i) => (i.anlaesse || []).includes(occasion));
    // Gibt es passende Teile für den Anlass, werden nur diese verwendet – auch wenn sie
    // diese Woche schon verplant sind (dann greift im Wochenplan die Wiederholung).
    // Nur wenn der Schrank gar nichts Passendes hat, wird auf alle Teile ausgewichen.
    ctx.pools[cat] = (matching.length ? matching : all).filter((i) => !exclude.has(i.id));
  }
  return ctx;
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function randomOutfit(ctx) {
  const p = ctx.pools;
  const canTwo = p.oberteil.length && p.unterteil.length;
  const canDress = p.kleid.length;
  if (!canTwo && !canDress) return null;
  const o = {};
  // Kleid wird seltener gewählt, damit es nicht jeden Tag vorkommt
  if (canDress && (!canTwo || Math.random() < 0.3)) o.kleid = pick(p.kleid);
  else { o.oberteil = pick(p.oberteil); o.unterteil = pick(p.unterteil); }
  if (ctx.needSchicht && p.schicht.length) o.schicht = pick(p.schicht);
  if (ctx.needJacke && p.jacke.length) o.jacke = pick(p.jacke);
  if (p.schuhe.length) o.schuhe = pick(p.schuhe);
  if (p.accessoire.length && Math.random() < 0.35) o.accessoire = pick(p.accessoire);
  return o;
}

export function outfitKey(o) {
  return SLOT_ORDER.filter((k) => o[k]).map((k) => o[k].id).join('|');
}

/**
 * Erzeugt viele zufällige Kombinationen, bewertet sie und wählt eine der besten.
 * avoidKeys: bereits gezeigte Vorschläge (für „Anderer Vorschlag").
 */
export function suggestOutfit(ctx, avoidKeys = new Set(), tries = 500) {
  const seen = new Map();
  for (let i = 0; i < tries; i++) {
    const o = randomOutfit(ctx);
    if (!o) break;
    const key = outfitKey(o);
    if (seen.has(key) || avoidKeys.has(key) || ctx.prefs?.blocked.has(key)) continue;
    const { score, reasons } = scoreOutfit(o, ctx);
    seen.set(key, { slots: o, key, score: score + Math.random() * 4, reasons });
  }
  const ranked = [...seen.values()].sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  // Gewichtete Auswahl unter den Top 5: der Beste ist am wahrscheinlichsten, aber nicht immer
  const top = ranked.slice(0, 5);
  const weights = top.map((_, i) => 5 - i);
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < top.length; i++) { r -= weights[i]; if (r <= 0) return top[i]; }
  return top[0];
}

// Einzelnes Teil austauschen: das beste andere Teil derselben Kategorie
export function swapSlot(outfit, slot, ctx) {
  const current = outfit.slots[slot];
  const candidates = ctx.pools[slot].filter((i) => i.id !== current?.id);
  if (!candidates.length) return null;
  const tried = outfit.swapped?.[slot] || new Set();
  let best = null;
  for (const c of candidates) {
    if (tried.has(c.id)) continue;
    const slots = { ...outfit.slots, [slot]: c };
    const { score, reasons } = scoreOutfit(slots, ctx);
    if (!best || score > best.score) best = { slots, score, reasons, key: outfitKey(slots) };
  }
  if (!best) { tried.clear(); return swapSlot({ ...outfit, swapped: { ...outfit.swapped, [slot]: tried } }, slot, ctx); }
  tried.add(current?.id);
  tried.add(best.slots[slot].id);
  best.swapped = { ...(outfit.swapped || {}), [slot]: tried };
  return best;
}

// Was fehlt im Schrank, damit Outfits möglich sind?
export function missingHints(ctx) {
  const p = ctx.pools, hints = [];
  if (!(p.oberteil.length && p.unterteil.length) && !p.kleid.length) hints.push('Mindestens ein Oberteil + eine Hose/Rock oder ein Kleid');
  if (!p.schuhe.length) hints.push('Schuhe');
  if (ctx.needJacke && !p.jacke.length) hints.push('Eine Jacke (es wird kühl oder nass)');
  if (hints.length && ctx.laundry?.length) hints.push(`${ctx.laundry.length} Teil(e) liegen gerade in der Wäsche`);
  return hints;
}

/**
 * Wochenplan: Tag für Tag ein Outfit, ohne dass Kleidungsstücke doppelt vorkommen.
 * Kategorien in repeatCats (z. B. Schuhe, Jacken) dürfen mehrfach getragen werden.
 */
export const MAX_FAV_PER_WEEK = 2;

export function planWeek(items, days, repeatCats, extras = {}) {
  const { washes = () => false, laundryDays = 3, ...ctxExtras } = extras;
  const byId = new Map(items.map((i) => [i.id, i]));
  const used = new Set();
  const counts = new Map(); // wie oft jedes Teil in dieser Woche schon vorkommt
  const pos = new Map();    // an welchen Tagen (Index) es eingeplant ist
  const keys = new Set();   // identische Outfits in derselben Woche vermeiden
  const add = (i, n) => {
    used.add(i.id); counts.set(i.id, (counts.get(i.id) || 0) + 1);
    pos.set(i.id, [...(pos.get(i.id) || []), n]);
  };
  days.forEach((d, n) => { if (d.locked && d.outfit) { Object.values(d.outfit.slots).forEach((i) => add(i, n)); keys.add(outfitKey(d.outfit.slots)); } });
  const repeatIds = new Set(items.filter((i) => repeatCats.includes(i.kategorie)).map((i) => i.id));
  // Darf ein schon verplantes Teil an Tag n noch einmal vorkommen?
  // Lieblingsteile bis zu 2× pro Woche; was nach dem Tragen in die Wäsche kommt, nur mit genug Abstand.
  const tooClose = (id, n) => { const i = byId.get(id); return !i || (washes(i) && (pos.get(id) || []).some((p) => Math.abs(p - n) < laundryDays)); };
  const blocked = (id, n) => {
    if (tooClose(id, n)) return true; // liegt dann noch in der Wäsche
    if (repeatIds.has(id)) return false;
    return !(byId.get(id).bewertung === 'liebling' && counts.get(id) < MAX_FAV_PER_WEEK);
  };
  return days.map((d, n) => {
    if (d.locked && d.outfit) return d;
    if (d.occasion === 'sport') return { ...d, outfit: null, hints: [] }; // Sporttage plant der Sport-Modus
    const hard = new Set([...used].filter((id) => blocked(id, n)));
    const soft = new Set([...used].filter((id) => !hard.has(id)));
    const extras = { ...ctxExtras, laundryDays };
    const ctx = makeContext({ ...extras, items, date: d.dateObj, weather: d.weather, occasion: d.occasion, exclude: hard, softExclude: soft });
    let outfit = suggestOutfit(ctx);
    const unlovedCats = outfit ? Object.values(outfit.slots).filter((i) => i.bewertung === 'ungern').map((i) => i.kategorie) : [];
    if (!outfit || unlovedCats.length) {
      // Schrank zu klein (oder nur ein ungern getragenes Teil frei): in genau diesen Kategorien
      // ein schon verplantes Teil wiederholen – und die bessere der beiden Lösungen nehmen.
      const emptyCats = [...unlovedCats, ...Object.keys(ctx.pools).filter((c) => !ctx.pools[c].length)];
      // Wiederholen ja – aber nie, solange das Teil noch in der Wäsche wäre
      const reuseIds = new Set([...hard].filter((id) => !tooClose(id, n) && emptyCats.includes(byId.get(id)?.kategorie)));
      const ctx2 = makeContext({
        ...extras, items, date: d.dateObj, weather: d.weather, occasion: d.occasion, softExclude: soft,
        exclude: new Set([...hard].filter((id) => !reuseIds.has(id))),
        reuse: new Map([...counts].filter(([id]) => reuseIds.has(id))),
      });
      const alt = suggestOutfit(ctx2, keys) || suggestOutfit(ctx2);
      if (!outfit || (alt && alt.score > outfit.score)) outfit = alt;
      if (!outfit) return { ...d, outfit: null, hints: missingHints(ctx2) };
    }
    if (outfit) { Object.values(outfit.slots).forEach((i) => add(i, n)); keys.add(outfit.key); }
    return { ...d, outfit, hints: outfit ? [] : missingHints(ctx) };
  });
}
