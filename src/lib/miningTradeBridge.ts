// =============================================================================
// SC LABS — Mining ↔ Trade bridge helpers
//
// Fase A of the Inventory → Route → Sale → P&L tree. We don't have a dedicated
// `trade_work_orders.source_mining_*` column yet (that's Fase C), so for now
// we encode the link as a marker in the free-form `notes` field.
//
// Two marker families live side by side:
//
//   [mining:SESSION_ID:MINERAL_ID:MINERAL_NAME]   (Fase A — per-item source)
//   [route:GROUP_ID:STOP_INDEX:STOP_TOTAL]        (Fase B — multi-sell route)
//
// They are independent: a WO can have either, both, or neither. Markers are
// always prepended to notes, on their own line, so the user's free text stays
// untouched below them.
// =============================================================================

// ─── Fase A — Mining marker ─────────────────────────────────────────────────

export interface MiningMarker {
  sessionId: string;
  mineralId: string;
  mineralName: string;
}

const MINING_MARKER_RE = /\[mining:([^:\]]+):([^:\]]+):([^\]]*)\]\s*/;

/** Serialize a marker for prepending to `trade_work_orders.notes`. */
export function buildMiningMarker(m: MiningMarker): string {
  return `[mining:${m.sessionId}:${m.mineralId}:${m.mineralName}]`;
}

/** Extract the mining marker (if any) from a notes string. */
export function parseMiningMarker(
  notes: string | null | undefined
): MiningMarker | null {
  if (!notes) return null;
  const match = notes.match(MINING_MARKER_RE);
  if (!match) return null;
  return {
    sessionId: match[1],
    mineralId: match[2],
    mineralName: match[3] || match[2],
  };
}

/** Remove the mining marker from notes, leaving the user-visible remainder. */
export function stripMiningMarker(notes: string | null | undefined): string {
  if (!notes) return "";
  return notes.replace(MINING_MARKER_RE, "");
}

// ─── Fase B — Route marker (multi-sell route group) ─────────────────────────

export interface RouteMarker {
  groupId: string;
  stop: number;
  total: number;
}

const ROUTE_MARKER_RE = /\[route:([^:\]]+):(\d+):(\d+)\]\s*/;

export function buildRouteMarker(m: RouteMarker): string {
  return `[route:${m.groupId}:${m.stop}:${m.total}]`;
}

export function parseRouteMarker(
  notes: string | null | undefined
): RouteMarker | null {
  if (!notes) return null;
  const match = notes.match(ROUTE_MARKER_RE);
  if (!match) return null;
  return {
    groupId: match[1],
    stop: parseInt(match[2], 10),
    total: parseInt(match[3], 10),
  };
}

export function stripRouteMarker(notes: string | null | undefined): string {
  if (!notes) return "";
  return notes.replace(ROUTE_MARKER_RE, "");
}

// ─── Combined helpers ───────────────────────────────────────────────────────

/** Strip all SC Labs markers, leaving only the user's free text. */
export function stripAllMarkers(notes: string | null | undefined): string {
  if (!notes) return "";
  return notes
    .replace(new RegExp(MINING_MARKER_RE.source, "g"), "")
    .replace(new RegExp(ROUTE_MARKER_RE.source, "g"), "")
    .replace(/^\n+/, "");
}

/**
 * Produce the notes string that should be persisted for a WO. Keeps any
 * present markers at the top (mining first, route second), user text below.
 * Pass `null` for a marker to explicitly clear it.
 */
export function composeNotesWithMarker(
  userNotes: string,
  mining: MiningMarker | null,
  route?: RouteMarker | null
): string {
  const clean = stripAllMarkers(userNotes);
  const parts: string[] = [];
  if (mining) parts.push(buildMiningMarker(mining));
  if (route) parts.push(buildRouteMarker(route));
  if (clean.length > 0) parts.push(clean);
  return parts.join("\n");
}

// ─── Route group id ─────────────────────────────────────────────────────────

/**
 * Lightweight unique id for a route group. Uses `crypto.randomUUID` in the
 * browser and a timestamp+random fallback for older runtimes.
 */
export function newRouteGroupId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
