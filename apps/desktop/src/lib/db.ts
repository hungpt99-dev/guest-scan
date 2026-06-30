import { DB_NAME, DB_VERSION, STORE_NAMES } from "../config/constants";

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAMES.IMPORT_SESSIONS)) {
        db.createObjectStore(STORE_NAMES.IMPORT_SESSIONS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.GUEST_ROWS)) {
        const store = db.createObjectStore(STORE_NAMES.GUEST_ROWS, { keyPath: "id" });
        store.createIndex("session_id", "sessionId", { unique: false });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("fill_status", "fillStatus", { unique: false });
        store.createIndex("full_name", "fullName", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.TARGET_TEMPLATES)) {
        db.createObjectStore(STORE_NAMES.TARGET_TEMPLATES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.FILL_EVENTS)) {
        const store = db.createObjectStore(STORE_NAMES.FILL_EVENTS, { keyPath: "id" });
        store.createIndex("session_id", "sessionId", { unique: false });
        store.createIndex("event_type", "eventType", { unique: false });
        store.createIndex("created_at", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.SETTINGS)) {
        db.createObjectStore(STORE_NAMES.SETTINGS, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.AUTO_FILL_PROFILES)) {
        db.createObjectStore(STORE_NAMES.AUTO_FILL_PROFILES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.AUDIT_LOGS)) {
        const store = db.createObjectStore(STORE_NAMES.AUDIT_LOGS, { keyPath: "id" });
        store.createIndex("event_type", "eventType", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
        store.createIndex("session_id", "sessionId", { unique: false });
      }
    };
    request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
    request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
  });
}

export async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

export async function getById<T>(storeName: string, id: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function getByIndex<T>(storeName: string, indexName: string, value: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(value);
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

export async function put<T>(storeName: string, value: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.put(value);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function remove(storeName: string, id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearStore(storeName: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
