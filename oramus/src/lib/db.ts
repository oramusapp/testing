// Persistent storage. Everything the user creates lives in IndexedDB of the app's
// origin, which survives app updates (the service worker only swaps code). A schema
// version + migrations keep old data readable after future releases.
import { createStore, get, set, del, entries, clear } from 'idb-keyval';
import { useEffect, useState, useCallback } from 'react';

const kv = createStore('oramus', 'kv');
const files = createStore('oramus-files', 'files');

export const SCHEMA_VERSION = 1;
const cache = new Map<string, unknown>();
const listeners = new Map<string, Set<(v: unknown) => void>>();

/** Loads every key into memory once at startup and runs pending migrations. */
export async function hydrate() {
  for (const [k, v] of await entries(kv)) cache.set(String(k), v);
  const from = (cache.get('meta.schema') as number) ?? 0;
  for (let v = from + 1; v <= SCHEMA_VERSION; v++) await MIGRATIONS[v]?.();
  if (from !== SCHEMA_VERSION) await save('meta.schema', SCHEMA_VERSION);
  try { await navigator.storage?.persist?.(); } catch { /* not supported */ }
}

// Add an entry here for every schema change, never edit an old one.
const MIGRATIONS: Record<number, () => Promise<void>> = {
  1: async () => { /* initial schema */ }
};

export function load<T>(key: string, fallback: T): T {
  return cache.has(key) ? (cache.get(key) as T) : fallback;
}
export async function save<T>(key: string, value: T) {
  cache.set(key, value);
  listeners.get(key)?.forEach((fn) => fn(value));
  await set(key, value, kv);
}

/** React state bound to a persisted key. */
export function usePersisted<T>(key: string, fallback: T): [T, (v: T | ((p: T) => T)) => void] {
  const [val, setVal] = useState<T>(() => load(key, fallback));
  useEffect(() => {
    const fn = (v: unknown) => setVal(v as T);
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key)!.add(fn);
    return () => { listeners.get(key)!.delete(fn); };
  }, [key]);
  const update = useCallback((v: T | ((p: T) => T)) => {
    const next = typeof v === 'function' ? (v as (p: T) => T)(load(key, fallback)) : v;
    void save(key, next);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return [val, update];
}

// ---- binary files (Excel workbooks) ----
export interface FileMeta { id: string; name: string; size: number; modified: number; }
export const listFiles = () => load<FileMeta[]>('excel.files', []);
export async function putFile(meta: FileMeta, data: ArrayBuffer) {
  await set(meta.id, data, files);
  const list = listFiles().filter((f) => f.id !== meta.id);
  await save('excel.files', [meta, ...list].sort((a, b) => b.modified - a.modified));
}
export const getFile = (id: string) => get<ArrayBuffer>(id, files);
export async function deleteFile(id: string) {
  await del(id, files);
  await save('excel.files', listFiles().filter((f) => f.id !== id));
}

// ---- backup / restore ----
const b64 = (buf: ArrayBuffer) => {
  let s = ''; const u = new Uint8Array(buf);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;

export async function exportBackup(): Promise<Blob> {
  const data: Record<string, unknown> = {};
  for (const [k, v] of await entries(kv)) if (!String(k).startsWith('cache.')) data[String(k)] = v;
  const bin: Record<string, string> = {};
  for (const [k, v] of await entries(files)) bin[String(k)] = b64(v as ArrayBuffer);
  return new Blob([JSON.stringify({ app: 'oramus', schema: SCHEMA_VERSION, created: new Date().toISOString(), data, files: bin })], { type: 'application/json' });
}

export async function importBackup(text: string) {
  const j = JSON.parse(text);
  if (j.app !== 'oramus') throw new Error('To nie jest kopia zapasowa Oramus');
  await clear(kv);
  for (const [k, v] of Object.entries(j.data ?? {})) await set(k, v, kv);
  for (const [k, v] of Object.entries(j.files ?? {})) await set(k, unb64(v as string), files);
  cache.clear();
  await hydrate();
}
