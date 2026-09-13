// Rendered card art, persisted across reloads. Keyed by `opsHash`, which
// names the content, so an entry is never stale: an edit produces a
// different key.
//
// IndexedDB rather than the Cache API because `caches` is exposed only in
// secure contexts, and the game is normally served over plain http on a LAN
// address, where it does not exist.

const DB_NAME = 'bwc-art';
const STORE = 'art';
const SAVED_AT = 'savedAt';

type StoredArt = { opsHash: string; blob: Blob; savedAt: number };

let dbPromise: Promise<IDBDatabase | null> | null = null;

// Resolves to null rather than rejecting when storage is unavailable —
// private windows and storage-blocking settings both show up this way, and
// the caller's answer is the same either way: render it again.
function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'opsHash' }).createIndex(SAVED_AT, SAVED_AT);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      console.warn('bwc art store unavailable:', req.error);
      resolve(null);
    };
  });
  return dbPromise;
}

async function runRequest<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise(resolve => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(undefined);
  });
}

export async function loadArt(opsHash: string): Promise<Blob | undefined> {
  const row = await runRequest<StoredArt | undefined>(
    'readonly',
    store => store.get(opsHash) as IDBRequest<StoredArt | undefined>,
  );
  return row?.blob;
}

export async function saveArt(opsHash: string, blob: Blob): Promise<void> {
  const row: StoredArt = { opsHash, blob, savedAt: Date.now() };
  await runRequest('readwrite', store => store.put(row));
}

// Oldest writes go first. Cards are not re-stamped when read, so this is
// insertion order, not use order; with a cap far above any one library that
// distinction never comes up.
export async function trimArt(max: number): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>(resolve => {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    const count = store.count();
    count.onerror = () => resolve();
    count.onsuccess = () => {
      let excess = count.result - max;
      if (excess <= 0) {
        resolve();
        return;
      }
      const cursorReq = store.index(SAVED_AT).openCursor();
      cursorReq.onerror = () => resolve();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || excess <= 0) {
          resolve();
          return;
        }
        cursor.delete();
        excess--;
        cursor.continue();
      };
    };
  });
}
