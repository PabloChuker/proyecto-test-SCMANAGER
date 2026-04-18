// =============================================================================
// SC LABS — Mining ↔ Trade bridge helpers
//
// Fase A of the Inventory → Route → Sale → P&L tree. We don't have a dedicated
// `trade_work_orders.source_mining_*` column yet (that's Fase C), so for now
// we encode the link as a marker in the free-form `notes` field:
//
//   [mining:SESSION_ID:MINERAL_ID:MINERAL_NAME]
//   <user's own notes, if any>
//
// This file provides the read/write helpers so we stay consistent across the
// Calculator (writer), the Dashboard (completion-side reader that triggers the
// auto-discount), and any future P&L aggregator that wants to filter trade
// WOs by mining session.
// =============================================================================

export interface MiningMarker {
  sessionId: string;
  mineralId: string;
  mineralName: string;
}

// Anchored at the start of line so we never confuse a marker embedded in the
// user's notes (defense in depth — the Calculator never moves the marker away
// from the top, but better to be strict in case someone edits it by hand).
const MARKER_RE = /^\[mining:([^:\]]+):([^:\]]+):([^\]]*)\]\s*/;

/** Serialize a marker for prepending to `trade_work_orders.notes`. */
export function buildMiningMarker(m: MiningMarker): string {
  return `[mining:${m.sessionId}:${m.mineralId}:${m.mineralName}]`;
}

/** Extract the marker (if any) from a notes string. */
export function parseMiningMarker(
  notes: string | null | undefined
): MiningMarker | null {
  if (!notes) return null;
  const match = notes.match(MARKER_RE);
  if (!match) return null;
  return {
    sessionId: match[1],
    mineralId: match[2],
    mineralName: match[3] || match[2],
  };
}

/** Remove the marker from notes, leaving only the user-visible remainder. */
export function stripMiningMarker(notes: string | null | undefined): string {
  if (!notes) return "";
  return notes.replace(MARKER_RE, "");
}

/**
 * Produce the notes string that should be persisted for a WO that is sourced
 * from mining inventory. Keeps the marker at the top, user text below.
 * If `marker` is null, returns the user's notes unchanged.
 */
export function composeNotesWithMarker(
  userNotes: string,
  marker: MiningMarker | null
): string {
  const clean = stripMiningMarker(userNotes);
  if (!marker) return clean;
  return clean.length > 0
    ? `${buildMiningMarker(marker)}\n${clean}`
    : buildMiningMarker(marker);
}
