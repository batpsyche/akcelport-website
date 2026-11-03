// Immutable path helpers for JSON documents edited by the forms. Paths: "a.b.0.c" (array indices as numbers).
import { useCallback, useEffect, useRef, useState } from 'react';

export type Path = string;
const parts = (p: Path) => (p ? p.split('.').map((s) => (/^\d+$/.test(s) ? Number(s) : s)) : []);

export function getPath(obj: unknown, path: Path): unknown {
  let cur: unknown = obj;
  for (const k of parts(path)) {
    if (cur == null) return undefined;
    cur = (cur as Record<string | number, unknown>)[k];
  }
  return cur;
}

export function setPath<T>(obj: T, path: Path, value: unknown): T {
  const ks = parts(path);
  if (!ks.length) return value as T;
  const clone = (v: unknown, k: string | number): Record<string | number, unknown> => (Array.isArray(v) ? [...v] : v && typeof v === 'object' ? { ...(v as object) } : typeof k === 'number' ? [] : {}) as Record<string | number, unknown>;
  const root = clone(obj, ks[0]);
  let cur = root;
  for (let i = 0; i < ks.length - 1; i++) {
    const next = clone(cur[ks[i]], ks[i + 1]);
    cur[ks[i]] = next;
    cur = next;
  }
  const last = ks[ks.length - 1];
  if (value === undefined) { if (Array.isArray(cur)) cur.splice(last as number, 1); else delete cur[last]; } else cur[last] = value;
  return root as T;
}

export const joinPath = (...p: Array<string | number>) => p.filter((x) => x !== '' && x !== undefined).join('.');

/** Form state for one JSON document with a dirty flag and an unsaved-changes guard. */
export function useDocument<T>(initial: T | undefined) {
  const [doc, setDoc] = useState<T | undefined>(initial);
  const [baseline, setBaseline] = useState<string>(() => JSON.stringify(initial ?? null));
  const initialised = useRef(initial !== undefined);
  useEffect(() => {
    if (!initialised.current && initial !== undefined) { initialised.current = true; setDoc(initial); setBaseline(JSON.stringify(initial)); }
  }, [initial]);
  const dirty = doc !== undefined && JSON.stringify(doc) !== baseline;
  const set = useCallback((path: Path, value: unknown) => setDoc((d) => setPath(d as T, path, value)), []);
  const replace = useCallback((next: T, markClean = true) => { setDoc(next); if (markClean) setBaseline(JSON.stringify(next)); }, []);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
  return { doc, set, replace, dirty };
}
