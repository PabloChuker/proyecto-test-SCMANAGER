/**
 * CCU Chain Policy — preferencias globales del usuario para el armador de cadenas.
 *
 * Inspirado en la feature "Forzar Inclusión / Exclusión de CCUs" de ccugame.app.
 * Persistido en localStorage (consistencia con cadenas guardadas, ver
 * CCUChainCalculator.tsx que también usa localStorage).
 *
 * El hook `useChainPolicy()` devuelve un objeto referencialmente estable
 * mientras los datos no cambien — clave para evitar el zustand selector trap
 * que ya rompió /loadout 2 veces en fases anteriores
 * (ver memoria sc_labs_zustand_selector_trap).
 *
 * Uso típico:
 *   import { useChainPolicy, addForceExclude } from "@/lib/ccuChainPolicy";
 *   const { include, exclude } = useChainPolicy();
 *   ...
 *   <button onClick={() => addForceExclude(ship.id)}>Excluir</button>
 */

"use client";

import { useSyncExternalStore } from "react";

const KEY_INCLUDE = "sc-labs-ccu-force-include";
const KEY_EXCLUDE = "sc-labs-ccu-force-exclude";
const EVENT_NAME = "sc-labs:ccu-policy-changed";

// ─── Internal helpers ──────────────────────────────────────────────────────

function readKey(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeKey(key: string, ids: string[]): void {
  if (typeof window === "undefined") return;
  // Dedup + sort para que el orden no cause diffs falsos al comparar.
  const uniq = Array.from(new Set(ids)).sort();
  window.localStorage.setItem(key, JSON.stringify(uniq));
  // Custom event para que las suscripciones same-tab se enteren (storage event
  // solo se dispara entre tabs, no en el mismo).
  window.dispatchEvent(new Event(EVENT_NAME));
}

// ─── Read API (sync, sin hook) ─────────────────────────────────────────────

export function getForceIncludeIds(): string[] {
  return readKey(KEY_INCLUDE);
}

export function getForceExcludeIds(): string[] {
  return readKey(KEY_EXCLUDE);
}

// ─── Write API ─────────────────────────────────────────────────────────────

export function setForceIncludeIds(ids: string[]): void {
  writeKey(KEY_INCLUDE, ids);
}

export function setForceExcludeIds(ids: string[]): void {
  writeKey(KEY_EXCLUDE, ids);
}

export function addForceInclude(id: string): void {
  setForceIncludeIds([...getForceIncludeIds(), id]);
}

export function removeForceInclude(id: string): void {
  setForceIncludeIds(getForceIncludeIds().filter((x) => x !== id));
}

export function addForceExclude(id: string): void {
  setForceExcludeIds([...getForceExcludeIds(), id]);
}

export function removeForceExclude(id: string): void {
  setForceExcludeIds(getForceExcludeIds().filter((x) => x !== id));
}

export function clearForceInclude(): void {
  setForceIncludeIds([]);
}

export function clearForceExclude(): void {
  setForceExcludeIds([]);
}

// ─── React hook con cache referencial estable ──────────────────────────────
// Snapshot cache: devolvemos el MISMO objeto si los strings JSON crudos no
// cambiaron. Esto es lo que evita el infinite re-render trap (zustand-style)
// porque useSyncExternalStore compara con Object.is.

let cachedRawInclude = "[]";
let cachedRawExclude = "[]";
let cachedParsedInclude: string[] = [];
let cachedParsedExclude: string[] = [];
let cachedSnapKey = "";
let cachedSnap: { include: string[]; exclude: string[] } = { include: [], exclude: [] };

function getSnapshot(): { include: string[]; exclude: string[] } {
  if (typeof window === "undefined") return cachedSnap;
  const rawInclude = window.localStorage.getItem(KEY_INCLUDE) ?? "[]";
  const rawExclude = window.localStorage.getItem(KEY_EXCLUDE) ?? "[]";
  const snapKey = rawInclude + "" + rawExclude;
  if (snapKey === cachedSnapKey) return cachedSnap;

  // Re-parse solo el lado que cambió.
  if (rawInclude !== cachedRawInclude) {
    try {
      const parsed = JSON.parse(rawInclude);
      cachedParsedInclude = Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
    } catch {
      cachedParsedInclude = [];
    }
    cachedRawInclude = rawInclude;
  }
  if (rawExclude !== cachedRawExclude) {
    try {
      const parsed = JSON.parse(rawExclude);
      cachedParsedExclude = Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
    } catch {
      cachedParsedExclude = [];
    }
    cachedRawExclude = rawExclude;
  }
  cachedSnap = { include: cachedParsedInclude, exclude: cachedParsedExclude };
  cachedSnapKey = snapKey;
  return cachedSnap;
}

function getServerSnapshot(): { include: string[]; exclude: string[] } {
  // SSR-safe: siempre devuelve el mismo objeto vacío (referencia estable).
  return SERVER_EMPTY_SNAP;
}
const SERVER_EMPTY_SNAP = Object.freeze({ include: [] as string[], exclude: [] as string[] });

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY_INCLUDE || e.key === KEY_EXCLUDE) callback();
  };
  const onCustom = () => callback();
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT_NAME, onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT_NAME, onCustom);
  };
}

/**
 * Hook React: devuelve `{ include, exclude }` con shipIds.
 * El objeto es referencialmente estable mientras los datos no cambien,
 * así no dispara re-renders falsos en componentes que lo consumen.
 */
export function useChainPolicy(): { include: string[]; exclude: string[] } {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
