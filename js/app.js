// Oberfläche der App: Ansichten Schrank, Outfit, Woche, Einstellungen
import { db, uid } from './db.js';
import { analyzeClothing } from './ai.js';
import { getForecast, searchPlace, weatherIcon } from './weather.js';
import { SPORTARTEN, SPORTTEILE, SPORT_WASH, activityConditions, sportKit, inLaundry } from './sport.js';
import { MAX_FAV_PER_WEEK } from './outfits.js';
import { generateTryOn, getCachedTryOn, tryOnKey, clearTryOnCache, DEFAULT_IMAGE_MODEL } from './tryon.js';
import {
  KATEGORIEN, ANLAESSE, SAISONS, SLOT_ORDER,
  makeContext, suggestOutfit, swapSlot, planWeek, missingHints, dayTemp, pairKey, outfitKey,
} from './outfits.js';

// ---------- Hilfsfunktionen ----------
const $main = document.getElementById('main');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseYmd = (s) => new Date(s + 'T12:00:00');
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const fmtDay = (d) => `${WT[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
const today = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };

const urlCache = new Map();
function imgUrl(item) {
  if (!item?.image) return '';
  let e = urlCache.get(item.id);
  if (!e || e.blob !== item.image) {
    if (e) URL.revokeObjectURL(e.url);
    e = { blob: item.image, url: URL.createObjectURL(item.image) };
    urlCache.set(item.id, e);
  }
  return e.url;
}

let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

async function resizeImage(file, max = 1024) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s);
    c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- Zustand ----------
const DEFAULT_SETTINGS = {
  apiKey: '',
  location: null,
  weekdayOccasions: ['freizeit', 'buero', 'buero', 'buero', 'buero', 'buero', 'freizeit'], // So..Sa
  repeatCats: ['unterteil', 'schuhe', 'jacke', 'accessoire'],
  googleKey: '',
  imageModel: DEFAULT_IMAGE_MODEL,
  laundryDays: 3,                       // nach so vielen Tagen ist ein Teil wieder sauber
  autoLaundryCats: ['oberteil'],        // diese Kategorien wandern nach dem Tragen automatisch in die Wäsche
  sport: { art: 'rennrad', start: '09:00', dauer: 2 },
};
const state = {
  view: 'schrank',
  items: [],
  settings: { ...DEFAULT_SETTINGS },
  forecast: null,
  filter: 'alle',
  editing: null,       // Kleidungsstück im Editor
  analyzing: false,
  outfit: { date: ymd(today()), occasion: null, current: null, seen: new Set(), ctx: null, sport: null, dislike: null },
  prefs: emptyPrefs(),
  week: null,
  placeResults: [],
  body: null,          // Ganzkörperfoto { blob, version }
  openSettings: new Set(), // aufgeklappte Bereiche in den Einstellungen
  showFlat: false,     // Einzelteile statt Anprobe-Bild zeigen
};

async function saveSettings() { await db.set('settings', state.settings); }
function emptyPrefs() {
  // ratings: Outfit-Bewertung je Kombination (1 = gut, 2 = Lieblingsoutfit)
  // pairs/colorPairs/occ: gelernte Vorlieben; swaps/shown: stilles Signal; tempOffset: Wärmeempfinden
  return { pairs: {}, blocked: [], favorites: [], ratings: {}, colorPairs: {}, occ: {}, swaps: {}, shown: {}, tempOffset: 0 };
}
async function savePrefs() { await db.set('prefs', state.prefs); }
const bump = (obj, key, d) => { obj[key] = Math.round(((obj[key] || 0) + d) * 100) / 100; if (!obj[key]) delete obj[key]; };
const washes = (i) => (sportOnly(i) ? SPORT_WASH.includes(i.sportteil) : state.settings.autoLaundryCats.includes(i.kategorie));
function extras() {
  return {
    laundryDays: state.settings.laundryDays,
    washes,
    prefs: { ...state.prefs, blocked: new Set(state.prefs.blocked), favKeys: new Set(state.prefs.favorites.map((f) => f.key)) },
  };
}
const laundryNow = (i) => inLaundry(i, today(), state.settings.laundryDays);
const sportOnly = (i) => (i.anlaesse || []).length > 0 && i.anlaesse.every((a) => a === 'sport');
const itemById = (id) => state.items.find((i) => i.id === id);
const weatherFor = (dateStr) => state.forecast?.[dateStr] || null;
const defaultOccasion = (d) => state.settings.weekdayOccasions[d.getDay()] || 'freizeit';

async function loadForecast() {
  state.forecast = await getForecast(state.settings.location);
}

// ---------- UI-Bausteine ----------
const icon = (n, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${n}"></use></svg>`;
const WTL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const longDate = (d) => `${WTL[d.getDay()]}, ${d.getDate()}. ${MONATE[d.getMonth()]}`;
const greeting = () => { const h = new Date().getHours(); return h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend'; };
function pageHead(eyebrow, title, right = '') {
  return `<header class="phead"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1></div>${right}</header>`;
}
function wpill(dateStr) {
  const w = weatherFor(dateStr);
  return w ? `<div class="wpill" title="${esc(state.settings.location?.name || '')}">${weatherIcon(w.code)} <b>${Math.round(w.tmax)}°</b><span>${Math.round(w.tmin)}°</span></div>` : '';
}
function emptyCard(ic, title, text, actions = '') {
  return `<section class="emptystate small"><div class="emblem">${icon(ic)}</div><h2>${title}</h2><p>${text}</p>${actions}</section>`;
}

// Erste Schritte: führt neue Nutzer durch die Einrichtung (ausblendbar)
function onboarding() {
  const s = state.settings;
  if (s.onboardingDone) return '';
  const steps = [
    { done: !!s.location, title: 'Ort fürs Wetter festlegen', text: 'Damit die Outfits zur Vorhersage passen.', act: 'data-act="go" data-view="einstellungen" data-open="ort"' },
    { done: state.items.length >= 5, title: 'Kleidung hinzufügen', text: 'Fotografieren – oder den Beispiel-Schrank laden.', act: 'data-act="go" data-view="schrank"' },
    { done: !!s.apiKey, opt: true, title: 'Automatische Erkennung', text: 'Claude erkennt Art, Farbe und Stil aus dem Foto.', act: 'data-act="go" data-view="einstellungen" data-open="ki"' },
    { done: !!(state.body && s.googleKey), opt: true, title: 'Virtuelle Anprobe', text: 'Sieh die Outfits an dir – mit Ganzkörperfoto.', act: 'data-act="go" data-view="einstellungen" data-open="anprobe"' },
  ];
  const n = steps.filter((x) => x.done).length;
  if (n === steps.length) return '';
  // Pflichtschritte erledigt: nur noch eine kompakte Zeile für die optionalen Extras
  if (steps.every((x) => x.done || x.opt)) {
    const next = steps.find((x) => !x.done);
    return `<section class="onboard compact"><button ${next.act}><span class="cta-ic">${icon(next.title.includes('Anprobe') ? 'person' : 'wand')}</span>
      <span><b>${next.title}</b><small>${next.text}</small></span>${icon('chevron-right')}</button>
      <button class="iconbtn" data-act="obHide" aria-label="Hinweis ausblenden">${icon('x')}</button></section>`;
  }
  return `<section class="onboard">
    <div class="ob-head"><div><p class="eyebrow">Erste Schritte</p><h2>${n} von ${steps.length} erledigt</h2></div>
      <button class="iconbtn" data-act="obHide" aria-label="Erste Schritte ausblenden">${icon('x')}</button></div>
    <div class="progress"><i style="width:${(n / steps.length) * 100}%"></i></div>
    <ol>${steps.map((st) => `<li class="${st.done ? 'done' : ''}"><button ${st.act}>
      <span class="ob-check">${st.done ? icon('check') : ''}</span>
      <span><b>${st.title}${st.opt ? '<em>optional</em>' : ''}</b><small>${st.text}</small></span>${st.done ? '' : icon('chevron-right')}</button></li>`).join('')}</ol>
  </section>`;
}

// ---------- Navigation ----------
function go(view) {
  state.view = view;
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  render();
  window.scrollTo(0, 0);
}

function render() {
  document.body.classList.toggle('editing', !!state.editing);
  const v = state.editing ? renderEditor() : ({
    schrank: renderSchrank, outfit: renderOutfit, woche: renderWoche, einstellungen: renderSettings,
  })[state.view]();
  $main.innerHTML = v;
  hydrateTryOns().catch(console.error);
}

let bodyCache = null;
function bodyUrl() {
  if (!state.body) return '';
  if (bodyCache?.blob !== state.body.blob) {
    if (bodyCache) URL.revokeObjectURL(bodyCache.url);
    bodyCache = { blob: state.body.blob, url: URL.createObjectURL(state.body.blob) };
  }
  return bodyCache.url;
}

// ---------- Ansicht: Schrank ----------
function renderSchrank() {
  const counts = {};
  state.items.forEach((i) => { counts[i.kategorie] = (counts[i.kategorie] || 0) + 1; });
  const list = state.items
    .filter((i) => state.filter === 'alle' || (state.filter === 'waesche' ? laundryNow(i)
      : state.filter === 'liebling' || state.filter === 'ungern' ? i.bewertung === state.filter : i.kategorie === state.filter))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const nLaundry = state.items.filter(laundryNow).length;
  const nFav = state.items.filter((i) => i.bewertung === 'liebling').length;
  const nBad = state.items.filter((i) => i.bewertung === 'ungern').length;
  const fileInput = '<input id="photoInput" type="file" accept="image/*" multiple hidden>';
  if (!state.items.length) {
    return pageHead('Willkommen', 'Kleiderschrank') + `
      <section class="emptystate">
        <div class="emblem">${icon('hanger')}</div>
        <h2>Dein Schrank ist noch leer</h2>
        <p>Fotografiere deine Kleidung. Die App erkennt Art, Farbe und Stil und stellt daraus Outfits für jeden Tag zusammen.</p>
        <label class="btn primary">${icon('camera')} Erstes Teil fotografieren${fileInput}</label>
        <button class="btn" data-act="loadDemo">${icon('sparkle')} Beispiel-Schrank laden</button>
        <p class="fine">47 gezeichnete Beispielteile (Alltag, Büro, Laufen, Rad) zum Ausprobieren – ohne Kosten, jederzeit wieder entfernbar.</p>
      </section>`;
  }
  const chips = [['alle', `Alle ${state.items.length}`], ...(nFav || state.filter === 'liebling' ? [['liebling', `❤️ Lieblinge ${nFav}`]] : []),
    ...(nLaundry || state.filter === 'waesche' ? [['waesche', `🧺 Wäsche ${nLaundry}`]] : []),
    ...(nBad || state.filter === 'ungern' ? [['ungern', `👎 Ungern ${nBad}`]] : []),
    ...Object.entries(KATEGORIEN).filter(([k]) => counts[k]).map(([k, v]) => [k, `${v} ${counts[k]}`])];
  const hints = {
    liebling: `Lieblingsteile werden bevorzugt und dürfen im Wochenplan bis zu ${MAX_FAV_PER_WEEK}× pro Woche vorkommen – mit genug Abstand, wenn sie zwischendurch in die Wäsche müssen.`,
    ungern: 'Diese Teile schlägt die App nur noch vor, wenn nichts anderes passt. Gute Kandidaten zum Aussortieren.',
    waesche: `Teile im Wäschekorb werden nicht vorgeschlagen und sind nach ${state.settings.laundryDays} Tagen automatisch wieder verfügbar.${nLaundry ? `<br><button class="btn sm" data-act="allClean">${icon('check')} Alles wieder sauber</button>` : ''}`,
  };
  return pageHead(`${state.items.length} Teile`, 'Kleiderschrank') + `
    <div class="chips scroll">${chips.map(([k, l]) => `<button class="chip ${state.filter === k ? 'on' : ''}" data-act="filter" data-k="${k}">${esc(l)}</button>`).join('')}</div>
    ${hints[state.filter] ? `<div class="hint">${hints[state.filter]}</div>` : ''}
    ${list.length ? `<div class="grid">${list.map((i) => `
      <button class="tile ${laundryNow(i) ? 'laundry' : ''}" data-act="edit" data-id="${i.id}">
        <div class="ph"><img src="${imgUrl(i)}" alt="" loading="lazy">${laundryNow(i) ? '<em class="badge">🧺</em>' : ''}${i.bewertung === 'liebling' ? '<em class="badge left">❤️</em>' : i.bewertung === 'ungern' ? '<em class="badge left">👎</em>' : ''}</div>
        <span>${esc(i.bezeichnung || KATEGORIEN[i.kategorie])}</span>
      </button>`).join('')}</div>` : '<p class="fine center">Keine Teile in dieser Auswahl.</p>'}
    <label class="fab" aria-label="Kleidungsstück hinzufügen">${icon('plus')}${fileInput}</label>`;
}

async function handlePhotos(files) {
  files = [...files];
  if (!files.length) return;
  if (files.length === 1) {
    const image = await resizeImage(files[0]);
    state.editing = newItem(image);
    state.editing.isNew = true;
    render();
    if (state.settings.apiKey) runAnalysis();
    return;
  }
  // Mehrere Fotos: alle nacheinander erkennen und direkt speichern
  let ok = 0;
  for (const [n, f] of files.entries()) {
    toast(`Foto ${n + 1} von ${files.length} wird verarbeitet …`);
    const item = newItem(await resizeImage(f));
    if (state.settings.apiKey) {
      try { Object.assign(item, normalize(await analyzeClothing(item.image, state.settings.apiKey))); ok++; } catch (e) { toast(e.message); }
    }
    await db.putItem(item);
    state.items.push(item);
    render();
  }
  toast(`${files.length} Teile hinzugefügt${state.settings.apiKey ? `, ${ok} automatisch erkannt` : ''}. Bitte kurz prüfen.`);
}

function newItem(image) {
  return {
    id: uid(), createdAt: Date.now(), image,
    kategorie: 'oberteil', bezeichnung: '', farben: [{ name: 'Schwarz', hex: '#222222', neutral: true }],
    muster: 'uni', formalitaet: 2, waerme: 3, saisons: Object.keys(SAISONS), anlaesse: ['freizeit'],
    regenfest: false, lastWorn: null, wornCount: 0, sportteil: 'keins', sportarten: [], laundrySince: null,
  };
}

function normalize(ai) {
  return {
    kategorie: KATEGORIEN[ai.kategorie] ? ai.kategorie : 'oberteil',
    bezeichnung: ai.bezeichnung || '',
    farben: (ai.farben || []).slice(0, 3).map((f) => ({ name: f.name, hex: /^#[0-9a-f]{6}$/i.test(f.hex) ? f.hex : '#888888', neutral: !!f.neutral })),
    muster: ai.muster === 'gemustert' ? 'gemustert' : 'uni',
    formalitaet: ai.formalitaet || 2,
    waerme: ai.waerme || 3,
    saisons: (ai.saisons || []).filter((s) => SAISONS[s]),
    anlaesse: (ai.anlaesse || []).filter((a) => ANLAESSE[a]),
    regenfest: !!ai.regenfest,
    sportteil: SPORTTEILE[ai.sportteil] ? ai.sportteil : 'keins',
    sportarten: (ai.sportarten || []).filter((a) => a === 'laufen' || a === 'rad'),
  };
}

async function runAnalysis() {
  const item = state.editing;
  if (!item) return;
  state.analyzing = true;
  render();
  try {
    const result = normalize(await analyzeClothing(item.image, state.settings.apiKey));
    if (state.editing === item) Object.assign(item, result);
    toast('Erkannt – bitte kurz prüfen.');
  } catch (e) {
    toast(e.message);
  } finally {
    state.analyzing = false;
    if (state.editing === item) render();
  }
}

// ---------- Editor für ein Kleidungsstück ----------
const FORM_LABELS = ['', 'Sport', 'Lässig', 'Smart casual', 'Business', 'Festlich'];
const WARM_LABELS = ['', 'Sehr leicht', 'Leicht', 'Mittel', 'Warm', 'Sehr warm'];

function renderEditor() {
  const i = state.editing;
  const opt = (obj, val) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === val ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const multi = (name, obj, vals) => Object.entries(obj).map(([k, v]) => `
    <label class="chip check"><input type="checkbox" name="${name}" value="${k}" ${vals.includes(k) ? 'checked' : ''}><span>${esc(v)}</span></label>`).join('');
  const isSport = i.sportteil && i.sportteil !== 'keins';
  return `
    <header class="navbar"><button class="navback" data-act="cancelEdit">${icon('chevron-left')} Zurück</button>
      <span class="navtitle">${i.isNew ? 'Neues Teil' : 'Bearbeiten'}</span><span></span></header>
    <form id="itemForm" class="editor">
      <div class="photo"><img src="${imgUrl(i)}" alt="">${state.analyzing ? '<div class="overlay"><div class="spinner"></div>KI erkennt das Teil …</div>' : ''}</div>
      ${state.settings.apiKey && !state.analyzing ? `<button type="button" class="btn ghost small" data-act="analyze">${icon('wand')} Erneut automatisch erkennen</button>` : ''}
      ${!state.settings.apiKey && i.isNew ? `<div class="hint">Tipp: Mit einem Claude-Schlüssel füllt die App diese Angaben automatisch aus. <a href="#" data-act="go" data-view="einstellungen" data-open="ki">Einrichten</a></div>` : ''}
      <section class="group"><h3>Wie gern trägst du das?</h3>
        <div class="seg3">${[['liebling', '❤️ Liebling'], ['', 'Normal'], ['ungern', '👎 Ungern']].map(([v, l]) => `<label class="chip check"><input type="radio" name="bewertung" value="${v}" ${(i.bewertung || '') === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      </section>
      <section class="group"><h3>Grunddaten</h3>
        <label class="field">Bezeichnung<input name="bezeichnung" value="${esc(i.bezeichnung)}" placeholder="z. B. Dunkelblaue Chino"></label>
        <label class="field">Kategorie<select name="kategorie">${opt(KATEGORIEN, i.kategorie)}</select></label>
      </section>
      <section class="group"><h3>Farben & Muster</h3>
        <div id="colors" class="editor">${(i.farben || []).map((f, n) => colorRow(f, n)).join('')}</div>
        <button type="button" class="btn ghost small" data-act="addColor">${icon('plus')} Farbe hinzufügen</button>
        <div class="seg3" style="grid-template-columns:1fr 1fr">
          <label class="chip check"><input type="radio" name="muster" value="uni" ${i.muster !== 'gemustert' ? 'checked' : ''}><span>Uni</span></label>
          <label class="chip check"><input type="radio" name="muster" value="gemustert" ${i.muster === 'gemustert' ? 'checked' : ''}><span>Gemustert</span></label>
        </div>
      </section>
      <section class="group"><h3>Eigenschaften</h3>
        <label class="range">Stil: <b id="formOut">${FORM_LABELS[i.formalitaet]}</b><input type="range" name="formalitaet" min="1" max="5" value="${i.formalitaet}" data-out="formOut" data-labels="form"></label>
        <label class="range">Wärme: <b id="warmOut">${WARM_LABELS[i.waerme]}</b><input type="range" name="waerme" min="1" max="5" value="${i.waerme}" data-out="warmOut" data-labels="warm"></label>
        <label class="switchrow">Regenfest<input type="checkbox" class="switch" name="regenfest" ${i.regenfest ? 'checked' : ''}></label>
      </section>
      <section class="group"><h3>Anlässe</h3><div class="chips">${multi('anlaesse', ANLAESSE, i.anlaesse || [])}</div>
        <h3>Jahreszeiten</h3><div class="chips">${multi('saisons', SAISONS, i.saisons || [])}</div>
      </section>
      <details class="group sportbox" ${isSport ? 'open' : ''}><summary>Sportbekleidung</summary>
        <p class="fine" style="margin:0">Nur für Lauf- und Radkleidung: Die Funktion braucht der Sport-Modus.</p>
        <label class="field">Funktion<select name="sportteil">${opt(SPORTTEILE, i.sportteil || 'keins')}</select></label>
        <div class="chips">${multi('sportarten', { laufen: 'Laufen', rad: 'Radfahren' }, i.sportarten || [])}</div>
      </details>
      ${!i.isNew ? `<section class="group"><h3>Status</h3>
        <div class="statusrow"><span>${laundryNow(i) ? '🧺 Liegt in der Wäsche' : 'Im Schrank'}<br><span class="fine">Getragen: ${i.wornCount || 0}×${i.lastWorn ? ` · zuletzt ${fmtDay(parseYmd(i.lastWorn))}` : ''}</span></span>
          <button type="button" class="btn sm" data-act="toggleLaundry">${laundryNow(i) ? `${icon('check')} Wieder sauber` : `${icon('basket')} In die Wäsche`}</button></div>
        <button type="button" class="btn danger sm" data-act="deleteItem">${icon('trash')} Teil löschen</button>
      </section>` : ''}
      <div class="savebar"><button type="submit" class="btn primary block" ${state.analyzing ? 'disabled' : ''}>${icon('check')} Speichern</button></div>
    </form>`;
}

function colorRow(f, n) {
  return `<div class="colorrow" data-n="${n}">
    <input type="color" name="hex" value="${esc(f.hex)}">
    <input name="cname" value="${esc(f.name)}" placeholder="Farbname">
    <label><input type="checkbox" name="neutral" ${f.neutral ? 'checked' : ''}> neutral</label>
    <button type="button" class="x" data-act="removeColor" data-n="${n}" aria-label="Farbe entfernen">×</button>
  </div>`;
}

function readForm() {
  const form = document.getElementById('itemForm');
  if (!form) return;
  const fd = new FormData(form);
  const i = state.editing;
  i.bezeichnung = fd.get('bezeichnung').trim();
  i.kategorie = fd.get('kategorie');
  i.muster = fd.get('muster');
  i.formalitaet = +fd.get('formalitaet');
  i.waerme = +fd.get('waerme');
  i.anlaesse = fd.getAll('anlaesse');
  i.saisons = fd.getAll('saisons');
  i.regenfest = fd.get('regenfest') === 'on';
  i.sportteil = fd.get('sportteil') || 'keins';
  i.bewertung = fd.get('bewertung') || null;
  i.sportarten = fd.getAll('sportarten');
  i.farben = [...form.querySelectorAll('.colorrow')].map((r) => ({
    hex: r.querySelector('[name=hex]').value,
    name: r.querySelector('[name=cname]').value.trim(),
    neutral: r.querySelector('[name=neutral]').checked,
  }));
}

async function saveEditing() {
  readForm();
  const i = state.editing;
  if (!i.anlaesse.length) { toast('Bitte mindestens einen Anlass wählen.'); return; }
  const wasNew = i.isNew;
  delete i.isNew;
  await db.putItem(i);
  const idx = state.items.findIndex((x) => x.id === i.id);
  if (idx >= 0) state.items[idx] = i; else state.items.push(i);
  state.editing = null;
  toast(wasNew ? 'Im Schrank gespeichert.' : 'Gespeichert.');
  render();
}

// ---------- Ansicht: Outfit für einen Tag ----------
function weatherBlock(dateStr) {
  const w = weatherFor(dateStr);
  const d = parseYmd(dateStr);
  const off = state.prefs.tempOffset ? ` · persönlich ${state.prefs.tempOffset > 0 ? '+' : ''}${state.prefs.tempOffset} °C` : '';
  if (!state.settings.location) {
    return `<div class="weather"><span class="wi">🌡️</span><span><b>Kein Ort festgelegt</b><br><span class="muted">Gerechnet wird mit ${dayTemp(null, d)} °C (Jahreszeit).</span></span>
      <button class="btn sm" data-act="go" data-view="einstellungen" data-open="ort">${icon('pin')} Ort</button></div>`;
  }
  if (!w) return `<div class="weather"><span class="wi">🌡️</span><span>Keine Vorhersage für diesen Tag – gerechnet wird mit ${dayTemp(null, d)} °C.</span></div>`;
  return `<div class="weather"><span class="wi">${weatherIcon(w.code)}</span>
    <span><b>${Math.round(w.tmin)}° bis ${Math.round(w.tmax)}°</b> · Regen ${w.rain ?? 0} %<br><span class="muted">${esc(state.settings.location.name.split(',')[0])}${off}</span></span></div>`;
}

// Einzelteile als Liste: Bild, Kategorie, Name, Farben, Tausch-Knopf
function itemList(slots, act, extra = '') {
  return `<ul class="itemlist">${SLOT_ORDER.filter((k) => slots[k]).map((k) => {
    const it = slots[k];
    const fav = it.bewertung === 'liebling';
    return `<li>
      <img src="${imgUrl(it)}" alt="">
      <div class="il-text"><small>${esc(KATEGORIEN[k])}</small><b>${esc(it.bezeichnung || KATEGORIEN[k])}</b>
        <span class="dots">${(it.farben || []).map((f) => `<i style="background:${esc(f.hex)}" title="${esc(f.name)}"></i>`).join('')}</span></div>
      <button class="iconbtn heartbtn ${fav ? 'on' : ''}" data-act="favItem" data-id="${it.id}" aria-label="${fav ? 'Kein Lieblingsteil mehr' : 'Als Lieblingsteil markieren'}">${icon(fav ? 'heart-fill' : 'heart')}</button>
      <button class="iconbtn swapbtn" data-act="${act}" data-slot="${k}" ${extra} aria-label="${esc(KATEGORIEN[k])} austauschen">${icon('refresh')}</button>
    </li>`;
  }).join('')}</ul>`;
}

// ---------- Anprobe ----------
const tryState = new Map(); // Schlüssel -> { status: 'loading' | 'done' | 'error', url, error }
const tryChecked = new Set();

function tryOnBlock(slots, attrs) {
  // "Look"-Karte: Flat-Lay der Einzelteile – oder das Anprobe-Bild, sobald es erzeugt ist
  const items = SLOT_ORDER.filter((k) => slots[k]).map((k) => slots[k]);
  const flat = `<div class="flatlay n${Math.min(items.length, 6)}">${items.slice(0, 6).map((i) => `<img src="${imgUrl(i)}" alt="${esc(i.bezeichnung)}">`).join('')}</div>`;
  if (!state.body) {
    return `<div class="look tryon-box">${flat}
      <button class="look-btn" data-act="go" data-view="einstellungen" data-open="anprobe">${icon('person')} Anprobe einrichten</button></div>`;
  }
  const key = tryOnKey(slots, state.body.version);
  const t = tryState.get(key);
  if (t?.status === 'done' && !state.showFlat) {
    return `<div class="look tryon-box"><img class="tryon" src="${t.url}" alt="Anprobe" data-act="zoom">
      <div class="look-bar"><button class="look-btn" data-act="lookFlat">${icon('grid')} Einzelteile</button>
      <button class="look-btn" data-act="tryon" data-force="1" ${attrs}>${icon('refresh')} Neu</button></div></div>`;
  }
  if (t?.status === 'loading') {
    return `<div class="look tryon-box loading" data-trykey="${esc(key)}">${flat}
      <div class="look-load"><div class="spinner dark"></div><b>Anprobe wird erstellt …</b><small>dauert ca. 10–40 Sekunden</small></div></div>`;
  }
  return `<div class="look tryon-box" data-trykey="${esc(key)}">${flat}
    ${t?.status === 'error' ? `<p class="err">${esc(t.error)}</p>` : ''}
    <div class="look-bar">${t?.status === 'done'
      ? `<button class="look-btn primary" data-act="lookFlat">${icon('person')} Anprobe zeigen</button>`
      : `<button class="look-btn primary" data-act="tryon" ${attrs}>${icon('person')} ${t?.status === 'error' ? 'Erneut versuchen' : 'An mir ansehen'}</button>`}</div></div>`;
}

// Bereits erzeugte Bilder aus dem Speicher holen, ohne Google erneut zu fragen
async function hydrateTryOns() {
  if (!state.body) return;
  const lists = [];
  if (state.view === 'outfit' && state.outfit.current) lists.push(state.outfit.current.slots);
  if (state.view === 'woche' && state.week) state.week.days.forEach((d) => d.outfit && lists.push(d.outfit.slots));
  let found = false;
  for (const slots of lists) {
    const key = tryOnKey(slots, state.body.version);
    if (tryState.has(key) || tryChecked.has(key)) continue;
    tryChecked.add(key);
    const blob = await getCachedTryOn(slots, state.body.version);
    if (blob) { tryState.set(key, { status: 'done', url: URL.createObjectURL(blob) }); found = true; }
  }
  if (found) render();
}

async function runTryOn(slots) {
  const key = tryOnKey(slots, state.body?.version);
  tryState.set(key, { status: 'loading' });
  render();
  try {
    const blob = await generateTryOn({ slots, body: state.body, apiKey: state.settings.googleKey, model: state.settings.imageModel });
    tryState.set(key, { status: 'done', url: URL.createObjectURL(blob) });
  } catch (e) {
    console.error(e);
    tryState.set(key, { status: 'error', error: e.message });
  }
  render();
}

function zoom(src) {
  const z = document.getElementById('zoom');
  z.querySelector('img').src = src;
  z.hidden = false;
}

function renderOutfit() {
  const o = state.outfit;
  const d = parseYmd(o.date);
  if (!o.occasion) o.occasion = defaultOccasion(d);
  if (!state.items.length) {
    return outfitHeader(o) + onboarding() + emptyCard('hanger', 'Noch keine Kleidung', 'Lege zuerst ein paar Teile in den Schrank – oder lade den Beispiel-Schrank.',
      `<button class="btn primary" data-act="go" data-view="schrank">${icon('hanger')} Zum Schrank</button>`);
  }
  if (o.occasion === 'sport') return outfitHeader(o) + renderSportOutfit(o);
  let body;
  if (o.current) {
    body = `${tryOnBlock(o.current.slots, 'data-src="outfit"')}
      <div class="tags">${o.current.reasons.map((r) => `<span class="tag">${esc(r)}</span>`).join('')}</div>
      ${feedbackBlock(o)}
      <h2 class="sec">Die Teile im Einzelnen</h2>
      ${itemList(o.current.slots, 'swap')}
      <div class="actionbar">
        <button class="btn" data-act="suggest">${icon('shuffle')} Neu mischen</button>
        <button class="btn primary" data-act="wearToday">${icon('check')} Anziehen</button>
      </div>`;
  } else {
    body = `${o.hints ? `<div class="hint"><b>Für ein Outfit fehlt noch:</b><ul>${o.hints.map((h) => `<li>${esc(h)}</li>`).join('')}</ul></div>` : ''}
      <button class="cta" data-act="suggest"><span class="cta-ic">${icon('sparkle')}</span>
        <span><b>Outfit vorschlagen</b><small>Passend zu Wetter, Anlass und deinen Vorlieben</small></span>${icon('chevron-right')}</button>`;
  }
  return outfitHeader(o) + onboarding() + weatherBlock(o.date) + body + favoritesBlock(o);
}

function outfitHeader(o) {
  const t = ymd(today()), m = ymd(addDays(today(), 1));
  const d = parseYmd(o.date);
  const other = o.date !== t && o.date !== m;
  return pageHead(o.date === t ? `${greeting()} · ${longDate(d)}` : longDate(d), o.occasion === 'sport' ? 'Dein Training' : 'Dein Outfit', wpill(o.date)) + `
    <div class="seg" role="tablist" aria-label="Tag">
      <button class="${o.date === t ? 'on' : ''}" data-act="odate" data-d="${t}">Heute</button>
      <button class="${o.date === m ? 'on' : ''}" data-act="odate" data-d="${m}">Morgen</button>
      <label class="${other ? 'on' : ''}">${icon('calendar')}<span>${other ? fmtDay(d) : 'Datum'}</span><input type="date" id="odate" value="${o.date}" aria-label="Datum wählen"></label>
    </div>
    <div class="chips scroll">${Object.entries(ANLAESSE).map(([k, v]) => `<button class="chip ${o.occasion === k ? 'on' : ''}" data-act="oocc" data-k="${k}">${v}</button>`).join('')}</div>`;
}

// ---------- Outfit bewerten: 👎 (mit Grund) / 👍 / ❤️ ----------
const DISLIKE_REASONS = { warm: '🥵 Zu warm', kalt: '🥶 Zu kalt', farben: '🎨 Farben passen nicht', stil: '👔 Stil passt nicht zum Anlass', teil: '👕 Ein bestimmtes Teil' };

function feedbackBlock(o) {
  const r = state.prefs.ratings[o.current.key] || 0;
  const items = SLOT_ORDER.filter((k) => o.current.slots[k]).map((k) => o.current.slots[k]);
  const d = o.dislike;
  return `<div class="feedback">
      <span class="muted small">Wie gefällt dir das Outfit?</span>
      <div class="rate3">
        <button class="${d ? 'on' : ''}" data-act="dislike" aria-label="Passt nicht">👎</button>
        <button class="${r === 1 ? 'on' : ''}" data-act="rate" data-r="1" aria-label="Gut">👍</button>
        <button class="${r === 2 ? 'on' : ''}" data-act="rate" data-r="2" aria-label="Lieblingsoutfit">❤️</button>
      </div>
    </div>
    ${d ? `<div class="note dislike"><b>Was passt nicht?</b> Mehrere Gründe möglich. Die App lernt daraus gezielt.
      <div class="chips">${Object.entries(DISLIKE_REASONS).map(([k, l]) => `<button class="chip ${d.reasons.has(k) ? 'on' : ''}" data-act="disReason" data-k="${k}">${l}</button>`).join('')}</div>
      ${d.reasons.has('teil') ? `<p class="small">Welche Teile passen nicht zum Rest?</p>
        <div class="chips">${items.map((i) => `<button class="chip ${d.items.has(i.id) ? 'on' : ''}" data-act="disToggle" data-id="${i.id}">${esc(i.bezeichnung)}</button>`).join('')}</div>` : ''}
      <div class="row"><button class="btn small primary" data-act="disApply">Merken & neuer Vorschlag</button><button class="btn ghost small" data-act="disCancel">Abbrechen</button></div></div>` : ''}`;
}

// Paare eines Outfits um d verändern (gemocht = +, abgelehnt = −)
function bumpPairs(items, d) {
  for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) bump(state.prefs.pairs, pairKey(items[a].id, items[b].id), d);
}

async function rateCurrent(level) {
  const o = state.outfit;
  const key = o.current.key;
  const items = Object.values(o.current.slots);
  const old = state.prefs.ratings[key] || 0;
  const next = old === level ? 0 : level; // erneutes Tippen nimmt die Bewertung zurück
  bumpPairs(items, next - old);           // 👍 = +1 je Paar, ❤️ = +2 je Paar
  if (next) state.prefs.ratings[key] = next; else delete state.prefs.ratings[key];
  state.prefs.favorites = state.prefs.favorites.filter((f) => f.key !== key);
  if (next === 2) state.prefs.favorites.push({ key, occasion: o.occasion, at: Date.now(), ids: Object.fromEntries(Object.entries(o.current.slots).map(([k, v]) => [k, v.id])) });
  await savePrefs();
  toast(next === 2 ? '❤️ Lieblingsoutfit – kommt öfter und steht unten in deinen Favoriten.' : next === 1 ? '👍 Gemerkt.' : 'Bewertung entfernt.');
  render();
}

async function applyDislike() {
  const o = state.outfit;
  const { reasons, items: badIds } = o.dislike;
  const items = Object.values(o.current.slots);
  const clothes = items.filter((i) => i.kategorie !== 'accessoire');
  const P = state.prefs;
  // Bisherige 👍/❤️ dieses Outfits zurücknehmen
  const old = P.ratings[o.current.key] || 0;
  if (old) { bumpPairs(items, -old); delete P.ratings[o.current.key]; }
  if (reasons.has('warm')) P.tempOffset = Math.min(4, (P.tempOffset || 0) + 1);  // rechnet künftig wärmer -> leichtere Kleidung
  if (reasons.has('kalt')) P.tempOffset = Math.max(-4, (P.tempOffset || 0) - 1);
  if (reasons.has('farben')) {
    const names = [...new Set(clothes.map((i) => ((i.farben || [])[0]?.name || '').toLowerCase()).filter(Boolean))];
    for (let a = 0; a < names.length; a++) for (let b = a + 1; b < names.length; b++) bump(P.colorPairs, pairKey(names[a], names[b]), -1);
  }
  if (reasons.has('stil')) clothes.forEach((i) => bump(P.occ, i.id + '|' + o.occasion, -1));
  if (reasons.has('teil')) {
    for (const x of items.filter((i) => badIds.has(i.id))) for (const y of items.filter((i) => !badIds.has(i.id))) bump(P.pairs, pairKey(x.id, y.id), -1);
  }
  P.blocked.push(o.current.key);
  if (P.blocked.length > 300) P.blocked.shift();
  P.favorites = P.favorites.filter((f) => f.key !== o.current.key);
  await savePrefs();
  o.dislike = null;
  const msg = [reasons.has('warm') && 'künftig etwas leichter', reasons.has('kalt') && 'künftig etwas wärmer', reasons.has('farben') && 'diese Farben seltener zusammen',
    reasons.has('stil') && `diese Teile seltener für „${ANLAESSE[o.occasion]}"`, reasons.has('teil') && badIds.size && 'diese Paarung seltener'].filter(Boolean);
  toast(msg.length ? 'Gemerkt: ' + msg.join(', ') + '.' : 'Diese Kombination kommt nicht wieder.');
  suggest();
}

// Stilles Signal: ein ausgetauschtes Teil passt offenbar nicht so gut (leichtes Minus, auch für die Paarung)
function noteSwap(slots, slot) {
  const out = slots[slot];
  if (!out) return;
  bump(state.prefs.swaps, out.id, 1);
  Object.values(slots).filter((i) => i !== out).forEach((i) => bump(state.prefs.pairs, pairKey(out.id, i.id), -0.25));
  savePrefs();
}

function favSlots(f) {
  const slots = {};
  for (const [k, id] of Object.entries(f.ids)) { const it = itemById(id); if (!it) return null; slots[k] = it; }
  return slots;
}

function favoritesBlock(o) {
  const favs = state.prefs.favorites.map((f) => ({ f, slots: favSlots(f) })).filter((x) => x.slots)
    .sort((a, b) => (b.f.occasion === o.occasion) - (a.f.occasion === o.occasion) || b.f.at - a.f.at);
  if (!favs.length) return '';
  return `<h2 class="sec">Deine Lieblingsoutfits</h2>
    <div class="carousel">${favs.slice(0, 10).map(({ f, slots }) => {
      const its = SLOT_ORDER.filter((k) => slots[k]).map((k) => slots[k]);
      return `<article class="favcard">
        <div class="flatlay n${Math.min(its.length, 6)}">${its.slice(0, 6).map((i) => `<img src="${imgUrl(i)}" alt="" title="${esc(i.bezeichnung)}" class="${laundryNow(i) ? 'dim' : ''}">`).join('')}</div>
        <div class="fc-foot"><span>${esc(ANLAESSE[f.occasion] || '')}</span>
          <button class="btn sm primary" data-act="favUse" data-k="${esc(f.key)}">Anziehen</button>
          <button class="iconbtn" data-act="favDel" data-k="${esc(f.key)}" aria-label="Lieblingsoutfit entfernen">${icon('x')}</button></div>
      </article>`;
    }).join('')}</div>`;
}

// ---------- Sport-Modus ----------
const addHours = (start, h) => { const [hh, mm] = start.split(':').map(Number); const t = hh * 60 + mm + Math.round(h * 60); return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

function sportConditions(dateStr, sport) {
  const c = activityConditions(weatherFor(dateStr), sport.start, sport.dauer);
  if (c) return c;
  const t = dayTemp(null, parseYmd(dateStr));
  return { tmin: t, tmax: t, wind: 10, rain: 0, estimated: true };
}

function sportKitFor(dateStr, sport, avoid) {
  const cond = sportConditions(dateStr, sport);
  return { cond, ...sportKit({ items: state.items, art: sport.art, cond, date: parseYmd(dateStr), laundryDays: state.settings.laundryDays, avoid }) };
}

function kitList(kit) {
  return `<ul class="kit">${kit.lines.map((l) => `<li>
      <small>${esc(l.label)}</small>
      <div class="kitrow">${l.items.map((i) => `<span class="kititem"><img src="${imgUrl(i)}" alt="">${esc(i.bezeichnung)}</span>`).join('')}
      ${l.dirty.length ? `<span class="missing">🧺 in der Wäsche: ${esc(l.dirty.map((i) => i.bezeichnung).join(', '))}</span>` : ''}
      ${l.missing.length ? `<span class="missing">fehlt im Schrank: ${esc(l.missing.join(', '))}</span>` : ''}</div>
    </li>`).join('')}</ul>`;
}

function condLine(kit, sport) {
  const c = kit.cond;
  return `${sport.start}–${addHours(sport.start, sport.dauer)} Uhr: <b>${Math.round(c.tmin)}${Math.round(c.tmax) !== Math.round(c.tmin) ? `–${Math.round(c.tmax)}` : ''} °C</b> · Wind bis ${Math.round(c.wind)} km/h · Regen ${Math.round(c.rain)} %
    <br><span class="muted">Gefühlt ${kit.E} °C${sport.art === 'laufen' ? '' : ' mit Fahrtwind'}${c.estimated ? ' · ohne Vorhersage geschätzt' : ''}</span>`;
}

function renderSportOutfit(o) {
  if (!o.sport) o.sport = { ...state.settings.sport };
  const sp = o.sport;
  const kit = sportKitFor(o.date, sp, new Set());
  const c = kit.cond;
  const DAUER = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6];
  return `
    <div class="seg">${Object.entries(SPORTARTEN).map(([k, v]) => `<button class="${sp.art === k ? 'on' : ''}" data-act="sart" data-k="${k}">${v}</button>`).join('')}</div>
    <div class="formrow">
      <label class="field">Start<input type="time" id="sstart" value="${sp.start}"></label>
      <label class="field">Dauer<select id="sdauer">${DAUER.map((d) => `<option value="${d}" ${d === +sp.dauer ? 'selected' : ''}>${String(d).replace('.', ',')} h</option>`).join('')}</select></label>
    </div>
    <div class="weather sportcond"><span class="wi">${sp.art === 'laufen' ? '🏃' : '🚴'}</span>
      <div><p class="feels">Gefühlt ${kit.E} °C</p>
      <p class="small">${sp.start}–${addHours(sp.start, sp.dauer)} Uhr · ${Math.round(c.tmin)}${Math.round(c.tmax) !== Math.round(c.tmin) ? `–${Math.round(c.tmax)}` : ''} °C · Wind bis ${Math.round(c.wind)} km/h · Regen ${Math.round(c.rain)} %</p>
      <p class="small muted">${sp.art === 'laufen' ? 'Beim Laufen zählt die gemessene Temperatur' : 'inklusive Fahrtwind'}${c.estimated ? ' · ohne Vorhersage geschätzt' : ''}</p></div></div>
    <h2 class="sec">Das ziehst du an</h2>
    ${kitList(kit)}
    ${kit.notes.length ? `<div class="tags">${kit.notes.map((n) => `<span class="tag">${esc(n)}</span>`).join('')}</div>` : ''}
    <div class="actionbar"><button class="btn primary" data-act="sportWear" ${kit.items.length ? '' : 'disabled'}>${icon('check')} Anziehen</button></div>
    <p class="fine">Sportteile brauchen im Schrank unter „Sportbekleidung" ihre Funktion (z. B. Armlinge, Weste) – nur so findet der Sport-Modus sie.</p>`;
}

function suggest() {
  const o = state.outfit;
  const d = parseYmd(o.date);
  o.ctx = makeContext({ ...extras(), items: state.items, date: d, weather: weatherFor(o.date), occasion: o.occasion });
  o.dislike = null;
  if (o.current) o.seen.add(o.current.key);
  let next = suggestOutfit(o.ctx, o.seen);
  if (!next && o.seen.size) { o.seen.clear(); next = suggestOutfit(o.ctx, o.seen); toast('Alle Kombinationen gezeigt – es geht von vorne los.'); }
  o.current = next;
  o.hints = next ? null : missingHints(o.ctx);
  // Stilles Signal: wie oft ein Teil gezeigt wurde (oft gezeigt, nie getragen = wird seltener)
  if (next) { Object.values(next.slots).forEach((i) => bump(state.prefs.shown, i.id, 1)); savePrefs(); }
  render();
}

async function markWorn(slots, dateStr, occasion) {
  let washed = 0;
  // Stilles Signal: Getragenes zählt als Zustimmung (+0,5 je Paar), Austausch-Zähler sinkt
  const worn = Object.values(slots);
  if (occasion !== 'sport') bumpPairs(worn, 0.5);
  worn.forEach((i) => bump(state.prefs.swaps, i.id, -Math.min(2, state.prefs.swaps[i.id] || 0)));
  await savePrefs();
  for (const it of Object.values(slots)) {
    if (!it.lastWorn || it.lastWorn < dateStr) it.lastWorn = dateStr;
    it.wornCount = (it.wornCount || 0) + 1;
    // Sportsachen und die eingestellten Kategorien wandern nach dem Tragen in den Wäschekorb
    const wash = sportOnly(it) ? SPORT_WASH.includes(it.sportteil) : state.settings.autoLaundryCats.includes(it.kategorie);
    if (wash) { it.laundrySince = dateStr; washed++; }
    await db.putItem(it);
  }
  await db.putHistory({ id: uid(), date: dateStr, occasion, itemIds: Object.values(slots).map((i) => i.id) });
  return washed;
}

// ---------- Ansicht: Wochenplan ----------
async function loadWeek() {
  const saved = await db.get('week');
  if (!saved) return null;
  return {
    start: saved.start,
    days: saved.days.map((d) => {
      if (d.occasion === 'sport') return { ...d, dateObj: parseYmd(d.date), outfit: null };
      const slots = {};
      for (const [k, id] of Object.entries(d.ids || {})) { const it = itemById(id); if (it) slots[k] = it; }
      return { ...d, dateObj: parseYmd(d.date), outfit: Object.keys(slots).length ? { slots, reasons: d.reasons || [], key: '' } : null };
    }),
  };
}

async function saveWeek() {
  const w = state.week;
  await db.set('week', {
    start: w.start,
    days: w.days.map((d) => ({
      date: d.date, occasion: d.occasion, locked: !!d.locked, worn: !!d.worn, reasons: d.outfit?.reasons || [], hints: d.hints || [], sport: d.sport || null,
      ids: d.outfit ? Object.fromEntries(Object.entries(d.outfit.slots).map(([k, v]) => [k, v.id])) : {},
    })),
  });
}

function emptyWeek(startStr) {
  const s = parseYmd(startStr);
  return {
    start: startStr,
    days: Array.from({ length: 7 }, (_, n) => {
      const d = addDays(s, n);
      return { date: ymd(d), dateObj: d, occasion: defaultOccasion(d), locked: false, outfit: null };
    }),
  };
}

function nextMonday() {
  const d = today();
  const diff = (8 - d.getDay()) % 7 || 7;
  return ymd(addDays(d, diff));
}

function renderWoche() {
  const w = state.week;
  const t = ymd(today()), mo = nextMonday();
  const range = w ? `${fmtDay(w.days[0].dateObj)} – ${fmtDay(w.days[6].dateObj)}` : 'Sieben Tage im Voraus';
  const head = pageHead(range, 'Deine Woche') + `
    <div class="seg">
      <button class="${w?.start === t ? 'on' : ''}" data-act="wstart" data-d="${t}">Ab heute</button>
      <button class="${w?.start === mo ? 'on' : ''}" data-act="wstart" data-d="${mo}">Ab Montag ${fmtDay(parseYmd(mo)).slice(3)}</button>
    </div>`;
  if (!state.items.length) return head + emptyCard('hanger', 'Noch keine Kleidung', 'Lege zuerst ein paar Teile in den Schrank.', `<button class="btn primary" data-act="go" data-view="schrank">Zum Schrank</button>`);
  if (!w) return head + emptyCard('calendar', 'Plane deine Woche', 'Wähle oben den Starttag. Du bekommst für sieben Tage je ein Outfit – passend zu Wetter und Anlass, ohne doppelte Teile.');
  const kits = weekSportKits();
  const strip = `<div class="daystrip">${w.days.map((d, n) => {
    const wx = weatherFor(d.date);
    const has = d.outfit || kits[n]?.items.length;
    return `<button class="${has ? 'has' : ''} ${d.worn ? 'worn' : ''}" data-act="wjump" data-n="${n}" aria-label="${longDate(d.dateObj)}">
      <span>${WT[d.dateObj.getDay()]}</span><b>${d.dateObj.getDate()}</b><i>${wx ? weatherIcon(wx.code) : '·'}</i><small>${wx ? `${Math.round(wx.tmax)}°` : ''}</small></button>`;
  }).join('')}</div>`;
  const days = w.days.map((d, n) => {
    const wx = weatherFor(d.date);
    if (kits[n]) return sportDayCard(d, n, kits[n], wx);
    const open = state.openDay === n;
    return `<section class="day ${d.locked ? 'locked' : ''} ${d.worn ? 'worn' : ''}" id="day-${n}">
      <div class="dayhead">
        <div class="dh-date"><b>${fmtDay(d.dateObj)}</b><span>${wx ? `${weatherIcon(wx.code)} ${Math.round(wx.tmin)}° bis ${Math.round(wx.tmax)}°${wx.rain >= 50 ? ` · ☂ ${wx.rain} %` : ''}` : `≈ ${dayTemp(null, d.dateObj)} °C`}</span></div>
        <select class="pillselect" data-act="wocc" data-n="${n}" aria-label="Anlass">${Object.entries(ANLAESSE).map(([k, v]) => `<option value="${k}" ${k === d.occasion ? 'selected' : ''}>${v}</option>`).join('')}</select>
      </div>
      ${d.locked || d.worn ? `<div class="flags">${d.locked && !d.worn ? `<span class="flag">${icon('lock')} Fixiert</span>` : ''}${d.worn ? `<span class="flag ok">${icon('check')} Getragen</span>` : ''}</div>` : ''}
      ${d.outfit ? (open ? tryOnBlock(d.outfit.slots, `data-src="week" data-n="${n}"`) + itemList(d.outfit.slots, 'wswap', `data-n="${n}"`)
          : `<div class="mini">${SLOT_ORDER.filter((k) => d.outfit.slots[k]).map((k) => `<button class="mp" data-act="wswap" data-n="${n}" data-slot="${k}" title="${esc(d.outfit.slots[k].bezeichnung)} austauschen"><img src="${imgUrl(d.outfit.slots[k])}" alt=""></button>`).join('')}</div>
            <p class="names">${SLOT_ORDER.filter((k) => d.outfit.slots[k]).map((k) => esc(d.outfit.slots[k].bezeichnung)).join(' · ')}</p>`)
        : `<p class="fine">${d.hints?.length ? 'Fehlt: ' + esc(d.hints.join(', ')) : 'Noch kein Outfit – tippe auf „Woche planen".'}</p>`}
      <div class="dayact">
        ${d.outfit ? `<button class="pillbtn ${open ? 'on' : ''}" data-act="wopen" data-n="${n}">${icon(open ? 'chevron-up' : 'person')} ${open ? 'Zuklappen' : 'Anprobe & Details'}</button>` : ''}
        <span class="spacer"></span>
        <button class="iconbtn ${d.locked ? 'on' : ''}" data-act="wlock" data-n="${n}" aria-label="${d.locked ? 'Fixierung lösen' : 'Tag fixieren'}" title="${d.locked ? 'Fixierung lösen' : 'Fixieren'}">${icon(d.locked ? 'lock' : 'unlock')}</button>
        <button class="iconbtn" data-act="wredo" data-n="${n}" ${d.locked ? 'disabled' : ''} aria-label="Neues Outfit für diesen Tag" title="Neu planen">${icon('refresh')}</button>
        <button class="iconbtn ok ${d.worn ? 'on' : ''}" data-act="wworn" data-n="${n}" ${!d.outfit || d.worn ? 'disabled' : ''} aria-label="Als getragen markieren" title="Angezogen">${icon('check')}</button>
      </div>
    </section>`;
  }).join('');
  return head + strip + `
    <button class="btn primary block" data-act="wplan">${icon('sparkle')} ${w.days.some((d) => d.outfit) ? 'Offene Tage neu planen' : 'Woche planen'}</button>
    <p class="fine">Tippe auf ein Teil, um es zu tauschen. Fixierte Tage <span style="white-space:nowrap">(${icon('lock', 'inline')})</span> bleiben beim Neuplanen erhalten.</p>
    ${days}`;
}

// Sporttage der Woche: Kleidung je Einheit, möglichst nicht dieselben Teile an mehreren Tagen
function weekSportKits() {
  const avoid = new Set();
  return state.week.days.map((d) => {
    if (d.occasion !== 'sport') return null;
    if (!d.sport) d.sport = { ...state.settings.sport };
    const kit = sportKitFor(d.date, d.sport, avoid);
    kit.items.forEach((i) => avoid.add(i.id));
    return kit;
  });
}

function sportDayCard(d, n, kit, wx) {
  const open = state.openDay === n;
  return `<section class="day sportday ${d.worn ? 'worn' : ''}" id="day-${n}">
      <div class="dayhead">
        <div class="dh-date"><b>${fmtDay(d.dateObj)}</b><span>${wx ? `${weatherIcon(wx.code)} ${Math.round(wx.tmin)}° bis ${Math.round(wx.tmax)}°` : ''}</span></div>
        <select class="pillselect" data-act="wocc" data-n="${n}" aria-label="Anlass">${Object.entries(ANLAESSE).map(([k, v]) => `<option value="${k}" ${k === d.occasion ? 'selected' : ''}>${v}</option>`).join('')}</select>
      </div>
      <div class="sportform">
        <select data-act="wsart" data-n="${n}" aria-label="Sportart">${Object.entries(SPORTARTEN).map(([k, v]) => `<option value="${k}" ${k === d.sport.art ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <input type="time" data-act="wsstart" data-n="${n}" value="${d.sport.start}" aria-label="Startzeit">
        <select data-act="wsdauer" data-n="${n}" aria-label="Dauer">${[0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6].map((x) => `<option value="${x}" ${x === +d.sport.dauer ? 'selected' : ''}>${String(x).replace('.', ',')} h</option>`).join('')}</select>
      </div>
      <p class="small">${condLine(kit, d.sport)}</p>
      ${open ? kitList(kit) : `<div class="mini">${kit.items.map((i) => `<img class="mpimg" src="${imgUrl(i)}" alt="" title="${esc(i.bezeichnung)}">`).join('')}</div>
        <p class="names">${kit.lines.map((l) => (l.items.length ? l.items.map((i) => esc(i.bezeichnung)).join(' + ') : `<span class="missing">${esc(l.label)} ${l.dirty.length ? 'in der Wäsche' : 'fehlt'}</span>`)).join(' · ')}</p>`}
      <div class="dayact">
        <button class="pillbtn ${open ? 'on' : ''}" data-act="wopen" data-n="${n}">${icon(open ? 'chevron-up' : 'bike')} ${open ? 'Zuklappen' : 'Details'}</button>
        <span class="spacer"></span>
        <button class="iconbtn ok ${d.worn ? 'on' : ''}" data-act="wworn" data-n="${n}" ${!kit.items.length || d.worn ? 'disabled' : ''} aria-label="Als getragen markieren" title="Angezogen">${icon('check')}</button>
      </div>
    </section>`;
}

async function planDays(onlyIndex = null) {
  const w = state.week;
  let days = w.days.map((d) => ({ ...d, weather: weatherFor(d.date) }));
  if (onlyIndex !== null) {
    // Nur einen Tag neu: alle anderen gelten vorübergehend als fixiert
    days = days.map((d, n) => (n === onlyIndex ? { ...d, locked: false, outfit: null } : { ...d, locked: true }));
  }
  const planned = planWeek(state.items, days, state.settings.repeatCats, extras());
  w.days = planned.map((d, n) => (onlyIndex !== null && n !== onlyIndex ? { ...w.days[n] } : d));
  await saveWeek();
  render();
}

// ---------- Ansicht: Einstellungen ----------
function sRow(id, ic, title, value, content) {
  return `<details class="srow" data-sid="${id}" ${state.openSettings.has(id) ? 'open' : ''}>
    <summary><span class="sri">${icon(ic)}</span><span class="srt">${title}</span><span class="srv">${value}</span>${icon('chevron-right', 'chev')}</summary>
    <div class="src">${content}</div></details>`;
}

function renderSettings() {
  const s = state.settings;
  const WD = [1, 2, 3, 4, 5, 6, 0];
  if (!s.location) state.openSettings.add('ort');
  const occCount = {};
  s.weekdayOccasions.forEach((o) => { occCount[o] = (occCount[o] || 0) + 1; });
  const occSummary = Object.entries(occCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}× ${ANLAESSE[k]}`).join(', ');
  const nDemo = state.items.filter((i) => i.demo).length;
  const tryStatus = state.body && s.googleKey ? 'bereit' : state.body ? 'Schlüssel fehlt' : s.googleKey ? 'Foto fehlt' : 'aus';
  const P = state.prefs;
  return pageHead('Kleiderschrank', 'Einstellungen') + `
    <h3 class="glabel">Planung</h3>
    <div class="sgroup">
      ${sRow('ort', 'pin', 'Ort fürs Wetter', s.location ? esc(s.location.name.split(',')[0]) : 'nicht festgelegt', `
        <p>${s.location ? `📍 ${esc(s.location.name)}` : '<span class="muted">Noch kein Ort – Outfits richten sich dann nur nach der Jahreszeit.</span>'}</p>
        <div class="row"><input id="placeQ" placeholder="Stadt suchen, z. B. Bielefeld" enterkeyhint="search"><button class="btn sm" data-act="searchPlace">Suchen</button></div>
        ${state.placeResults.map((p, n) => `<button class="list-item" data-act="pickPlace" data-n="${n}">${esc(p.name)}</button>`).join('')}
        <button class="btn ghost small" data-act="gps">${icon('pin')} Aktuellen Standort verwenden</button>`)}
      ${sRow('anlaesse', 'calendar', 'Anlass je Wochentag', occSummary, WD.map((d) => `<label class="row between">${WTL[d]}
        <select data-act="wdOcc" data-d="${d}">${Object.entries(ANLAESSE).map(([k, v]) => `<option value="${k}" ${s.weekdayOccasions[d] === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`).join(''))}
      ${sRow('woche', 'repeat', 'Mehrfach pro Woche', `${s.repeatCats.length} Kategorien`, `
        <p class="muted">Diese Kategorien dürfen im Wochenplan mehrmals vorkommen. Lieblingsteile dürfen immer bis zu ${MAX_FAV_PER_WEEK}×.</p>
        <div class="chips">${Object.entries(KATEGORIEN).map(([k, v]) => `<label class="chip check"><input type="checkbox" data-act="repeatCat" value="${k}" ${s.repeatCats.includes(k) ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div>`)}
      ${sRow('waesche', 'basket', 'Wäsche', `${s.laundryDays} ${s.laundryDays === 1 ? 'Tag' : 'Tage'}`, `
        <label class="row between">Wieder verfügbar nach<select data-act="laundryDays">${[1, 2, 3, 4, 5, 7].map((x) => `<option value="${x}" ${x === s.laundryDays ? 'selected' : ''}>${x} ${x === 1 ? 'Tag' : 'Tagen'}</option>`).join('')}</select></label>
        <p class="muted">Nach „Anziehen" automatisch in den Wäschekorb. Sport: Trikots, Hosen, Unterhemden, Linge, Buff und Mütze immer – Schuhe, Jacken und Handschuhe nicht.</p>
        <div class="chips">${Object.entries(KATEGORIEN).map(([k, v]) => `<label class="chip check"><input type="checkbox" data-act="autoLaundry" value="${k}" ${s.autoLaundryCats.includes(k) ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div>`)}
      ${sRow('sport', 'bike', 'Sport-Modus', `${SPORTARTEN[s.sport.art]} · ${s.sport.start}`, `
        <p class="muted">Voreinstellung für Sporttage. Auf dem Rad kühlt der Fahrtwind: Rennrad zählt 3 °C, Gravel 2 °C kälter, starker Wind (ab 25 km/h) weitere 2 °C.</p>
        <label class="row between">Sportart<select data-act="setSport" data-f="art">${Object.entries(SPORTARTEN).map(([k, v]) => `<option value="${k}" ${s.sport.art === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="row between">Startzeit<input type="time" data-act="setSport" data-f="start" value="${s.sport.start}"></label>
        <label class="row between">Dauer<select data-act="setSport" data-f="dauer">${[0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6].map((x) => `<option value="${x}" ${x === +s.sport.dauer ? 'selected' : ''}>${String(x).replace('.', ',')} h</option>`).join('')}</select></label>`)}
    </div>

    <h3 class="glabel">KI & Anprobe</h3>
    <div class="sgroup">
      ${sRow('ki', 'wand', 'Automatische Erkennung', s.apiKey ? 'aktiv' : 'aus', `
        <p class="muted">Claude erkennt Art, Farbe, Stil und Anlass aus dem Foto. Der Schlüssel bleibt auf diesem Gerät und geht direkt an Anthropic (console.anthropic.com). Ca. 1–2 Cent pro Foto.</p>
        <input type="password" id="apiKey" value="${esc(s.apiKey)}" placeholder="sk-ant-…" autocomplete="off">
        <button class="btn sm" data-act="saveKey">Speichern</button>`)}
      ${sRow('anprobe', 'person', 'Virtuelle Anprobe', tryStatus, `
        <p class="muted">Mit einem Ganzkörperfoto zeigt die App, wie die Outfits an dir aussehen. Tipps: gerade stehen, Kopf bis Fuß, eher eng anliegende Kleidung, ruhiger Hintergrund, gutes Licht.</p>
        ${state.body ? `<img class="bodythumb" src="${bodyUrl()}" alt="Ganzkörperfoto" data-act="zoom">` : ''}
        <div class="row">
          <label class="btn sm">${icon('camera')} ${state.body ? 'Foto ändern' : 'Ganzkörperfoto wählen'}<input type="file" id="bodyInput" accept="image/*" hidden></label>
          ${state.body ? '<button class="btn danger sm" data-act="deleteBody">Löschen</button>' : ''}
        </div>
        <label class="field">Google-API-Schlüssel (aistudio.google.com)<input type="password" id="googleKey" value="${esc(s.googleKey)}" placeholder="AIza…" autocomplete="off"></label>
        <label class="field">Bildmodell<input id="imageModel" value="${esc(s.imageModel)}" placeholder="${DEFAULT_IMAGE_MODEL}" autocomplete="off" autocapitalize="off"></label>
        <button class="btn sm" data-act="saveGoogle">Speichern</button>
        <p class="fine">Datenschutz: Für jede Anprobe gehen dein Foto und die Kleidungsbilder an Google. Im kostenlosen Kontingent darf Google die Daten zur Verbesserung nutzen, mit Bezahlkonto nicht. Fertige Bilder bleiben auf dem iPhone (max. 40).</p>
        <button class="btn ghost small" data-act="clearTryOns">Gespeicherte Anprobe-Bilder löschen</button>`)}
    </div>

    <h3 class="glabel">Daten</h3>
    <div class="sgroup">
      ${sRow('vorlieben', 'heart', 'Gelernte Vorlieben', `${state.items.filter((i) => i.bewertung === 'liebling').length} Lieblinge`, `
        <div class="stat"><div><b>${state.items.filter((i) => i.bewertung === 'liebling').length}</b><span>Lieblingsteile</span></div>
          <div><b>${P.favorites.length}</b><span>Lieblingsoutfits</span></div>
          <div><b>${state.items.filter((i) => i.bewertung === 'ungern').length}</b><span>ungern getragen</span></div></div>
        <p class="muted">${Object.values(P.ratings).filter((v) => v === 1).length} gute Outfits · ${P.blocked.length} ausgeschlossene Kombinationen · ${Object.values(P.pairs).filter((v) => v <= -1).length} unpassende Paarungen · ${Object.keys(P.colorPairs).length} unpassende Farbkombinationen</p>
        <p>Wärmeempfinden: ${P.tempOffset ? `${P.tempOffset > 0 ? 'dir ist schnell warm' : 'du frierst eher'} (${P.tempOffset > 0 ? '+' : ''}${P.tempOffset} °C) <button class="btn ghost small" data-act="resetTemp">zurücksetzen</button>` : 'neutral'}</p>
        <button class="btn danger sm" data-act="resetPrefs">Gelerntes zurücksetzen</button>`)}
      ${sRow('demo', 'sparkle', 'Beispiel-Schrank', nDemo ? `${nDemo} Teile` : 'nicht geladen', `
        <p class="muted">Gezeichnete Beispielteile (Alltag, Büro, Festlich, Laufen, Rad) zum Ausprobieren.</p>
        <div class="row"><button class="btn sm" data-act="loadDemo">${nDemo ? 'Aktualisieren' : 'Laden'}</button>
        <button class="btn danger sm" data-act="removeDemo" ${nDemo ? '' : 'disabled'}>Entfernen</button></div>`)}
      ${sRow('backup', 'download', 'Sicherung', '', `
        <p class="muted">Alle Daten liegen nur auf diesem iPhone. Exportiere regelmäßig eine Sicherung, z. B. in iCloud Drive.</p>
        <div class="row"><button class="btn sm" data-act="export">Exportieren</button>
        <label class="btn sm">Importieren<input type="file" id="importInput" accept="application/json,.json" hidden></label></div>
        <button class="btn danger sm" data-act="wipe">Alle Daten löschen</button>`)}
    </div>
    <p class="fine center">Kleiderschrank · Version 2.0</p>`;
}

async function exportBackup() {
  const toDataUrl = (blob) => new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });
  const items = [];
  for (const it of state.items) items.push({ ...it, image: it.image ? await toDataUrl(it.image) : null });
  const { apiKey, googleKey, ...settings } = state.settings; // Schlüssel nicht mit exportieren
  const data = { app: 'kleiderschrank', version: 1, exportedAt: new Date().toISOString(), settings, items, history: await db.allHistory(), prefs: state.prefs };
  const file = new File([JSON.stringify(data)], `kleiderschrank-${ymd(new Date())}.json`, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Kleiderschrank-Sicherung' }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function importBackup(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'kleiderschrank') throw new Error('Keine Kleiderschrank-Sicherung.');
  let n = 0;
  for (const it of data.items || []) {
    if (it.image) it.image = await (await fetch(it.image)).blob();
    await db.putItem(it);
    n++;
  }
  for (const h of data.history || []) await db.putHistory(h);
  if (data.prefs) { state.prefs = { ...emptyPrefs(), ...data.prefs }; await savePrefs(); }
  if (data.settings) { state.settings = { ...state.settings, ...data.settings, apiKey: state.settings.apiKey, googleKey: state.settings.googleKey }; await saveSettings(); }
  state.items = await db.allItems();
  toast(`${n} Teile importiert.`);
}

// ---------- Beispiel-Schrank ----------
async function loadDemo() {
  const list = await (await fetch('demo/demo.json')).json();
  const have = new Map(state.items.filter((i) => i.demo).map((i) => [i.demoId, i]));
  let n = 0, updated = 0;
  for (const d of list) {
    const old = have.get(d.demoId);
    if (old) { // schon da: nur Beschreibung aktualisieren (Bild, Tragehistorie, Wäsche bleiben)
      const { datei, ...meta } = d;
      Object.assign(old, meta);
      await db.putItem(old);
      updated++;
      continue;
    }
    const image = await (await fetch('demo/' + d.datei)).blob();
    const { datei, ...meta } = d;
    const item = { ...newItem(image), ...meta, demo: true };
    await db.putItem(item);
    state.items.push(item);
    n++;
  }
  toast(n ? `${n} Beispielteile geladen${updated ? `, ${updated} aktualisiert` : ''}.` : `Beispiel-Schrank ist aktuell (${updated} Teile).`);
  render();
}

async function removeDemo() {
  const demo = state.items.filter((i) => i.demo);
  for (const i of demo) await db.deleteItem(i.id);
  state.items = state.items.filter((i) => !i.demo);
  // Wochenplan/Outfit verweisen evtl. auf gelöschte Teile -> neu laden
  state.week = await loadWeek();
  state.outfit.current = null;
  toast(`${demo.length} Beispielteile entfernt.`);
  render();
}

// ---------- Ereignisse ----------
document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act], .tabbar button');
  if (!el) return;
  if (el.matches('.tabbar button')) { state.editing = null; go(el.dataset.view); return; }
  const act = el.dataset.act;
  if (['INPUT', 'SELECT'].includes(el.tagName)) return; // werden über "change" behandelt
  ev.preventDefault();
  const n = el.dataset.n !== undefined ? +el.dataset.n : null;
  try {
    switch (act) {
      case 'go': state.editing = null; if (el.dataset.open) state.openSettings.add(el.dataset.open); go(el.dataset.view); break;
      case 'obHide': state.settings.onboardingDone = true; await saveSettings(); toast('Ausgeblendet – alles findest du in den Einstellungen.'); render(); break;
      case 'lookFlat': state.showFlat = !state.showFlat; render(); break;
      case 'wjump': document.getElementById('day-' + n)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
      case 'filter': state.filter = el.dataset.k; render(); break;
      case 'edit': state.editing = { ...itemById(el.dataset.id) }; render(); break;
      case 'cancelEdit': state.editing = null; render(); break;
      case 'analyze': readForm(); runAnalysis(); break;
      case 'addColor': readForm(); state.editing.farben.push({ name: '', hex: '#888888', neutral: false }); render(); break;
      case 'removeColor': readForm(); state.editing.farben.splice(n, 1); render(); break;
      case 'deleteItem':
        if (!confirm('Dieses Teil wirklich löschen?')) break;
        await db.deleteItem(state.editing.id);
        state.items = state.items.filter((i) => i.id !== state.editing.id);
        state.editing = null; toast('Gelöscht.'); render(); break;

      case 'odate': state.outfit.date = el.dataset.d; state.outfit.occasion = null; state.outfit.current = null; state.outfit.seen.clear(); render(); break;
      case 'oocc': state.outfit.occasion = el.dataset.k; state.outfit.current = null; state.outfit.seen.clear(); render(); break;
      case 'suggest': suggest(); break;
      case 'swap': {
        const o = state.outfit;
        noteSwap(o.current.slots, el.dataset.slot);
        const next = swapSlot(o.current, el.dataset.slot, o.ctx);
        if (next) { o.current = next; render(); } else toast('Keine Alternative in dieser Kategorie.');
        break;
      }
      case 'wearToday': {
        const washed = await markWorn(state.outfit.current.slots, state.outfit.date, state.outfit.occasion);
        toast(`Viel Spaß! Eingetragen als getragen${washed ? ` · ${washed} Teil(e) danach im Wäschekorb` : ''}.`); break;
      }
      case 'sportWear': {
        const o = state.outfit;
        const washed = await markWorn({ ...sportKitFor(o.date, o.sport, new Set()).items }, o.date, 'sport');
        toast(`Gute Einheit! ${washed} Teil(e) danach im Wäschekorb.`); render(); break;
      }
      case 'sart': state.outfit.sport.art = el.dataset.k; render(); break;
      case 'rate': await rateCurrent(+el.dataset.r); break;
      case 'dislike': state.outfit.dislike = state.outfit.dislike ? null : { reasons: new Set(), items: new Set() }; render(); break;
      case 'disReason': { const r = state.outfit.dislike.reasons; if (r.has(el.dataset.k)) r.delete(el.dataset.k); else r.add(el.dataset.k); render(); break; }
      case 'disToggle': { const s = state.outfit.dislike.items; if (s.has(el.dataset.id)) s.delete(el.dataset.id); else s.add(el.dataset.id); render(); break; }
      case 'favItem': {
        const it = itemById(el.dataset.id);
        it.bewertung = it.bewertung === 'liebling' ? null : 'liebling';
        await db.putItem(it);
        toast(it.bewertung ? `❤️ ${it.bezeichnung} ist jetzt ein Lieblingsteil.` : 'Kein Lieblingsteil mehr.');
        render(); break;
      }
      case 'disCancel': state.outfit.dislike = null; render(); break;
      case 'disApply': await applyDislike(); break;
      case 'favUse': {
        const o = state.outfit;
        const f = state.prefs.favorites.find((x) => x.key === el.dataset.k);
        const slots = f && favSlots(f);
        if (!slots) break;
        o.ctx = makeContext({ ...extras(), items: state.items, date: parseYmd(o.date), weather: weatherFor(o.date), occasion: o.occasion });
        o.current = { slots, key: outfitKey(slots), reasons: ['❤️ Eines deiner Lieblingsoutfits'], score: 0 };
        const dirty = Object.values(slots).filter(laundryNow);
        if (dirty.length) toast(`Achtung: ${dirty.map((i) => i.bezeichnung).join(', ')} liegt in der Wäsche.`);
        render(); window.scrollTo(0, 0); break;
      }
      case 'favDel':
        state.prefs.favorites = state.prefs.favorites.filter((x) => x.key !== el.dataset.k);
        await savePrefs(); render(); break;
      case 'resetPrefs':
        if (!confirm('Alle Lieblingsoutfits und gelernten Vorlieben löschen? (Lieblingsteile bleiben markiert.)')) break;
        state.prefs = emptyPrefs(); await savePrefs(); toast('Gelernte Vorlieben zurückgesetzt.'); render(); break;
      case 'resetTemp': state.prefs.tempOffset = 0; await savePrefs(); toast('Wärmeempfinden zurückgesetzt.'); render(); break;
      case 'toggleLaundry': {
        readForm();
        const i = state.editing;
        i.laundrySince = laundryNow(i) ? null : ymd(today());
        await db.putItem(i);
        const idx = state.items.findIndex((x) => x.id === i.id);
        if (idx >= 0) state.items[idx] = i;
        toast(i.laundrySince ? '🧺 Im Wäschekorb.' : '✓ Wieder im Schrank.'); render(); break;
      }
      case 'allClean':
        for (const i of state.items.filter(laundryNow)) { i.laundrySince = null; await db.putItem(i); }
        toast('Alles wieder sauber.'); render(); break;

      case 'wstart': state.week = emptyWeek(el.dataset.d); await planDays(); break;
      case 'wplan': await planDays(); break;
      case 'wredo': await planDays(n); break;
      case 'wlock': state.week.days[n].locked = !state.week.days[n].locked; await saveWeek(); render(); break;
      case 'wworn': {
        const d = state.week.days[n];
        const slots = d.occasion === 'sport' ? { ...weekSportKits()[n].items } : d.outfit.slots;
        const washed = await markWorn(slots, d.date, d.occasion);
        d.worn = true; d.locked = true; await saveWeek(); render();
        toast(`Als getragen eingetragen${washed ? ` · ${washed} Teil(e) im Wäschekorb` : ''}.`);
        break;
      }
      case 'wswap': {
        const d = state.week.days[n];
        noteSwap(d.outfit.slots, el.dataset.slot);
        const others = new Set();
        state.week.days.forEach((x, k) => { if (k !== n && x.outfit) Object.values(x.outfit.slots).forEach((i) => others.add(i.id)); });
        const repeat = new Set(state.items.filter((i) => state.settings.repeatCats.includes(i.kategorie)).map((i) => i.id));
        const ctx = makeContext({
          ...extras(), items: state.items, date: d.dateObj, weather: weatherFor(d.date), occasion: d.occasion,
          exclude: new Set([...others].filter((id) => !repeat.has(id))), softExclude: new Set([...others].filter((id) => repeat.has(id))),
        });
        const next = swapSlot(d.outfit, el.dataset.slot, ctx);
        if (next) { d.outfit = next; d.locked = true; await saveWeek(); render(); } else toast('Keine Alternative frei.');
        break;
      }

      case 'saveKey':
        state.settings.apiKey = document.getElementById('apiKey').value.trim();
        await saveSettings(); toast('Schlüssel gespeichert.'); break;
      case 'searchPlace': {
        const q = document.getElementById('placeQ').value.trim();
        if (!q) break;
        state.placeResults = await searchPlace(q);
        if (!state.placeResults.length) toast('Nichts gefunden.');
        render(); break;
      }
      case 'pickPlace':
        state.settings.location = state.placeResults[n];
        state.placeResults = [];
        await saveSettings(); await loadForecast(); toast('Ort gespeichert.'); render(); break;
      case 'gps':
        navigator.geolocation.getCurrentPosition(async (p) => {
          state.settings.location = { name: 'Aktueller Standort', lat: p.coords.latitude, lon: p.coords.longitude };
          await saveSettings(); await loadForecast(); toast('Standort gespeichert.'); render();
        }, () => toast('Standort nicht verfügbar.'));
        break;
      case 'export': await exportBackup(); break;
      case 'zoom': zoom(el.src); break;
      case 'tryon': {
        const slots = el.dataset.src === 'week' ? state.week.days[n].outfit.slots : state.outfit.current.slots;
        if (!state.settings.googleKey) { toast('Bitte zuerst den Google-API-Schlüssel eintragen.'); state.openSettings.add('anprobe'); go('einstellungen'); break; }
        state.showFlat = false;
        await runTryOn(slots);
        break;
      }
      case 'wopen': state.openDay = state.openDay === n ? null : n; render(); break;
      case 'saveGoogle':
        state.settings.googleKey = document.getElementById('googleKey').value.trim();
        state.settings.imageModel = document.getElementById('imageModel').value.trim() || DEFAULT_IMAGE_MODEL;
        await saveSettings(); toast('Gespeichert.'); render(); break;
      case 'deleteBody':
        if (!confirm('Ganzkörperfoto löschen? Gespeicherte Anprobe-Bilder werden ebenfalls gelöscht.')) break;
        await db.del('bodyPhoto'); await clearTryOnCache();
        state.body = null; tryState.clear(); tryChecked.clear(); toast('Foto gelöscht.'); render(); break;
      case 'clearTryOns':
        await clearTryOnCache(); tryState.clear(); tryChecked.clear(); toast('Anprobe-Bilder gelöscht.'); break;
      case 'loadDemo': el.disabled = true; toast('Beispiel-Schrank wird geladen …'); await loadDemo(); break;
      case 'removeDemo':
        if (!confirm('Alle Beispielteile aus dem Schrank entfernen? Deine eigenen Teile bleiben erhalten.')) break;
        await removeDemo(); break;
      case 'wipe':
        if (!confirm('Wirklich ALLE Kleidungsstücke, Pläne und Einstellungen löschen?')) break;
        await db.clearAll();
        state.items = []; state.week = null; state.settings = { ...DEFAULT_SETTINGS }; state.forecast = null;
        state.body = null; tryState.clear(); tryChecked.clear();
        toast('Alles gelöscht.'); render(); break;
      default: break;
    }
  } catch (e) {
    console.error(e);
    toast(e.message || 'Fehler');
  }
});

document.addEventListener('change', async (ev) => {
  const el = ev.target;
  try {
    if (el.id === 'photoInput') { await handlePhotos(el.files); el.value = ''; return; }
    if (el.id === 'bodyInput' && el.files[0]) {
      const blob = await resizeImage(el.files[0], 1536);
      state.body = { blob, version: Date.now() };
      await db.set('bodyPhoto', state.body);
      tryState.clear(); tryChecked.clear();
      el.value = ''; toast('Ganzkörperfoto gespeichert.'); render(); return;
    }
    if (el.id === 'importInput') { await importBackup(el.files[0]); el.value = ''; render(); return; }
    if (el.id === 'odate' && el.value) { state.outfit.date = el.value; state.outfit.occasion = null; state.outfit.current = null; state.outfit.seen.clear(); render(); return; }
    const act = el.dataset.act;
    if (el.id === 'sstart' && el.value) { state.outfit.sport.start = el.value; render(); return; }
    if (el.id === 'sdauer') { state.outfit.sport.dauer = +el.value; render(); return; }
    if (['wsart', 'wsstart', 'wsdauer'].includes(act)) {
      const d = state.week.days[+el.dataset.n];
      const f = { wsart: 'art', wsstart: 'start', wsdauer: 'dauer' }[act];
      d.sport = { ...d.sport, [f]: f === 'dauer' ? +el.value : el.value };
      await saveWeek(); render(); return;
    }
    if (act === 'setSport') { state.settings.sport[el.dataset.f] = el.dataset.f === 'dauer' ? +el.value : el.value; await saveSettings(); return; }
    if (act === 'laundryDays') { state.settings.laundryDays = +el.value; await saveSettings(); return; }
    if (act === 'autoLaundry') {
      const set = new Set(state.settings.autoLaundryCats);
      if (el.checked) set.add(el.value); else set.delete(el.value);
      state.settings.autoLaundryCats = [...set]; await saveSettings(); return;
    }
    if (act === 'wocc') { const d = state.week.days[+el.dataset.n]; d.occasion = el.value; d.locked = false; await planDays(+el.dataset.n); }
    if (act === 'wdOcc') { state.settings.weekdayOccasions[+el.dataset.d] = el.value; await saveSettings(); }
    if (act === 'repeatCat') {
      const set = new Set(state.settings.repeatCats);
      if (el.checked) set.add(el.value); else set.delete(el.value);
      state.settings.repeatCats = [...set]; await saveSettings();
    }
  } catch (e) { console.error(e); toast(e.message || 'Fehler'); }
});

// Aufgeklappte Einstellungsbereiche merken (toggle "blubbert" nicht, daher Capture)
document.addEventListener('toggle', (ev) => {
  const d = ev.target;
  if (d.matches?.('details[data-sid]')) { if (d.open) state.openSettings.add(d.dataset.sid); else state.openSettings.delete(d.dataset.sid); }
}, true);

document.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.type === 'range' && el.dataset.out) {
    document.getElementById(el.dataset.out).textContent = (el.dataset.labels === 'form' ? FORM_LABELS : WARM_LABELS)[+el.value];
  }
});

document.addEventListener('submit', (ev) => {
  if (ev.target.id === 'itemForm') { ev.preventDefault(); saveEditing().catch((e) => toast(e.message)); }
});

// ---------- Start ----------
async function init() {
  state.settings = { ...DEFAULT_SETTINGS, ...((await db.get('settings')) || {}) };
  state.items = await db.allItems();
  state.week = await loadWeek();
  state.body = (await db.get('bodyPhoto')) || null;
  if (state.items.length) state.view = 'outfit'; // Startseite: das heutige Outfit
  state.prefs = { ...emptyPrefs(), ...((await db.get('prefs')) || {}) };
  // Übernahme alter Favoriten (Daumen hoch) als Lieblingsoutfits
  state.prefs.favorites.forEach((f) => { if (!state.prefs.ratings[f.key]) state.prefs.ratings[f.key] = 2; });
  state.settings.sport = { ...DEFAULT_SETTINGS.sport, ...state.settings.sport };
  if (!state.settings.v13) { // einmalig: Hosen dürfen jetzt standardmäßig mehrfach pro Woche vorkommen
    if (!state.settings.repeatCats.includes('unterteil')) state.settings.repeatCats.push('unterteil');
    state.settings.v13 = true; await saveSettings();
  }
  go(state.view);
  await loadForecast();
  render();
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
init().catch((e) => { console.error(e); $main.innerHTML = `<div class="note">Fehler beim Start: ${esc(e.message)}</div>`; });
