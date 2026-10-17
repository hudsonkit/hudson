import type { LibraryFontMeta } from "./types";

const DB_NAME = "hero-library";
const DB_VERSION = 1;
const META_STORE = "fonts-meta";
const DATA_STORE = "fonts-data";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(DATA_STORE)) {
        db.createObjectStore(DATA_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listFontMetas(): Promise<LibraryFontMeta[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readonly");
    const req = tx.objectStore(META_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function addFont(
  meta: LibraryFontMeta,
  buffer: ArrayBuffer | null,
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([META_STORE, DATA_STORE], "readwrite");
    tx.objectStore(META_STORE).put(meta);
    if (buffer) {
      tx.objectStore(DATA_STORE).put(buffer, meta.id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getFontBuffer(id: string): Promise<ArrayBuffer | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATA_STORE, "readonly");
    const req = tx.objectStore(DATA_STORE).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function removeFont(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([META_STORE, DATA_STORE], "readwrite");
    tx.objectStore(META_STORE).delete(id);
    tx.objectStore(DATA_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
