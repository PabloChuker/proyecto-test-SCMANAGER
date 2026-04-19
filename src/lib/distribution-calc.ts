// =============================================================================
// SC LABS — Distribution calculator
//
// Calcula cuanto le toca a cada miembro de un stop cobrado, segun el
// split_mode elegido. Tres modos soportados en MVP:
//
//   - equitable   → reparto equitativo entre presentes (mining ∪ trade)
//   - manual_pct  → porcentajes ingresados por el usuario al cobrar
//   - role_weight → cada rol tiene un peso fijo; se normaliza al 100%
//
// (El modo 'scu_mined' se difiere a una fase posterior — requiere
// primary_miner_id en mining_inventory y UX de asignacion al cargar ore.)
//
// La funcion tambien deduplica miembros que aparecen en ambos sets
// (mining + trade) para que no cobren doble — se marcan con source='both'
// y se suma un solo payout.
// =============================================================================

export type SplitMode = "equitable" | "manual_pct" | "role_weight";

// -- Tipos de entrada -------------------------------------------------------

export interface MiningMemberInput {
  id: string;                 // mining_members.id
  userId: string | null;
  displayName: string;
  avatarUrl?: string | null;
  role: MiningRole;
}

export interface TradeParticipantInput {
  id: string;                 // trade_wo_participants.id
  userId: string | null;
  displayName: string;
  avatarUrl?: string | null;
  role: TradeRole;
  rolePct?: number;           // si ya venia cargado con % manual en el WO
  contributionUec?: number;   // se devuelve antes del split
}

export type MiningRole =
  | "miner"
  | "escort"
  | "pilot"
  | "logistics"
  | "refiner"
  | "scout"
  | "custom";

export type TradeRole =
  | "pilot"
  | "escort"
  | "scout"
  | "financier"
  | "mule"
  | "crew"
  | "other";

// -- Pesos por rol (role_weight mode) ---------------------------------------
//
// Valores arbitrarios pero calibrados contra lo que un org SC tipicamente
// paga. Todos suman al 100% despues de normalizar segun quienes esten
// presentes. Son editables via constantes — en una fase posterior podrian
// venir de una tabla `mining_role_weights` para configurar por party.

const MINING_ROLE_WEIGHTS: Record<MiningRole, number> = {
  miner: 1.0,
  escort: 0.9,
  pilot: 1.1,
  logistics: 0.8,
  refiner: 0.6,
  scout: 0.8,
  custom: 1.0,
};

const TRADE_ROLE_WEIGHTS: Record<TradeRole, number> = {
  pilot: 1.1,
  escort: 0.9,
  scout: 0.8,
  financier: 1.0,
  mule: 0.8,
  crew: 1.0,
  other: 1.0,
};

// -- Input principal --------------------------------------------------------

export interface CalculateSplitInput {
  /** Monto neto a repartir (gross - buy_cost - expenses). */
  netAuec: number;
  /** Modo de split a aplicar. */
  splitMode: SplitMode;
  /** Miembros del mining session (puede estar vacio si es compra-venta pura). */
  miningMembers: MiningMemberInput[];
  /** Participantes del WO/trade (puede estar vacio si el cobro lo hace solo). */
  tradeParticipants: TradeParticipantInput[];
  /**
   * Solo para split_mode='manual_pct'.
   * Mapa identityKey → pct (suma 100). identityKey se arma con
   * `buildIdentityKey()` sobre user_id o fallback a display_name.
   */
  manualShares?: Record<string, number>;
  /**
   * Hook para override de pesos (por party custom en el futuro).
   */
  roleWeightOverrides?: {
    mining?: Partial<Record<MiningRole, number>>;
    trade?: Partial<Record<TradeRole, number>>;
  };
}

// -- Salida -----------------------------------------------------------------

export interface PayoutRow {
  identityKey: string;
  userId: string | null;
  displayName: string;
  avatarUrl: string | null;
  source: "mining" | "trade" | "both";
  miningMemberId: string | null;
  tradeParticipantId: string | null;
  rolesLabel: string;               // "miner" o "miner + financier"
  weightValue: number | null;       // peso aplicado (solo role_weight)
  sharePct: number;                 // %
  pendingAuec: number;              // aUEC correspondiente
}

export interface CalculateSplitResult {
  mode: SplitMode;
  total: number;
  rows: PayoutRow[];
  warnings: string[];
}

// -- Helpers ----------------------------------------------------------------

/**
 * Clave canonica para deduplicar entre mining y trade. Si hay user_id lo
 * usamos (identidad solida); si no, caemos al display_name normalizado
 * (identidad ad-hoc de invitados / guests).
 */
export function buildIdentityKey(
  userId: string | null | undefined,
  displayName: string,
): string {
  if (userId && userId.length > 0) return `u:${userId}`;
  return `n:${displayName.trim().toLowerCase()}`;
}

interface Unified {
  key: string;
  userId: string | null;
  displayName: string;
  avatarUrl: string | null;
  mining?: MiningMemberInput;
  trade?: TradeParticipantInput;
}

function unifyMembers(
  mining: MiningMemberInput[],
  trade: TradeParticipantInput[],
): Unified[] {
  const byKey = new Map<string, Unified>();

  for (const m of mining) {
    const key = buildIdentityKey(m.userId, m.displayName);
    byKey.set(key, {
      key,
      userId: m.userId,
      displayName: m.displayName,
      avatarUrl: m.avatarUrl ?? null,
      mining: m,
    });
  }

  for (const t of trade) {
    const key = buildIdentityKey(t.userId, t.displayName);
    const existing = byKey.get(key);
    if (existing) {
      existing.trade = t;
      // Prefer avatar del trade si no habia en mining
      if (!existing.avatarUrl && t.avatarUrl) existing.avatarUrl = t.avatarUrl;
    } else {
      byKey.set(key, {
        key,
        userId: t.userId,
        displayName: t.displayName,
        avatarUrl: t.avatarUrl ?? null,
        trade: t,
      });
    }
  }

  return [...byKey.values()];
}

function rolesLabel(u: Unified): string {
  const parts: string[] = [];
  if (u.mining) parts.push(u.mining.role);
  if (u.trade) parts.push(u.trade.role);
  return parts.join(" + ") || "—";
}

function sourceOf(u: Unified): "mining" | "trade" | "both" {
  if (u.mining && u.trade) return "both";
  if (u.mining) return "mining";
  return "trade";
}

// -- Modos ------------------------------------------------------------------

function splitEquitable(
  unified: Unified[],
  netAuec: number,
): PayoutRow[] {
  const n = unified.length;
  if (n === 0) return [];
  const pct = 100 / n;
  const per = netAuec / n;
  return unified.map((u) => ({
    identityKey: u.key,
    userId: u.userId,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    source: sourceOf(u),
    miningMemberId: u.mining?.id ?? null,
    tradeParticipantId: u.trade?.id ?? null,
    rolesLabel: rolesLabel(u),
    weightValue: null,
    sharePct: roundPct(pct),
    pendingAuec: roundAuec(per),
  }));
}

function splitManualPct(
  unified: Unified[],
  netAuec: number,
  manualShares: Record<string, number>,
  warnings: string[],
): PayoutRow[] {
  // Normalizar: si el usuario ingreso pcts que no suman 100 avisamos
  // (no fallar — redondeamos y escalamos al 100 para no perder plata)
  let totalPct = 0;
  for (const u of unified) {
    totalPct += manualShares[u.key] ?? 0;
  }
  if (Math.abs(totalPct - 100) > 0.01) {
    warnings.push(
      `Los porcentajes manuales suman ${totalPct.toFixed(2)}% (se reescalan al 100%).`,
    );
  }
  if (totalPct <= 0) {
    warnings.push("Sin porcentajes manuales, aplicando equitable como fallback.");
    return splitEquitable(unified, netAuec);
  }
  const scale = 100 / totalPct;

  return unified.map((u) => {
    const raw = manualShares[u.key] ?? 0;
    const pct = raw * scale;
    return {
      identityKey: u.key,
      userId: u.userId,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      source: sourceOf(u),
      miningMemberId: u.mining?.id ?? null,
      tradeParticipantId: u.trade?.id ?? null,
      rolesLabel: rolesLabel(u),
      weightValue: null,
      sharePct: roundPct(pct),
      pendingAuec: roundAuec(netAuec * (pct / 100)),
    };
  });
}

function splitRoleWeight(
  unified: Unified[],
  netAuec: number,
  overrides: CalculateSplitInput["roleWeightOverrides"],
): PayoutRow[] {
  const miningW = { ...MINING_ROLE_WEIGHTS, ...(overrides?.mining ?? {}) };
  const tradeW = { ...TRADE_ROLE_WEIGHTS, ...(overrides?.trade ?? {}) };

  // Cada persona suma su peso de mining (si aplica) + peso de trade (si aplica).
  // Asi si alguien hace doble rol (minero y piloto en el viaje) cobra mas.
  const weights = unified.map((u) => {
    let w = 0;
    if (u.mining) w += miningW[u.mining.role] ?? 1.0;
    if (u.trade) w += tradeW[u.trade.role] ?? 1.0;
    return w;
  });
  const totalW = weights.reduce((a, b) => a + b, 0);
  if (totalW <= 0) return splitEquitable(unified, netAuec);

  return unified.map((u, i) => {
    const w = weights[i];
    const pct = (w / totalW) * 100;
    return {
      identityKey: u.key,
      userId: u.userId,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      source: sourceOf(u),
      miningMemberId: u.mining?.id ?? null,
      tradeParticipantId: u.trade?.id ?? null,
      rolesLabel: rolesLabel(u),
      weightValue: roundWeight(w),
      sharePct: roundPct(pct),
      pendingAuec: roundAuec(netAuec * (pct / 100)),
    };
  });
}

// -- Redondeo ---------------------------------------------------------------
//
// aUEC con 2 decimales (mismo precision que el resto del schema).
// Reajustamos el ultimo para absorber el residuo de redondeo — asi la
// suma de payouts es exactamente netAuec.

function roundAuec(n: number): number {
  return Math.round(n * 100) / 100;
}
function roundPct(n: number): number {
  return Math.round(n * 10000) / 10000;
}
function roundWeight(n: number): number {
  return Math.round(n * 100) / 100;
}

function reconcileResidue(rows: PayoutRow[], target: number): PayoutRow[] {
  if (rows.length === 0) return rows;
  const sum = rows.reduce((acc, r) => acc + r.pendingAuec, 0);
  const diff = roundAuec(target - sum);
  if (Math.abs(diff) < 0.01) return rows;
  const last = rows[rows.length - 1];
  last.pendingAuec = roundAuec(last.pendingAuec + diff);
  return rows;
}

// -- Entrada principal ------------------------------------------------------

export function calculateSplit(input: CalculateSplitInput): CalculateSplitResult {
  const warnings: string[] = [];
  const unified = unifyMembers(input.miningMembers, input.tradeParticipants);

  if (unified.length === 0) {
    return {
      mode: input.splitMode,
      total: input.netAuec,
      rows: [],
      warnings: ["No hay miembros de mining ni participantes de trade — nada para repartir."],
    };
  }

  if (input.netAuec <= 0) {
    warnings.push(`Neto = ${input.netAuec} aUEC. Los payouts quedan en 0.`);
  }

  let rows: PayoutRow[];
  switch (input.splitMode) {
    case "equitable":
      rows = splitEquitable(unified, input.netAuec);
      break;
    case "manual_pct":
      rows = splitManualPct(
        unified,
        input.netAuec,
        input.manualShares ?? {},
        warnings,
      );
      break;
    case "role_weight":
      rows = splitRoleWeight(unified, input.netAuec, input.roleWeightOverrides);
      break;
    default: {
      warnings.push(`split_mode '${input.splitMode}' no soportado — fallback a equitable.`);
      rows = splitEquitable(unified, input.netAuec);
    }
  }

  rows = reconcileResidue(rows, input.netAuec);

  return {
    mode: input.splitMode,
    total: input.netAuec,
    rows,
    warnings,
  };
}

// -- Exports auxiliares (para tests / UI de preview) ------------------------

export const _internals = {
  MINING_ROLE_WEIGHTS,
  TRADE_ROLE_WEIGHTS,
  unifyMembers,
  splitEquitable,
  splitManualPct,
  splitRoleWeight,
};
