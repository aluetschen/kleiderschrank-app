// Oberfläche der App: Ansichten Schrank, Outfit, Woche, Einstellungen
import { db, uid } from './db.js';
import { analyzeClothing } from './ai.js';
import { getForecast, searchPlace, weatherIcon } from './weather.js';
import { generateTryOn, getCachedTryOn, tryOnKey, clearTryOnCache, DEFAULT_IMAGE_MODEL } from './tryon.js';
import {
  KATEGORIEN, ANLAESSE, SAISONS, SLOT_ORDER,
  makeContext, suggestOutfit, swapSlot, planWeek, missingHints, dayTemp,
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
  repeatCats: ['schuhe', 'jacke', 'accessoire'],
  googleKey: '',
  imageModel: DEFAULT_IMAGE_MODEL,
};
const state = {
  view: 'schrank',
  items: [],
  settings: { ...DEFAULT_SETTINGS },
  forecast: null,
  filter: 'alle',
  editing: null,       // Kleidungsstück im Editor
  analyzing: false,
  outfit: { date: ymd(today()), occasion: null, current: null, seen: new Set(), ctx: null },
  week: null,
  placeResults: [],
  body: null,          // Ganzkörperfoto { blob, version }
};

async function saveSettings() { await db.set('settings', state.settings); }
const itemById = (id) => state.items.find((i) => i.id === id);
const weatherFor = (dateStr) => state.forecast?.[dateStr] || null;
const defaultOccasion = (d) => state.settings.weekdayOccasions[d.getDay()] || 'freizeit';

async function loadForecast() {
  state.forecast = await getForecast(state.settings.location);
}

// ---------- Navigation ----------
function go(view) {
  state.view = view;
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  render();
  window.scrollTo(0, 0);
}

function render() {
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
    .filter((i) => state.filter === 'alle' || i.kategorie === state.filter)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const chips = [['alle', `Alle (${state.items.length})`], ...Object.entries(KATEGORIEN).filter(([k]) => counts[k]).map(([k, v]) => [k, `${v} (${counts[k]})`])];
  return `
    <header class="top"><h1>Kleiderschrank</h1></header>
    ${!state.settings.apiKey ? `<div class="note">Für die automatische Erkennung von Fotos bitte in den <a href="#" data-act="go" data-view="einstellungen">Einstellungen</a> einen Claude-API-Schlüssel hinterlegen. Ohne Schlüssel kannst du die Angaben selbst eintragen.</div>` : ''}
    <div class="chips scroll">${chips.map(([k, l]) => `<button class="chip ${state.filter === k ? 'on' : ''}" data-act="filter" data-k="${k}">${esc(l)}</button>`).join('')}</div>
    ${list.length ? `<div class="grid">${list.map((i) => `
      <button class="tile" data-act="edit" data-id="${i.id}">
        <img src="${imgUrl(i)}" alt="" loading="lazy">
        <span>${esc(i.bezeichnung || KATEGORIEN[i.kategorie])}</span>
      </button>`).join('')}</div>`
    : `<div class="empty"><div class="big">👕</div><p>Noch nichts im Schrank.<br>Tippe auf <b>+</b> und fotografiere dein erstes Kleidungsstück.</p><p class="muted">Tipp: Kleidung flach auf einen ruhigen Untergrund legen oder auf einen Bügel hängen.</p>
      <button class="btn" data-act="loadDemo">Beispiel-Schrank laden</button>
      <p class="muted small">27 gezeichnete Beispielteile zum Ausprobieren – ohne Fotos, ohne API-Kosten. Lassen sich jederzeit wieder entfernen.</p></div>`}
    <label class="fab" aria-label="Kleidungsstück hinzufügen">+
      <input id="photoInput" type="file" accept="image/*" multiple hidden>
    </label>`;
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
    regenfest: false, lastWorn: null, wornCount: 0,
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
  return `
    <header class="top"><button class="link" data-act="cancelEdit">‹ Zurück</button><h1>${i.isNew ? 'Neues Teil' : 'Bearbeiten'}</h1></header>
    <form id="itemForm" class="editor">
      <div class="photo"><img src="${imgUrl(i)}" alt="">${state.analyzing ? '<div class="overlay"><div class="spinner"></div>KI erkennt das Teil …</div>' : ''}</div>
      ${state.settings.apiKey && !state.analyzing ? '<button type="button" class="btn ghost small" data-act="analyze">✨ Erneut automatisch erkennen</button>' : ''}
      <label>Bezeichnung<input name="bezeichnung" value="${esc(i.bezeichnung)}" placeholder="z. B. Dunkelblaue Chino"></label>
      <label>Kategorie<select name="kategorie">${opt(KATEGORIEN, i.kategorie)}</select></label>
      <fieldset><legend>Farben</legend>
        <div id="colors">${(i.farben || []).map((f, n) => colorRow(f, n)).join('')}</div>
        <button type="button" class="btn ghost small" data-act="addColor">+ Farbe</button>
      </fieldset>
      <fieldset><legend>Muster</legend><div class="chips">
        <label class="chip check"><input type="radio" name="muster" value="uni" ${i.muster !== 'gemustert' ? 'checked' : ''}><span>Uni</span></label>
        <label class="chip check"><input type="radio" name="muster" value="gemustert" ${i.muster === 'gemustert' ? 'checked' : ''}><span>Gemustert</span></label>
      </div></fieldset>
      <label>Stil: <b id="formOut">${FORM_LABELS[i.formalitaet]}</b><input type="range" name="formalitaet" min="1" max="5" value="${i.formalitaet}" data-out="formOut" data-labels="form"></label>
      <label>Wärme: <b id="warmOut">${WARM_LABELS[i.waerme]}</b><input type="range" name="waerme" min="1" max="5" value="${i.waerme}" data-out="warmOut" data-labels="warm"></label>
      <fieldset><legend>Anlässe</legend><div class="chips">${multi('anlaesse', ANLAESSE, i.anlaesse || [])}</div></fieldset>
      <fieldset><legend>Jahreszeiten</legend><div class="chips">${multi('saisons', SAISONS, i.saisons || [])}</div></fieldset>
      <label class="row"><input type="checkbox" name="regenfest" ${i.regenfest ? 'checked' : ''}> Regenfest</label>
      ${!i.isNew ? `<p class="muted">Getragen: ${i.wornCount || 0}× ${i.lastWorn ? `· zuletzt ${fmtDay(parseYmd(i.lastWorn))}` : ''}</p>` : ''}
      <div class="actions">
        <button type="submit" class="btn primary" ${state.analyzing ? 'disabled' : ''}>Speichern</button>
        ${!i.isNew ? '<button type="button" class="btn danger" data-act="deleteItem">Löschen</button>' : ''}
      </div>
    </form>`;
}

function colorRow(f, n) {
  return `<div class="colorrow" data-n="${n}">
    <input type="color" name="hex" value="${esc(f.hex)}">
    <input name="cname" value="${esc(f.name)}" placeholder="Farbname">
    <label class="row small"><input type="checkbox" name="neutral" ${f.neutral ? 'checked' : ''}> neutral</label>
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
  if (!state.settings.location) return `<div class="weather muted">Kein Ort festgelegt – es wird mit ${dayTemp(null, d)} °C (Jahreszeit) gerechnet. <a href="#" data-act="go" data-view="einstellungen">Ort festlegen</a></div>`;
  if (!w) return `<div class="weather muted">Keine Vorhersage für diesen Tag – gerechnet wird mit ${dayTemp(null, d)} °C.</div>`;
  return `<div class="weather"><span class="wi">${weatherIcon(w.code)}</span>
    <span><b>${Math.round(w.tmin)}° / ${Math.round(w.tmax)}°</b> · Regen ${w.rain ?? 0} %<br><span class="muted">${esc(state.settings.location.name)}</span></span></div>`;
}

// Einzelteile als Liste: Bild, Kategorie, Name, Farben, Tausch-Knopf
function itemList(slots, act, extra = '') {
  return `<ul class="itemlist">${SLOT_ORDER.filter((k) => slots[k]).map((k) => {
    const it = slots[k];
    return `<li>
      <img src="${imgUrl(it)}" alt="">
      <div class="il-text"><small>${esc(KATEGORIEN[k])}</small><b>${esc(it.bezeichnung || KATEGORIEN[k])}</b>
        <span class="dots">${(it.farben || []).map((f) => `<i style="background:${esc(f.hex)}" title="${esc(f.name)}"></i>`).join('')}</span></div>
      <button class="swapbtn" data-act="${act}" data-slot="${k}" ${extra} aria-label="${esc(KATEGORIEN[k])} tauschen">↻</button>
    </li>`;
  }).join('')}</ul>`;
}

// ---------- Anprobe ----------
const tryState = new Map(); // Schlüssel -> { status: 'loading' | 'done' | 'error', url, error }
const tryChecked = new Set();

function tryOnBlock(slots, attrs) {
  if (!state.body) {
    return `<div class="tryon-box empty-try"><span class="big">🧍</span>
      <p>Lade in den <a href="#" data-act="go" data-view="einstellungen">Einstellungen</a> ein Ganzkörperfoto hoch, dann siehst du hier das Outfit an dir.</p></div>`;
  }
  const key = tryOnKey(slots, state.body.version);
  const t = tryState.get(key);
  if (t?.status === 'done') {
    return `<div class="tryon-box"><img class="tryon" src="${t.url}" alt="Anprobe" data-act="zoom">
      <button class="mini-btn regen" data-act="tryon" data-force="1" ${attrs}>↻ Neu erzeugen</button></div>`;
  }
  if (t?.status === 'loading') {
    return `<div class="tryon-box loading" data-trykey="${esc(key)}"><div class="spinner dark"></div><p>Anprobe wird erstellt …<br><span class="muted small">dauert ca. 10–40 Sekunden</span></p></div>`;
  }
  return `<div class="tryon-box empty-try" data-trykey="${esc(key)}">
    ${t?.status === 'error' ? `<p class="err">${esc(t.error)}</p>` : '<span class="big">🧍</span>'}
    <button class="btn primary small" data-act="tryon" ${attrs}>👤 ${t?.status === 'error' ? 'Erneut versuchen' : 'Anprobe ansehen'}</button>
    <p class="muted small">Erstellt mit Google Gemini · kostet wenige Cent pro Bild</p></div>`;
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
  const t = ymd(today()), m = ymd(addDays(today(), 1));
  let body = '';
  if (!state.items.length) body = '<div class="empty"><p>Fotografiere zuerst ein paar Teile im Schrank.</p></div>';
  else if (o.current) {
    body = `${tryOnBlock(o.current.slots, 'data-src="outfit"')}
      <h2 class="sub">Die Teile im Einzelnen</h2>
      ${itemList(o.current.slots, 'swap')}
      <ul class="reasons">${o.current.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      <div class="actions">
        <button class="btn" data-act="suggest">🔀 Anderer Vorschlag</button>
        <button class="btn primary" data-act="wearToday">✓ Das ziehe ich an</button>
      </div>`;
  } else if (o.hints) {
    body = `<div class="note">Für ein Outfit fehlt noch: <ul>${o.hints.map((h) => `<li>${esc(h)}</li>`).join('')}</ul></div>`;
  }
  return `
    <header class="top"><h1>Outfit</h1></header>
    <div class="chips">
      <button class="chip ${o.date === t ? 'on' : ''}" data-act="odate" data-d="${t}">Heute</button>
      <button class="chip ${o.date === m ? 'on' : ''}" data-act="odate" data-d="${m}">Morgen</button>
      <input type="date" class="chip" id="odate" value="${o.date}">
    </div>
    <div class="chips">${Object.entries(ANLAESSE).map(([k, v]) => `<button class="chip ${o.occasion === k ? 'on' : ''}" data-act="oocc" data-k="${k}">${v}</button>`).join('')}</div>
    ${weatherBlock(o.date)}
    ${!o.current && state.items.length ? '<button class="btn primary wide" data-act="suggest">Outfit vorschlagen</button>' : ''}
    ${body}`;
}

function suggest() {
  const o = state.outfit;
  const d = parseYmd(o.date);
  o.ctx = makeContext({ items: state.items, date: d, weather: weatherFor(o.date), occasion: o.occasion });
  if (o.current) o.seen.add(o.current.key);
  let next = suggestOutfit(o.ctx, o.seen);
  if (!next && o.seen.size) { o.seen.clear(); next = suggestOutfit(o.ctx, o.seen); toast('Alle Kombinationen gezeigt – es geht von vorne los.'); }
  o.current = next;
  o.hints = next ? null : missingHints(o.ctx);
  render();
}

async function markWorn(slots, dateStr, occasion) {
  for (const it of Object.values(slots)) {
    if (!it.lastWorn || it.lastWorn < dateStr) it.lastWorn = dateStr;
    it.wornCount = (it.wornCount || 0) + 1;
    await db.putItem(it);
  }
  await db.putHistory({ id: uid(), date: dateStr, occasion, itemIds: Object.values(slots).map((i) => i.id) });
}

// ---------- Ansicht: Wochenplan ----------
async function loadWeek() {
  const saved = await db.get('week');
  if (!saved) return null;
  return {
    start: saved.start,
    days: saved.days.map((d) => {
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
      date: d.date, occasion: d.occasion, locked: !!d.locked, worn: !!d.worn, reasons: d.outfit?.reasons || [], hints: d.hints || [],
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
  const header = `
    <header class="top"><h1>Wochenplan</h1></header>
    <div class="chips">
      <button class="chip ${w?.start === t ? 'on' : ''}" data-act="wstart" data-d="${t}">Ab heute</button>
      <button class="chip ${w?.start === mo ? 'on' : ''}" data-act="wstart" data-d="${mo}">Ab Montag ${fmtDay(parseYmd(mo)).slice(3)}</button>
    </div>`;
  if (!state.items.length) return header + '<div class="empty"><p>Fotografiere zuerst ein paar Teile im Schrank.</p></div>';
  if (!w) return header + '<p class="muted">Wähle den Starttag. Danach bekommst du für 7 Tage je ein Outfit – passend zu Wetter und Anlass, ohne doppelte Teile.</p>';
  const days = w.days.map((d, n) => {
    const wx = weatherFor(d.date);
    return `<section class="day ${d.locked ? 'locked' : ''} ${d.worn ? 'worn' : ''}">
      <div class="dayhead">
        <b>${fmtDay(d.dateObj)}</b>
        <span class="muted">${wx ? `${weatherIcon(wx.code)} ${Math.round(wx.tmin)}°/${Math.round(wx.tmax)}°${wx.rain >= 50 ? ` ☂ ${wx.rain} %` : ''}` : `≈ ${dayTemp(null, d.dateObj)} °C`}</span>
        <select data-act="wocc" data-n="${n}">${Object.entries(ANLAESSE).map(([k, v]) => `<option value="${k}" ${k === d.occasion ? 'selected' : ''}>${v}</option>`).join('')}</select>
      </div>
      ${d.outfit ? `${state.openDay === n ? tryOnBlock(d.outfit.slots, `data-src="week" data-n="${n}"`) + itemList(d.outfit.slots, 'wswap', `data-n="${n}"`)
          : `<div class="mini">${SLOT_ORDER.filter((k) => d.outfit.slots[k]).map((k) => `<button class="mp" data-act="wswap" data-n="${n}" data-slot="${k}" title="${esc(d.outfit.slots[k].bezeichnung)}"><img src="${imgUrl(d.outfit.slots[k])}" alt=""></button>`).join('')}</div>
            <p class="names small muted">${SLOT_ORDER.filter((k) => d.outfit.slots[k]).map((k) => esc(d.outfit.slots[k].bezeichnung)).join(' · ')}</p>`}`
        : `<p class="muted small">${d.hints?.length ? 'Fehlt: ' + esc(d.hints.join(', ')) : 'Noch kein Outfit'}</p>`}
      <div class="dayact">
        ${d.outfit ? `<button class="mini-btn ${state.openDay === n ? 'on' : ''}" data-act="wopen" data-n="${n}">${state.openDay === n ? '▲ Zuklappen' : '👤 Anprobe & Details'}</button>` : ''}
        <button class="mini-btn" data-act="wlock" data-n="${n}">${d.locked ? '🔒 Fixiert' : '🔓 Fixieren'}</button>
        <button class="mini-btn" data-act="wredo" data-n="${n}" ${d.locked ? 'disabled' : ''}>↻ Neu</button>
        <button class="mini-btn" data-act="wworn" data-n="${n}" ${!d.outfit || d.worn ? 'disabled' : ''}>${d.worn ? '✓ Getragen' : '✓ Angezogen'}</button>
      </div>
    </section>`;
  }).join('');
  return header + `
    <button class="btn primary wide" data-act="wplan">${w.days.some((d) => d.outfit) ? '↻ Nicht fixierte Tage neu planen' : 'Woche planen'}</button>
    <p class="muted small">Tippe auf ein Teil, um es zu tauschen. Fixierte Tage bleiben beim Neuplanen erhalten.</p>
    ${days}`;
}

async function planDays(onlyIndex = null) {
  const w = state.week;
  let days = w.days.map((d) => ({ ...d, weather: weatherFor(d.date) }));
  if (onlyIndex !== null) {
    // Nur einen Tag neu: alle anderen gelten vorübergehend als fixiert
    days = days.map((d, n) => (n === onlyIndex ? { ...d, locked: false, outfit: null } : { ...d, locked: true }));
  }
  const planned = planWeek(state.items, days, state.settings.repeatCats);
  w.days = planned.map((d, n) => (onlyIndex !== null && n !== onlyIndex ? { ...w.days[n] } : d));
  await saveWeek();
  render();
}

// ---------- Ansicht: Einstellungen ----------
function renderSettings() {
  const s = state.settings;
  const WD = [1, 2, 3, 4, 5, 6, 0];
  return `
    <header class="top"><h1>Einstellungen</h1></header>
    <section class="card">
      <h2>KI-Erkennung (Claude)</h2>
      <p class="muted small">Der Schlüssel wird nur auf diesem Gerät gespeichert und direkt an Anthropic gesendet. Einen Schlüssel bekommst du unter console.anthropic.com. Kosten: ca. 1–2 Cent pro Foto.</p>
      <input type="password" id="apiKey" value="${esc(s.apiKey)}" placeholder="sk-ant-…" autocomplete="off">
      <button class="btn small" data-act="saveKey">Speichern</button>
    </section>
    <section class="card">
      <h2>Ort fürs Wetter</h2>
      <p>${s.location ? `📍 ${esc(s.location.name)}` : '<span class="muted">Noch kein Ort</span>'}</p>
      <div class="row"><input id="placeQ" placeholder="Stadt suchen, z. B. Bielefeld"><button class="btn small" data-act="searchPlace">Suchen</button></div>
      ${state.placeResults.map((p, n) => `<button class="list-item" data-act="pickPlace" data-n="${n}">${esc(p.name)}</button>`).join('')}
      <button class="btn ghost small" data-act="gps">Aktuellen Standort verwenden</button>
    </section>
    <section class="card">
      <h2>Standard-Anlass je Wochentag</h2>
      ${WD.map((d) => `<label class="row between">${['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][d]}
        <select data-act="wdOcc" data-d="${d}">${Object.entries(ANLAESSE).map(([k, v]) => `<option value="${k}" ${s.weekdayOccasions[d] === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`).join('')}
    </section>
    <section class="card">
      <h2>Im Wochenplan mehrfach erlaubt</h2>
      <div class="chips">${Object.entries(KATEGORIEN).map(([k, v]) => `<label class="chip check"><input type="checkbox" data-act="repeatCat" value="${k}" ${s.repeatCats.includes(k) ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div>
    </section>
    <section class="card">
      <h2>Anprobe (Google Gemini)</h2>
      <p class="muted small">Ein Ganzkörperfoto von dir: Die App zeigt damit, wie die vorgeschlagenen Outfits an dir aussehen. Tipps: gerade stehen, ganzer Körper von Kopf bis Fuß, eher eng anliegende Kleidung, ruhiger Hintergrund, gutes Licht.</p>
      ${state.body ? `<img class="bodythumb" src="${bodyUrl()}" alt="Ganzkörperfoto" data-act="zoom">` : ''}
      <div class="row">
        <label class="btn small">${state.body ? 'Foto ändern' : '📷 Ganzkörperfoto wählen'}<input type="file" id="bodyInput" accept="image/*" hidden></label>
        ${state.body ? '<button class="btn danger small" data-act="deleteBody">Foto löschen</button>' : ''}
      </div>
      <label class="small muted">Google-API-Schlüssel (aistudio.google.com → „Get API key")</label>
      <input type="password" id="googleKey" value="${esc(s.googleKey)}" placeholder="AIza…" autocomplete="off">
      <label class="small muted">Bildmodell</label>
      <input id="imageModel" value="${esc(s.imageModel)}" placeholder="${DEFAULT_IMAGE_MODEL}" autocomplete="off" autocapitalize="off">
      <button class="btn small" data-act="saveGoogle">Speichern</button>
      <p class="muted small">Datenschutz: Für jede Anprobe gehen dein Foto und die Bilder der Kleidungsstücke an Google. Im kostenlosen Google-Kontingent darf Google eingesendete Daten zur Verbesserung seiner Dienste nutzen, mit Abrechnung (Bezahlkonto) nicht – siehe Google-Nutzungsbedingungen. Fertige Bilder werden nur auf diesem iPhone gespeichert (max. 40).</p>
      <button class="btn ghost small" data-act="clearTryOns">Gespeicherte Anprobe-Bilder löschen</button>
    </section>
    <section class="card">
      <h2>Beispiel-Schrank</h2>
      <p class="muted small">27 gezeichnete Beispielteile (Alltag, Büro, Festlich, Sport) zum Ausprobieren. ${state.items.some((i) => i.demo) ? `Aktuell geladen: ${state.items.filter((i) => i.demo).length} Teile.` : ''}</p>
      <div class="row"><button class="btn small" data-act="loadDemo">Laden</button>
      <button class="btn danger small" data-act="removeDemo" ${state.items.some((i) => i.demo) ? '' : 'disabled'}>Entfernen</button></div>
    </section>
    <section class="card">
      <h2>Sicherung</h2>
      <p class="muted small">Alle Daten liegen nur auf diesem iPhone. Exportiere regelmäßig eine Sicherung (z. B. in iCloud Drive).</p>
      <div class="row"><button class="btn small" data-act="export">Exportieren</button>
      <label class="btn small">Importieren<input type="file" id="importInput" accept="application/json,.json" hidden></label></div>
      <button class="btn danger small" data-act="wipe">Alle Daten löschen</button>
    </section>
    <p class="muted small center">Kleiderschrank · Version 1.2</p>`;
}

async function exportBackup() {
  const toDataUrl = (blob) => new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });
  const items = [];
  for (const it of state.items) items.push({ ...it, image: it.image ? await toDataUrl(it.image) : null });
  const { apiKey, googleKey, ...settings } = state.settings; // Schlüssel nicht mit exportieren
  const data = { app: 'kleiderschrank', version: 1, exportedAt: new Date().toISOString(), settings, items, history: await db.allHistory() };
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
  if (data.settings) { state.settings = { ...state.settings, ...data.settings, apiKey: state.settings.apiKey, googleKey: state.settings.googleKey }; await saveSettings(); }
  state.items = await db.allItems();
  toast(`${n} Teile importiert.`);
}

// ---------- Beispiel-Schrank ----------
async function loadDemo() {
  const list = await (await fetch('demo/demo.json')).json();
  const have = new Set(state.items.filter((i) => i.demo).map((i) => i.demoId));
  let n = 0;
  for (const d of list) {
    if (have.has(d.demoId)) continue; // nicht doppelt laden
    const image = await (await fetch('demo/' + d.datei)).blob();
    const { datei, ...meta } = d;
    const item = { ...newItem(image), ...meta, demo: true };
    await db.putItem(item);
    state.items.push(item);
    n++;
  }
  toast(n ? `${n} Beispielteile geladen.` : 'Der Beispiel-Schrank ist schon geladen.');
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
      case 'go': state.editing = null; go(el.dataset.view); break;
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
        const next = swapSlot(o.current, el.dataset.slot, o.ctx);
        if (next) { o.current = next; render(); } else toast('Keine Alternative in dieser Kategorie.');
        break;
      }
      case 'wearToday':
        await markWorn(state.outfit.current.slots, state.outfit.date, state.outfit.occasion);
        toast('Viel Spaß! Eingetragen als getragen.'); break;

      case 'wstart': state.week = emptyWeek(el.dataset.d); await planDays(); break;
      case 'wplan': await planDays(); break;
      case 'wredo': await planDays(n); break;
      case 'wlock': state.week.days[n].locked = !state.week.days[n].locked; await saveWeek(); render(); break;
      case 'wworn': {
        const d = state.week.days[n];
        await markWorn(d.outfit.slots, d.date, d.occasion);
        d.worn = true; d.locked = true; await saveWeek(); render(); toast('Als getragen eingetragen.');
        break;
      }
      case 'wswap': {
        const d = state.week.days[n];
        const others = new Set();
        state.week.days.forEach((x, k) => { if (k !== n && x.outfit) Object.values(x.outfit.slots).forEach((i) => others.add(i.id)); });
        const repeat = new Set(state.items.filter((i) => state.settings.repeatCats.includes(i.kategorie)).map((i) => i.id));
        const ctx = makeContext({
          items: state.items, date: d.dateObj, weather: weatherFor(d.date), occasion: d.occasion,
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
        if (!state.settings.googleKey) { toast('Bitte zuerst den Google-API-Schlüssel in den Einstellungen eintragen.'); break; }
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
    if (act === 'wocc') { const d = state.week.days[+el.dataset.n]; d.occasion = el.value; d.locked = false; await planDays(+el.dataset.n); }
    if (act === 'wdOcc') { state.settings.weekdayOccasions[+el.dataset.d] = el.value; await saveSettings(); }
    if (act === 'repeatCat') {
      const set = new Set(state.settings.repeatCats);
      if (el.checked) set.add(el.value); else set.delete(el.value);
      state.settings.repeatCats = [...set]; await saveSettings();
    }
  } catch (e) { console.error(e); toast(e.message || 'Fehler'); }
});

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
  render();
  await loadForecast();
  render();
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
init().catch((e) => { console.error(e); $main.innerHTML = `<div class="note">Fehler beim Start: ${esc(e.message)}</div>`; });
