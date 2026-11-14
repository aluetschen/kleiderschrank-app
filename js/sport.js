// Sport-Modus: Kleidung nach dem Zwiebelprinzip für Laufen, Rennrad und Gravel.
// Grundlage sind Temperatur, Wind und Regen während der geplanten Einheit (stündliche Vorhersage).

export const SPORTARTEN = { laufen: 'Laufen', rennrad: 'Rennrad', gravel: 'Gravel' };

// Funktion eines Sportteils (unabhängig davon, ob Lauf- oder Radvariante)
export const SPORTTEILE = {
  keins: '– kein Sportteil –',
  unterhemd: 'Funktionsunterhemd',
  oben_kurz: 'Shirt / Trikot kurzarm',
  oben_lang: 'Shirt / Trikot langarm',
  weste: 'Weste',
  windjacke: 'Windjacke',
  regenjacke: 'Regenjacke',
  thermojacke: 'Thermo- / Winterjacke',
  unten_kurz: 'Hose kurz',
  unten_lang: 'Hose / Tights lang',
  armlinge: 'Armlinge',
  knielinge: 'Knielinge',
  beinlinge: 'Beinlinge',
  handschuhe_kurz: 'Handschuhe kurzfinger',
  handschuhe_lang: 'Handschuhe langfinger',
  handschuhe_winter: 'Winterhandschuhe',
  ueberschuhe: 'Überschuhe',
  kopf_duenn: 'Stirnband / Unterhelmmütze',
  kopf_warm: 'Warme Mütze',
  halstuch: 'Halstuch / Buff',
  schuhe: 'Sportschuhe',
};

const DAY = 86400000;

// Diese Sportteile kommen nach jeder Einheit in die Wäsche (Schuhe, Jacken, Handschuhe usw. nicht)
export const SPORT_WASH = ['unterhemd', 'oben_kurz', 'oben_lang', 'unten_kurz', 'unten_lang', 'armlinge', 'knielinge', 'beinlinge', 'kopf_duenn', 'halstuch'];
const discipline = (art) => (art === 'laufen' ? 'laufen' : 'rad'); // Gravel & Rennrad = Rad

/**
 * Bedingungen während der Einheit aus der stündlichen Vorhersage.
 * day: Tageswetter (mit hours[]), start: "HH:MM", dauer: Stunden
 */
export function activityConditions(day, start, dauer) {
  if (!day) return null;
  const h0 = parseInt(start, 10) || 9;
  const hours = (day.hours || []).filter((h) => h.h >= h0 && h.h < h0 + Math.max(1, Math.ceil(dauer)));
  if (!hours.length) {
    return { tmin: day.tmin, tmax: day.tmax, wind: day.wind ?? 10, rain: day.rain ?? 0, hourly: false };
  }
  return {
    tmin: Math.min(...hours.map((h) => h.temp)),
    tmax: Math.max(...hours.map((h) => h.temp)),
    wind: Math.max(...hours.map((h) => h.wind)),
    rain: Math.max(...hours.map((h) => h.rain)),
    hourly: true,
  };
}

/**
 * Gefühlte Temperatur für die Kleiderwahl ("Effektivtemperatur").
 * Rad: Fahrtwind kühlt – Rennrad stärker als Gravel. Starker Wind kühlt zusätzlich.
 */
export function effectiveTemp(art, c) {
  let e = c.tmin;
  if (art === 'rennrad') e -= 3;
  if (art === 'gravel') e -= 2;
  if (c.wind >= 25) e -= 2;
  return Math.round(e);
}

// ---------- Regeln: welche Funktionen werden gebraucht? ----------
// Jede Zeile hat Alternativen (Liste von Sportteil-Typen); die erste, die im Schrank vorhanden ist, gewinnt.
function radRules(E, c) {
  const need = [], notes = [];
  const add = (label, ...alts) => need.push({ label, alts });
  const spread = c.tmax - c.tmin >= 5; // es wird während der Fahrt deutlich wärmer
  if (spread) notes.push(`Es wird während der Fahrt ${Math.round(c.tmax - c.tmin)} °C wärmer – abnehmbare Teile (Armlinge, Weste) bevorzugt.`);

  if (E < 16) add('Funktionsunterhemd', ['unterhemd']);
  if (E >= 16) add('Trikot kurzarm', ['oben_kurz']);
  else if (E >= 10) add(spread ? 'Trikot kurz + Armlinge' : 'Langarmtrikot', ...(spread ? [['oben_kurz', 'armlinge'], ['oben_lang']] : [['oben_lang'], ['oben_kurz', 'armlinge']]));
  else add('Langarmtrikot', ['oben_lang'], ['oben_kurz', 'armlinge']);

  if (c.rain >= 50) add('Regenjacke', ['regenjacke'], ['windjacke']);
  else if (E < 4) add('Winterjacke', ['thermojacke'], ['windjacke']);
  else if (E < 6) add('Windjacke', ['windjacke'], ['weste']);
  else if (E < 16 || c.wind >= 25) add('Weste', ['weste'], ['windjacke']); // Weste lässt sich unterwegs ausziehen

  if (E >= 16) add('Radhose kurz', ['unten_kurz']);
  else if (E >= 12) add('Radhose kurz + Knielinge', ['unten_kurz', 'knielinge'], ['unten_kurz', 'beinlinge']);
  else if (E >= 6) add('Radhose kurz + Beinlinge', ['unten_kurz', 'beinlinge'], ['unten_lang']); // flexibel: Beinlinge lassen sich abnehmen
  else add('Lange Winterhose', ['unten_lang'], ['unten_kurz', 'beinlinge']);

  if (E >= 14) add('Kurzfingerhandschuhe', ['handschuhe_kurz'], ['handschuhe_lang']);
  else if (E >= 5) add('Langfingerhandschuhe', ['handschuhe_lang'], ['handschuhe_winter']);
  else add('Winterhandschuhe', ['handschuhe_winter'], ['handschuhe_lang']);

  if (E < 4) add('Warme Mütze unterm Helm', ['kopf_warm'], ['kopf_duenn']);
  else if (E < 8) add('Unterhelmmütze / Stirnband', ['kopf_duenn'], ['kopf_warm']);
  if (E < 6) add('Halstuch / Buff', ['halstuch']);

  if (E < 8 || c.rain >= 50) add('Überschuhe', ['ueberschuhe']);
  add('Radschuhe', ['schuhe']);
  if (E < 0) notes.push('Unter 0 °C gefühlt: Glätte möglich – eventuell lieber Rolle/Indoor.');
  return { need, notes };
}

function laufRules(E, c) {
  const need = [], notes = [];
  const add = (label, ...alts) => need.push({ label, alts });
  notes.push('Beim Laufen wird dir schnell warm – lieber etwas zu kühl starten.');
  if (E < 0) add('Funktionsunterhemd', ['unterhemd']);
  if (E >= 12) add('Laufshirt kurzarm', ['oben_kurz'], ['oben_lang']);
  else add('Langarm-Laufshirt', ['oben_lang'], ['oben_kurz', 'armlinge']);

  if (c.rain >= 50 && E < 18) add('Regenjacke', ['regenjacke'], ['windjacke']);
  else if (E < 2) add('Thermo- oder Windjacke', ['thermojacke'], ['windjacke']);
  else if (E < 7 || (c.wind >= 30 && E < 14)) add('Windjacke oder Weste', ['windjacke'], ['weste']);

  if (E >= 10) add('Kurze Laufhose', ['unten_kurz'], ['unten_lang']);
  else add('Lange Tights', ['unten_lang'], ['unten_kurz']);

  if (E < 0) add('Winterhandschuhe', ['handschuhe_winter'], ['handschuhe_lang']);
  else if (E < 5) add('Dünne Handschuhe', ['handschuhe_lang'], ['handschuhe_winter']);
  if (E < 0) add('Warme Mütze', ['kopf_warm'], ['kopf_duenn']);
  else if (E < 6) add('Stirnband / dünne Mütze', ['kopf_duenn'], ['kopf_warm']);
  if (E < -3) add('Halstuch / Buff', ['halstuch']);
  add('Laufschuhe', ['schuhe']);
  return { need, notes };
}

// ---------- Passende Teile aus dem Schrank ----------
export function inLaundry(item, date, laundryDays) {
  if (!item.laundrySince) return false;
  return (date - new Date(item.laundrySince + 'T12:00:00')) / DAY < laundryDays;
}

function candidates(items, type, art, date, laundryDays, withLaundry = false) {
  const disc = discipline(art);
  return items.filter((i) => i.sportteil === type
    && (!(i.sportarten || []).length || i.sportarten.includes(disc))
    && (withLaundry || !inLaundry(i, date, laundryDays)));
}

/**
 * Stellt die Sportkleidung zusammen.
 * avoid: Teile, die (z. B. im Wochenplan) schon an anderen Tagen eingeplant sind.
 */
export function sportKit({ items, art, cond, date, laundryDays = 3, avoid = new Set() }) {
  const E = effectiveTemp(art, cond);
  const { need, notes } = art === 'laufen' ? laufRules(E, cond) : radRules(E, cond);
  const used = new Set();
  const pickOne = (type) => {
    const list = candidates(items, type, art, date, laundryDays).filter((i) => !used.has(i.id));
    // Am liebsten: diese Woche noch nicht eingeplant, am längsten nicht getragen
    list.sort((a, b) => (avoid.has(a.id) - avoid.has(b.id)) || String(a.lastWorn || '').localeCompare(String(b.lastWorn || '')));
    return list[0] || null;
  };
  const lines = need.map((n) => {
    let best = null;
    for (const alt of n.alts) {
      const picked = alt.map((t) => ({ type: t, item: pickOne(t) }));
      const missing = picked.filter((p) => !p.item).length;
      if (!best || missing < best.missing) best = { picked, missing };
      if (!missing) break;
    }
    best.picked.forEach((p) => p.item && used.add(p.item.id));
    const gaps = best.picked.filter((p) => !p.item);
    // Unterscheiden: gar nicht im Schrank – oder nur gerade in der Wäsche?
    const dirty = gaps.flatMap((p) => candidates(items, p.type, art, date, laundryDays, true).slice(0, 1));
    return {
      label: n.label,
      items: best.picked.filter((p) => p.item).map((p) => p.item),
      dirty,
      missing: gaps.filter((p) => !candidates(items, p.type, art, date, laundryDays, true).length).map((p) => SPORTTEILE[p.type]),
    };
  });
  return { E, lines, notes, items: lines.flatMap((l) => l.items) };
}
