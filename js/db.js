// Lokale Datenbank im Browser (IndexedDB). Alle Daten bleiben auf dem Gerät.
const DB_NAME = 'kleiderschrank';
const VERSION = 1;
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('items', { keyPath: 'id' });   // Kleidungsstücke
        db.createObjectStore('history', { keyPath: 'id' }); // getragene Outfits
        db.createObjectStore('kv');                          // Einstellungen, Wochenplan, Wetter-Cache
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function run(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const db = {
  allItems: () => run('items', 'readonly', (s) => s.getAll()),
  getItem: (id) => run('items', 'readonly', (s) => s.get(id)),
  putItem: (item) => run('items', 'readwrite', (s) => s.put(item)),
  deleteItem: (id) => run('items', 'readwrite', (s) => s.delete(id)),
  allHistory: () => run('history', 'readonly', (s) => s.getAll()),
  putHistory: (h) => run('history', 'readwrite', (s) => s.put(h)),
  get: (key) => run('kv', 'readonly', (s) => s.get(key)),
  set: (key, value) => run('kv', 'readwrite', (s) => s.put(value, key)),
  del: (key) => run('kv', 'readwrite', (s) => s.delete(key)),
  async clearAll() {
    for (const s of ['items', 'history', 'kv']) await run(s, 'readwrite', (st) => st.clear());
  },
};

export function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
}
