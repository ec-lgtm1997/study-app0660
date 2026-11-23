/**
 * Zwischenspeicher für die Fragenerstellung (IndexedDB, nur auf diesem Gerät).
 * Hält Dateien, Einstellungen und alle schon erstellten Fragen, damit nach einem
 * Neuladen oder Schließen der Seite nichts verloren geht.
 */
const DB = "lernplattform";
const STORE = "entwurf";
const KEY = "aktuell";

let memory: unknown = null;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadDraft<T>(): Promise<T | null> {
  try {
    return ((await run("readonly", (s) => s.get(KEY))) as T | undefined) ?? null;
  } catch {
    return (memory as T | null) ?? null;
  }
}

export async function saveDraft<T>(value: T): Promise<void> {
  memory = value;
  try {
    await run("readwrite", (s) => s.put(value, KEY));
  } catch {
    // ohne IndexedDB bleibt der Entwurf nur bis zum Neuladen erhalten
  }
}

export async function clearDraft(): Promise<void> {
  memory = null;
  try {
    await run("readwrite", (s) => s.delete(KEY));
  } catch {
    // nichts zu tun
  }
}
