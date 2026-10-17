import type { HeroSession } from "./types";

const DB_NAME = "hero-sessions";
const DB_VERSION = 1;
const STORE_NAME = "sessions";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
): IDBObjectStore {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

export async function saveSession(session: HeroSession): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readwrite").put(session);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function loadSession(id: string): Promise<HeroSession | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readonly").get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function listSessions(): Promise<HeroSession[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readonly").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteSession(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readwrite").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get the most recently updated session, if any.
 */
export async function getLastSession(): Promise<HeroSession | null> {
  const all = await listSessions();
  if (all.length === 0) return null;
  all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return all[0]!;
}
