"use client";
// =============================================================================
// SC LABS — DeckCard (Loadout.20, 2026-11-14)
//
// Tarjeta base del loadout en formato denso: borde fino, header compacto con
// ícono + título + contador + acciones, y cuerpo colapsable. Reemplaza al
// WidgetShell del lienzo arrastrable: acá las tarjetas viven en columnas
// fijas y nunca se pisan entre sí.
//
// El estado colapsado se recuerda por dispositivo (localStorage).
// =============================================================================

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { ChevronDown } from "lucide-react";

const STORAGE_KEY = "sc-labs-deck-collapsed-v1";

// Mini store externo (useSyncExternalStore): el snapshot es el string crudo de
// localStorage — un primitivo estable — y en el server siempre "[]", así el
// primer render coincide con el HTML y recién después se aplica lo guardado.
const listeners = new Set<() => void>();
let memoryFallback = "[]"; // si el storage está bloqueado (iframe sandboxed, modo privado)

function getSnapshot(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? memoryFallback;
  } catch {
    return memoryFallback;
  }
}
function getServerSnapshot(): string {
  return "[]";
}
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function parseCollapsed(raw: string): Set<string> {
  try {
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}
function writeCollapsed(set: Set<string>) {
  memoryFallback = JSON.stringify([...set]);
  try {
    localStorage.setItem(STORAGE_KEY, memoryFallback);
  } catch {
    /* no es crítico: queda en memoria durante la sesión */
  }
  listeners.forEach((cb) => cb());
}

export function DeckCard({
  id,
  title,
  icon,
  count,
  actions,
  children,
  bodyClassName = "p-2.5",
  overflowVisible = false,
  collapsible = true,
}: {
  id: string;
  title: string;
  /** Ruta de un ícono de /public/icons (opcional). */
  icon?: string;
  /** Contador a la derecha del título (ej. cantidad de slots). */
  count?: number | string;
  /** Controles extra en el header (toggles, botones). */
  actions?: React.ReactNode;
  children: React.ReactNode;
  bodyClassName?: string;
  /** Para tarjetas que abren desplegables que deben salirse del borde. */
  overflowVisible?: boolean;
  collapsible?: boolean;
}) {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const collapsed = collapsible && parseCollapsed(raw).has(id);

  const toggle = useCallback(() => {
    const set = parseCollapsed(getSnapshot());
    if (set.has(id)) set.delete(id);
    else set.add(id);
    writeCollapsed(set);
  }, [id]);

  return (
    <section
      data-deck-card={id}
      className={
        "rounded-lg border border-zinc-800/80 bg-zinc-950/75 backdrop-blur-sm " +
        (overflowVisible ? "overflow-visible" : "overflow-hidden")
      }
    >
      <header
        className={
          "flex items-center gap-2 h-10 pl-3 pr-1.5 " +
          (collapsed ? "" : "border-b border-zinc-800/70")
        }
      >
        {icon && (
          <Image src={icon} alt="" width={16} height={16} className="brightness-125 opacity-80 shrink-0" />
        )}
        <h2 className="text-[13px] font-semibold tracking-wide text-zinc-100 truncate">{title}</h2>
        {count != null && (
          <span className="text-[11px] font-mono tabular-nums text-zinc-500">{count}</span>
        )}
        <span className="flex-1" />
        {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
        {collapsible && (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
            className="w-7 h-7 shrink-0 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
          >
            <ChevronDown
              size={15}
              aria-hidden
              className={"transition-transform duration-200 " + (collapsed ? "-rotate-90" : "")}
            />
          </button>
        )}
      </header>
      {!collapsed && <div className={bodyClassName}>{children}</div>}
    </section>
  );
}

/**
 * Monta `children` recién cuando el bloque está por entrar en pantalla, y los
 * deja montados de ahí en más. Para contenido caro que vive lejos del inicio
 * (los tres visores 3D de dinámica de vuelo): no crea contextos WebGL ni sube
 * el modelo a la GPU hasta que el usuario baja a verlo.
 */
export function LazyMount({
  children,
  minHeight,
  rootMargin = "300px",
}: {
  children: React.ReactNode;
  /** Alto reservado mientras no está montado, para que el scroll no salte. */
  minHeight: number;
  rootMargin?: string;
}) {
  const [show, setShow] = useState(false);
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (show || !node) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setShow(true);
      },
      { rootMargin },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [show, node, rootMargin]);
  return (
    <div ref={setNode} style={show ? undefined : { minHeight }}>
      {show ? children : null}
    </div>
  );
}

// ── Piezas chicas compartidas por las tarjetas de stats ──────────────────────

/** Número con separador fino de miles: 12 778. */
export function fmtInt(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  return Math.round(v).toLocaleString("en-US").replace(/,/g, " ");
}

/** Hasta 1 decimal, sin ceros de relleno: 43.7 · 600 · 0.75. */
export function fmtSmall(v: number | null | undefined, decimals = 1): string {
  if (v == null || !isFinite(v)) return "—";
  if (Math.abs(v) >= 1000) return fmtInt(v);
  const s = v.toFixed(decimals);
  // Solo se recortan ceros DESPUÉS del punto: 43.70 → 43.7, pero 600 queda 600.
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

/** Mosaico de cifra grande: valor + etiqueta. `accent` resalta el principal. */
export function StatTile({
  value,
  label,
  color,
  accent = false,
  sub,
}: {
  value: string;
  label: string;
  color?: string;
  accent?: boolean;
  sub?: React.ReactNode;
}) {
  return (
    <div
      className={
        "min-w-0 rounded-md border px-2.5 py-2 " +
        (accent
          ? "border-amber-500/40 bg-amber-500/[0.07]"
          : "border-zinc-800/70 bg-zinc-900/60")
      }
    >
      <div
        className="text-[22px] leading-none font-mono font-bold tabular-nums truncate"
        style={{ color: color ?? "#f4f4f5" }}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[9px] font-mono uppercase tracking-[0.14em] text-zinc-500 truncate">
        {label}
      </div>
      {sub && <div className="mt-1 text-[10px] font-mono text-zinc-400 truncate">{sub}</div>}
    </div>
  );
}

/** Fila etiqueta → contenido a la derecha (chips o valor). */
export function StatRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-[26px] border-b border-zinc-800/40 last:border-b-0">
      <span className="text-[11px] text-zinc-400 shrink-0">{label}</span>
      <div className="flex items-center justify-end gap-1 flex-wrap min-w-0">{children}</div>
    </div>
  );
}

/** Chip "Etiqueta valor" con el valor coloreado. */
export function Chip({ label, value, color }: { label?: string; value: string; color?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 rounded border border-zinc-800/80 bg-zinc-900/70 px-1.5 py-[2px] text-[10px] font-mono whitespace-nowrap">
      {label && <span className="text-zinc-500">{label}</span>}
      <span className="font-semibold tabular-nums" style={{ color: color ?? "#e4e4e7" }}>
        {value}
      </span>
    </span>
  );
}
