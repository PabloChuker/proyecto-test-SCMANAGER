// =============================================================================
// AL FILO — CCU Chain Engine v1
//
// Core pathfinding algorithm for finding the cheapest CCU upgrade chain
// between two ships. Uses a modified Dijkstra's algorithm where:
//   - Nodes = ships (by ID)
//   - Edges = available CCU upgrades (standard or warbond)
//   - Edge weight = CCU price (or $0 if user already owns it)
//
// The engine considers:
//   1. Standard CCU prices (target_msrp - source_msrp)
//   2. Warbond CCU prices (discounted, when available)
//   3. User-owned CCUs (cost = $0, highest priority)
//   4. Ship eligibility (some ships can't receive CCU upgrades)
// =============================================================================

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CCUEdge {
  fromShipId: string;
  toShipId: string;
  standardPrice: number;
  warbondPrice: number | null;
  isWarbondAvailable: boolean;
  isOwned: boolean;        // User already has this CCU in hangar/buyback
  ownedLocation: "hangar" | "buyback" | null; // Where the owned CCU lives
  ownedPricePaid: number;  // Original price paid for this CCU (for display)
  isLimited: boolean;      // Limited availability CCU
}

export interface ShipNode {
  id: string;
  reference: string;
  name: string;
  manufacturer: string | null;
  msrpUsd: number;
  warbondUsd: number | null;
  isCcuEligible: boolean;
  isLimited: boolean;
  flightStatus: string;
  /**
   * CCU.6 (2026-05-03): pledge_availability del Wiki.
   * Valores típicos: 'Always available' | 'Time-limited sales' |
   * 'Quantity-limited sales' | 'Limited edition*' | 'Out of production' |
   * 'Reward - Not available for sale' | 'Not available for sale' | null
   * Lo categorizamos en la UI con `categorizeAvailability()`.
   */
  pledgeAvailability: string | null;
}

export type PriceType =
  | "hangar"           // Already in hangar — $0 additional, already paid
  | "buyback-token"    // In buyback, user has token — costs credits (not cash)
  | "buyback-cash"     // In buyback, no token — must pay cash
  | "warbond"          // New purchase at warbond price (cash)
  | "standard";        // New purchase at standard price (cash)

export interface ChainStep {
  fromShip: ShipNode;
  toShip: ShipNode;
  standardPrice: number;
  warbondPrice: number | null;
  effectivePrice: number;    // The price actually paid (considering warbond/owned)
  priceType: PriceType;
  pricePaid: number;         // Original price paid (for hangar/buyback items)
  paymentMethod: "cash" | "credits" | "none"; // How this step is paid
  savingsVsStandard: number; // How much saved vs standard price
  cumulativeCost: number;    // Running total up to this step
  cumulativeSavings: number; // Running savings total
  targetMsrp: number;        // MSRP of the target ship at this step (store value)
  acquiredCost: number;      // Total real cost to have this ship via chain (baseShipCost + cumulativeCCUs)
  savingsVsMsrp: number;     // targetMsrp - acquiredCost (how much you save vs buying outright)
  /**
   * CCU.6 (2026-05-03): availability del TARGET de este step (toShip).
   * Sale de ship_prices_canonical.pledge_availability. La UI lo categoriza
   * para mostrar badge ✓ / 🕒 / 🚫 y avisar al user si la cadena requiere
   * esperar a un evento o si tiene steps no-comprables hoy.
   */
  targetAvailability: string | null;
}

export interface CostBreakdown {
  cashTotal: number;        // Total real money needed (warbond + standard + buyback-cash)
  creditsTotal: number;     // Total store credits needed (buyback-token)
  hangarValue: number;      // Value of CCUs already in hangar (already paid, $0 additional)
  hangarCount: number;
  buybackTokenCount: number;
  buybackCashCount: number;
  warbondCount: number;
  standardCount: number;
}

export interface ChainResult {
  steps: ChainStep[];
  totalCost: number;
  totalSavingsVsDirect: number;  // Savings vs buying target directly
  directUpgradeCost: number;     // Cost of single CCU from start → target
  costBreakdown: CostBreakdown;  // Desglose: efectivo / créditos / hangar
  startShip: ShipNode;
  targetShip: ShipNode;
  stepsCount: number;
  ownedStepsCount: number;
  warbondStepsCount: number;
}

export type PaymentPriority =
  | "balanced"         // Default: slight preference for credits over cash
  | "prefer-cash"      // Minimize credit usage, prefer buying with cash
  | "prefer-credits";  // Maximize credit usage, prefer buyback-token over new purchases

export interface CalculateOptions {
  preferWarbond: boolean;       // Prefer warbond prices when available
  includeOwned: boolean;        // Include user's owned CCUs
  hasBuybackToken: boolean;     // User has a buyback token available
  paymentPriority: PaymentPriority; // Cash vs credits priority
  maxSteps: number;             // Maximum chain length (default 15)
  excludeShipIds: string[];     // Ships to avoid in this specific chain calc
  onlyAvailable: boolean;       // Only use currently available CCUs
  /**
   * CCU.2 (2026-05-03): IDs de ships globalmente bloqueados por el user
   * (Forzar Exclusión, persistido en localStorage via ccuChainPolicy).
   * Se mergean con `excludeShipIds` al construir el adjacency. La diferencia
   * semántica es de scope: excludeShipIds es per-cadena (lo manda el caller
   * para una corrida), forceExcludeShipIds es preferencia global del user.
   */
  forceExcludeShipIds: string[];
  /**
   * CCU.3 (2026-05-03): waypoints obligatorios (Forzar Inclusión). Si la lista
   * está vacía se usa el solver normal. Si tiene IDs, `findCheapestChainWithWaypoints`
   * concatena sub-Dijkstras start→w1→w2→…→wn→target. Los waypoints se ordenan
   * automáticamente por msrpUsd ascendente (CCUs solo van hacia arriba).
   * Si algún waypoint está fuera del rango [start.msrp, target.msrp] o no
   * tiene path, devuelve null.
   */
  forceIncludeShipIds: string[];
}

const DEFAULT_OPTIONS: CalculateOptions = {
  preferWarbond: true,
  includeOwned: true,
  hasBuybackToken: false,
  paymentPriority: "balanced",
  maxSteps: 15,
  excludeShipIds: [],
  onlyAvailable: true,
  forceExcludeShipIds: [],
  forceIncludeShipIds: [],
};

// ─── Priority Queue (Min-Heap) ──────────────────────────────────────────────

interface HeapEntry {
  shipId: string;
  cost: number;
  steps: number;
}

class MinHeap {
  private heap: HeapEntry[] = [];

  push(entry: HeapEntry): void {
    this.heap.push(entry);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): HeapEntry | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  get size(): number {
    return this.heap.length;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.heap[parent].cost <= this.heap[i].cost) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
      i = parent;
    }
  }

  private sinkDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.heap[left].cost < this.heap[smallest].cost) smallest = left;
      if (right < n && this.heap[right].cost < this.heap[smallest].cost) smallest = right;
      if (smallest === i) break;
      [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
      i = smallest;
    }
  }
}

// ─── Pathfinding Algorithm ──────────────────────────────────────────────────

/**
 * Find the cheapest CCU chain between two ships using modified Dijkstra's.
 *
 * @param startShipId - UUID of the starting ship
 * @param targetShipId - UUID of the target ship
 * @param ships - Map of all ships (id → ShipNode)
 * @param edges - All available CCU edges
 * @param options - Calculation preferences
 * @returns ChainResult with optimal path, or null if no path exists
 */
export function findCheapestChain(
  startShipId: string,
  targetShipId: string,
  ships: Map<string, ShipNode>,
  edges: CCUEdge[],
  options: Partial<CalculateOptions> = {},
): ChainResult | null {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startShip = ships.get(startShipId);
  const targetShip = ships.get(targetShipId);

  if (!startShip || !targetShip) return null;
  if (startShipId === targetShipId) return null;
  if (startShip.msrpUsd >= targetShip.msrpUsd) return null; // Can only upgrade UP

  // Build adjacency list: fromShipId → [edges]
  const adjacency = new Map<string, CCUEdge[]>();
  // CCU.2 (2026-05-03): mergeamos exclusiones per-cadena (excludeShipIds) con
  // las globales del user (forceExcludeShipIds, persistidas en localStorage).
  // Cualquier ship en cualquiera de las dos listas queda fuera del grafo.
  // Importante: NO excluimos start/target aunque estén en la lista — el solver
  // los necesita para arrancar/llegar; si el user los puso ahí es decisión
  // suya y la UI debería avisarle (ver validación en CCUChainCalculator).
  const excludeSet = new Set<string>([
    ...opts.excludeShipIds,
    ...(opts.forceExcludeShipIds ?? []),
  ]);
  excludeSet.delete(startShipId);
  excludeSet.delete(targetShipId);

  for (const edge of edges) {
    if (excludeSet.has(edge.fromShipId) || excludeSet.has(edge.toShipId)) continue;

    // FIX 2026-04-26: cuando el usuario pide "Armarla Ya" (onlyAvailable=true),
    // descartamos CCUs limited/event-only que NO sean del inventario propio del
    // user — esas son las que no están a la venta hoy. Las CCUs standard del
    // catálogo siempre se consideran disponibles (CIG las vende continuamente).
    // Antes este bloque tenía el comentario pero faltaba el `continue;` y por
    // eso el flag "Armarla Ya" no filtraba nada.
    if (opts.onlyAvailable && !edge.isOwned && edge.isLimited) continue;

    const toShip = ships.get(edge.toShipId);
    // FIX 2026-04-26: respetar edges owned aunque la nave destino tenga
    // isCcuEligible=false. Si el user ya compró la CCU hacia esa nave,
    // sigue siendo válida (CIG no le quita el CCU al usuario aunque la
    // nave salga del catálogo de CCUs continuos).
    if (toShip && !toShip.isCcuEligible && edge.toShipId !== targetShipId && !edge.isOwned) continue;

    if (!adjacency.has(edge.fromShipId)) {
      adjacency.set(edge.fromShipId, []);
    }
    adjacency.get(edge.fromShipId)!.push(edge);
  }

  // Dijkstra's algorithm
  const dist = new Map<string, number>();    // shipId → minimum cost to reach
  const prev = new Map<string, { edge: CCUEdge; priceType: PriceType }>();
  const stepCount = new Map<string, number>();
  // FIX 2026-04-26 (#44): tie-breaker por uso de inventario propio. Cuando dos
  // paths empatan en costo total, queremos preferir el que use MÁS items owned
  // (hangar/buyback) para reducir cash out-of-pocket. Si todavía empatan, el
  // que tenga MENOS pasos (menos fricción operativa).
  const ownedCountAt = new Map<string, number>(); // shipId → owned items en best path
  const visited = new Set<string>();

  dist.set(startShipId, 0);
  stepCount.set(startShipId, 0);
  ownedCountAt.set(startShipId, 0);

  const heap = new MinHeap();
  heap.push({ shipId: startShipId, cost: 0, steps: 0 });

  while (heap.size > 0) {
    const current = heap.pop()!;
    if (visited.has(current.shipId)) continue;
    visited.add(current.shipId);

    // Found target — reconstruct path
    if (current.shipId === targetShipId) {
      return reconstructPath(startShipId, targetShipId, prev, ships, opts);
    }

    // Check step limit
    if (current.steps >= opts.maxSteps) continue;

    const neighbors = adjacency.get(current.shipId) || [];
    for (const edge of neighbors) {
      if (visited.has(edge.toShipId)) continue;

      // Calculate effective price for this edge
      const effectivePrice = getEffectivePrice(edge, opts);
      const newCost = current.cost + effectivePrice;
      const newSteps = current.steps + 1;

      const isOwnedStep =
        opts.includeOwned && edge.isOwned &&
        (edge.ownedLocation === "hangar" || edge.ownedLocation === "buyback");
      const newOwnedCount = (ownedCountAt.get(current.shipId) ?? 0) + (isOwnedStep ? 1 : 0);

      const currentBest = dist.get(edge.toShipId) ?? Infinity;
      const currentOwned = ownedCountAt.get(edge.toShipId) ?? -1;
      const currentSteps = stepCount.get(edge.toShipId) ?? Infinity;

      // Update si: (a) costo estrictamente menor, o (b) costo igual + más
      // owned items, o (c) costo y owned iguales + menos pasos.
      const isStrictlyCheaper = newCost < currentBest;
      const isTiedButMoreOwned = newCost === currentBest && newOwnedCount > currentOwned;
      const isTiedAndShorter =
        newCost === currentBest && newOwnedCount === currentOwned && newSteps < currentSteps;

      if (isStrictlyCheaper || isTiedButMoreOwned || isTiedAndShorter) {
        dist.set(edge.toShipId, newCost);
        stepCount.set(edge.toShipId, newSteps);
        ownedCountAt.set(edge.toShipId, newOwnedCount);
        prev.set(edge.toShipId, {
          edge,
          priceType: determinePriceType(edge, opts),
        });
        heap.push({ shipId: edge.toShipId, cost: newCost, steps: newSteps });
      }
    }
  }

  // No path found
  return null;
}

/**
 * Determine the price type for a CCU edge based on ownership and options.
 */
function determinePriceType(edge: CCUEdge, opts: CalculateOptions): PriceType {
  if (opts.includeOwned && edge.isOwned) {
    if (edge.ownedLocation === "hangar") return "hangar";
    if (edge.ownedLocation === "buyback") {
      return opts.hasBuybackToken ? "buyback-token" : "buyback-cash";
    }
    return "hangar"; // fallback
  }
  if (opts.preferWarbond && edge.warbondPrice != null && edge.isWarbondAvailable) {
    return "warbond";
  }
  return "standard";
}

/**
 * Get the effective price for a CCU edge based on options.
 *
 * - Hangar: $0 additional cost (already owned and in hand)
 * - Buyback + token: reclaim with store credits at standardPrice
 * - Buyback - no token: reclaim with real cash at standardPrice
 * - Warbond: discounted cash price for new purchase
 * - Standard: full cash price for new purchase
 *
 * IMPORTANT: Buyback always costs the standardPrice of the CCU to reclaim,
 * regardless of what the user originally paid. RSI charges full price on buyback.
 * The difference is payment method: with token → credits, without → cash.
 *
 * Payment Priority affects Dijkstra edge weights (NOT display prices):
 * - "balanced": slight 5% preference for credits over cash
 * - "prefer-cash": credits cost 1.15x in Dijkstra (discourage credits)
 * - "prefer-credits": credits cost 0.80x in Dijkstra (strongly prefer credits),
 *                     cash edges (warbond/standard) cost 1.10x (discourage cash)
 */
function getEffectivePrice(edge: CCUEdge, opts: CalculateOptions): number {
  if (opts.includeOwned && edge.isOwned) {
    if (edge.ownedLocation === "hangar") return 0; // Already have it

    if (edge.ownedLocation === "buyback") {
      // Buyback costs the standard CCU price to reclaim.
      if (opts.hasBuybackToken) {
        // With token → paid in credits. Apply priority factor.
        // FIX 2026-04-26 (#45): bumped balanced 0.95 → 0.90 (10% off) para
        // que el algoritmo realmente prefiera usar el token cuando lo tiene.
        // Antes el incentivo de 5% era muy débil — en cadenas largas se
        // perdía contra cash standard por márgenes chicos.
        const creditFactor =
          opts.paymentPriority === "prefer-credits" ? 0.80 :
          opts.paymentPriority === "prefer-cash" ? 1.15 :
          0.90; // balanced
        return edge.standardPrice * creditFactor;
      }
      // Without token → paid in cash. Apply cash factor.
      // FIX 2026-04-26 (#45): bumped balanced 1.0 → 1.02 (2% penalty) — usar
      // un slot de buyback sin token gasta un recurso limitado del usuario
      // y conviene que el algoritmo prefiera comprar standard nuevo cuando
      // los precios son parejos. Sigue siendo más barato que con prefer-credits.
      const cashFactor =
        opts.paymentPriority === "prefer-credits" ? 1.10 :
        opts.paymentPriority === "prefer-cash" ? 1.0 :
        1.02; // balanced
      return edge.standardPrice * cashFactor;
    }
    return 0; // fallback for legacy
  }

  // Cash purchases (warbond / standard): apply cash penalty when preferring credits
  const cashFactor =
    opts.paymentPriority === "prefer-credits" ? 1.10 : 1.0;

  // Prefer warbond if available and cheaper
  if (opts.preferWarbond && edge.warbondPrice != null && edge.isWarbondAvailable) {
    return edge.warbondPrice * cashFactor;
  }

  return edge.standardPrice * cashFactor;
}

/**
 * Reconstruct the optimal path from Dijkstra results.
 */
function reconstructPath(
  startShipId: string,
  targetShipId: string,
  prev: Map<string, { edge: CCUEdge; priceType: PriceType }>,
  ships: Map<string, ShipNode>,
  opts: CalculateOptions,
): ChainResult | null {
  const steps: ChainStep[] = [];
  let current = targetShipId;

  // Walk backward from target to start
  while (current !== startShipId) {
    const entry = prev.get(current);
    if (!entry) return null; // Broken path

    const fromShip = ships.get(entry.edge.fromShipId);
    const toShip = ships.get(entry.edge.toShipId);
    if (!fromShip || !toShip) return null;

    // Calculate the DISPLAY price (without Dijkstra preference factor)
    let effectivePrice: number;
    if (entry.priceType === "hangar") {
      effectivePrice = 0;
    } else if (entry.priceType === "buyback-token" || entry.priceType === "buyback-cash") {
      // Buyback always costs the standard price to reclaim
      effectivePrice = entry.edge.standardPrice;
    } else if (entry.priceType === "warbond") {
      effectivePrice = entry.edge.warbondPrice ?? entry.edge.standardPrice;
    } else {
      effectivePrice = entry.edge.standardPrice;
    }

    // Determine payment method
    let paymentMethod: "cash" | "credits" | "none" = "cash";
    if (entry.priceType === "hangar") paymentMethod = "none";
    else if (entry.priceType === "buyback-token") paymentMethod = "credits";
    else paymentMethod = "cash"; // buyback-cash, warbond, standard

    steps.unshift({
      fromShip,
      toShip,
      standardPrice: entry.edge.standardPrice,
      warbondPrice: entry.edge.warbondPrice,
      effectivePrice,
      priceType: entry.priceType,
      pricePaid: entry.edge.ownedPricePaid || 0,
      paymentMethod,
      savingsVsStandard: entry.edge.standardPrice - effectivePrice,
      cumulativeCost: 0,     // Will be calculated below
      cumulativeSavings: 0,  // Will be calculated below
      targetMsrp: toShip.msrpUsd,
      acquiredCost: 0,       // Will be calculated below
      savingsVsMsrp: 0,      // Will be calculated below
      targetAvailability: toShip.pledgeAvailability ?? null,
    });

    current = entry.edge.fromShipId;
  }

  const startShip = ships.get(startShipId)!;

  // Calculate cumulative totals + acquired cost at each step
  // acquiredCost = startShip.msrpUsd + sum of all CCU effective prices up to here
  // This represents: "if I stopped here, how much did this ship cost me total?"
  let runningCost = 0;
  let runningSavings = 0;
  for (const step of steps) {
    runningCost += step.effectivePrice;
    runningSavings += step.savingsVsStandard;
    step.cumulativeCost = runningCost;
    step.cumulativeSavings = runningSavings;
    step.acquiredCost = startShip.msrpUsd + runningCost;
    step.savingsVsMsrp = step.targetMsrp - step.acquiredCost;
  }

  const targetShip = ships.get(targetShipId)!;
  const directUpgradeCost = targetShip.msrpUsd - startShip.msrpUsd;

  // Build cost breakdown
  const costBreakdown: CostBreakdown = {
    cashTotal: 0,
    creditsTotal: 0,
    hangarValue: 0,
    hangarCount: 0,
    buybackTokenCount: 0,
    buybackCashCount: 0,
    warbondCount: 0,
    standardCount: 0,
  };

  for (const step of steps) {
    switch (step.priceType) {
      case "hangar":
        costBreakdown.hangarValue += step.pricePaid;
        costBreakdown.hangarCount++;
        break;
      case "buyback-token":
        costBreakdown.creditsTotal += step.effectivePrice;
        costBreakdown.buybackTokenCount++;
        break;
      case "buyback-cash":
        costBreakdown.cashTotal += step.effectivePrice;
        costBreakdown.buybackCashCount++;
        break;
      case "warbond":
        costBreakdown.cashTotal += step.effectivePrice;
        costBreakdown.warbondCount++;
        break;
      case "standard":
        costBreakdown.cashTotal += step.effectivePrice;
        costBreakdown.standardCount++;
        break;
    }
  }

  return {
    steps,
    totalCost: runningCost,
    totalSavingsVsDirect: directUpgradeCost - runningCost,
    directUpgradeCost,
    costBreakdown,
    startShip,
    targetShip,
    stepsCount: steps.length,
    ownedStepsCount: steps.filter(s => s.priceType === "hangar" || s.priceType === "buyback-token" || s.priceType === "buyback-cash").length,
    warbondStepsCount: steps.filter(s => s.priceType === "warbond").length,
  };
}

// ─── Waypoints (Forzar Inclusión) ───────────────────────────────────────────

/**
 * Variante de findCheapestChain que respeta una lista de waypoints obligatorios.
 *
 * La cadena devuelta DEBE pasar por todos los ships en `options.forceIncludeShipIds`.
 * Algoritmo: ordena los waypoints por MSRP ascendente y ejecuta N+1 sub-Dijkstras
 * encadenados (start→w1, w1→w2, ..., wn→target). Concatena los steps y suma los
 * cost breakdowns parciales.
 *
 * Devuelve null si:
 *   · Algún waypoint no existe en el catálogo `ships`
 *   · Algún waypoint está fuera del rango (start.msrp, target.msrp) — CCUs solo
 *     suben en MSRP
 *   · Algún sub-tramo no tiene path con las opciones dadas
 *
 * IMPORTANTE: en las sub-llamadas se setea `forceIncludeShipIds: []` para evitar
 * recursión infinita. La validación detallada (mensajes amigables al user) es
 * responsabilidad del caller — esta función solo devuelve null sin distinguir
 * la causa.
 *
 * Si la lista de waypoints está vacía, delega directo a `findCheapestChain` sin
 * overhead extra.
 */
export function findCheapestChainWithWaypoints(
  startShipId: string,
  targetShipId: string,
  ships: Map<string, ShipNode>,
  edges: CCUEdge[],
  options: Partial<CalculateOptions> = {},
): ChainResult | null {
  const waypoints = options.forceIncludeShipIds ?? [];
  if (waypoints.length === 0) {
    return findCheapestChain(startShipId, targetShipId, ships, edges, options);
  }

  const startShip = ships.get(startShipId);
  const targetShip = ships.get(targetShipId);
  if (!startShip || !targetShip) return null;

  // Resolver waypoints: dedupe + filtrar redundantes (==start || ==target).
  const waypointSet = new Set(waypoints);
  waypointSet.delete(startShipId);
  waypointSet.delete(targetShipId);
  const waypointShips: ShipNode[] = [];
  for (const wId of waypointSet) {
    const ws = ships.get(wId);
    if (!ws) return null; // waypoint inexistente → fail
    waypointShips.push(ws);
  }
  if (waypointShips.length === 0) {
    // Todos los waypoints eran == start/target — equivale a sin waypoints.
    return findCheapestChain(startShipId, targetShipId, ships, edges, options);
  }
  // Ordenar ascendente por MSRP (CCUs solo suben).
  waypointShips.sort((a, b) => a.msrpUsd - b.msrpUsd);

  // Validar monotonicidad estricta start < w1 < w2 < ... < wn < target.
  if (waypointShips[0].msrpUsd <= startShip.msrpUsd) return null;
  if (waypointShips[waypointShips.length - 1].msrpUsd >= targetShip.msrpUsd) return null;
  for (let i = 1; i < waypointShips.length; i++) {
    if (waypointShips[i].msrpUsd <= waypointShips[i - 1].msrpUsd) return null;
  }

  // Ruta completa: [start, w0, w1, ..., wn, target].
  const route: ShipNode[] = [startShip, ...waypointShips, targetShip];

  // Sub-llamadas SIN waypoints para evitar recursión infinita.
  const subOptions: Partial<CalculateOptions> = {
    ...options,
    forceIncludeShipIds: [],
  };

  const allSteps: ChainStep[] = [];
  let cumulativeCost = 0;
  let cumulativeSavings = 0;
  const breakdown: CostBreakdown = {
    cashTotal: 0,
    creditsTotal: 0,
    hangarValue: 0,
    hangarCount: 0,
    buybackTokenCount: 0,
    buybackCashCount: 0,
    warbondCount: 0,
    standardCount: 0,
  };
  let ownedStepsCount = 0;
  let warbondStepsCount = 0;

  for (let i = 0; i < route.length - 1; i++) {
    const segment = findCheapestChain(route[i].id, route[i + 1].id, ships, edges, subOptions);
    if (!segment) return null; // tramo sin path → toda la cadena falla

    // Re-anclar cumulativeCost / cumulativeSavings / acquiredCost al global,
    // porque cada sub-Dijkstra los calcula desde 0 con su propio start.
    for (const step of segment.steps) {
      cumulativeCost += step.effectivePrice;
      cumulativeSavings += step.savingsVsStandard;
      const adjusted: ChainStep = {
        ...step,
        cumulativeCost,
        cumulativeSavings,
        acquiredCost: startShip.msrpUsd + cumulativeCost,
        savingsVsMsrp: step.targetMsrp - (startShip.msrpUsd + cumulativeCost),
      };
      allSteps.push(adjusted);
    }

    breakdown.cashTotal         += segment.costBreakdown.cashTotal;
    breakdown.creditsTotal      += segment.costBreakdown.creditsTotal;
    breakdown.hangarValue       += segment.costBreakdown.hangarValue;
    breakdown.hangarCount       += segment.costBreakdown.hangarCount;
    breakdown.buybackTokenCount += segment.costBreakdown.buybackTokenCount;
    breakdown.buybackCashCount  += segment.costBreakdown.buybackCashCount;
    breakdown.warbondCount      += segment.costBreakdown.warbondCount;
    breakdown.standardCount     += segment.costBreakdown.standardCount;
    ownedStepsCount   += segment.ownedStepsCount;
    warbondStepsCount += segment.warbondStepsCount;
  }

  // directUpgradeCost: el costo SI hubiera un CCU directo start→target sin
  // waypoints. Lo aproximamos con un cheapest-chain sin restricciones.
  const directChain = findCheapestChain(startShipId, targetShipId, ships, edges, {
    ...options,
    forceIncludeShipIds: [],
  });
  const directUpgradeCost = directChain?.totalCost ?? (targetShip.msrpUsd - startShip.msrpUsd);

  return {
    steps: allSteps,
    totalCost: cumulativeCost,
    totalSavingsVsDirect: directUpgradeCost - cumulativeCost,
    directUpgradeCost,
    costBreakdown: breakdown,
    startShip,
    targetShip,
    stepsCount: allSteps.length,
    ownedStepsCount,
    warbondStepsCount,
  };
}

// ─── Alternative Paths ──────────────────────────────────────────────────────

/**
 * Find multiple alternative chains (not just the cheapest).
 * Uses k-shortest paths approach: finds cheapest, removes its key edges,
 * then finds next cheapest, etc.
 */
export function findAlternativeChains(
  startShipId: string,
  targetShipId: string,
  ships: Map<string, ShipNode>,
  edges: CCUEdge[],
  options: Partial<CalculateOptions> = {},
  maxAlternatives: number = 3,
): ChainResult[] {
  const results: ChainResult[] = [];
  const excludedPairs = new Set<string>();

  for (let i = 0; i < maxAlternatives; i++) {
    // Filter out edges we've already used as "key" edges
    const filteredEdges = edges.filter(e => {
      const key = `${e.fromShipId}->${e.toShipId}`;
      return !excludedPairs.has(key);
    });

    const chain = findCheapestChain(startShipId, targetShipId, ships, filteredEdges, options);
    if (!chain) break;

    results.push(chain);

    // Exclude the "most important" edge from this chain for next iteration
    // (the one with the biggest savings contribution)
    if (chain.steps.length > 0) {
      const keyStep = chain.steps.reduce((best, s) =>
        s.savingsVsStandard > best.savingsVsStandard ? s : best
      );
      excludedPairs.add(`${keyStep.fromShip.id}->${keyStep.toShip.id}`);
    }
  }

  return results;
}

// ─── Utility: Merge User Inventory ──────────────────────────────────────────

export interface UserOwnedCCU {
  fromShip: string;   // Ship name
  toShip: string;     // Ship name
  pricePaid: number;
  location: "hangar" | "buyback"; // Where this CCU lives
}

/**
 * Mark CCU edges as "owned" based on user's hangar inventory.
 * Matches by ship name (case-insensitive).
 */
export function mergeUserInventory(
  edges: CCUEdge[],
  ships: Map<string, ShipNode>,
  ownedCCUs: UserOwnedCCU[],
): CCUEdge[] {
  // Build name→id lookup
  const nameToId = new Map<string, string>();
  for (const [id, ship] of ships) {
    nameToId.set(ship.name.toLowerCase(), id);
    // Also map without manufacturer prefix
    const parts = ship.name.split(" ");
    if (parts.length > 1) {
      nameToId.set(parts.slice(1).join(" ").toLowerCase(), id);
    }
  }

  // Build map of owned pairs → { location, pricePaid }
  const ownedMap = new Map<string, { location: "hangar" | "buyback"; pricePaid: number }>();
  for (const ccu of ownedCCUs) {
    const fromId = nameToId.get(ccu.fromShip.toLowerCase());
    const toId = nameToId.get(ccu.toShip.toLowerCase());
    if (fromId && toId) {
      const key = `${fromId}->${toId}`;
      // If same CCU exists in both hangar and buyback, prefer hangar
      const existing = ownedMap.get(key);
      if (!existing || ccu.location === "hangar") {
        ownedMap.set(key, { location: ccu.location || "hangar", pricePaid: ccu.pricePaid });
      }
    }
  }

  // Mark edges as owned with location info
  // Mark edges that ARE in the graph as owned
  const markedEdges = edges.map(edge => {
    const key = `${edge.fromShipId}->${edge.toShipId}`;
    const owned = ownedMap.get(key);
    if (owned) {
      return {
        ...edge,
        isOwned: true,
        ownedLocation: owned.location,
        ownedPricePaid: owned.pricePaid,
      };
    }
    return edge;
  });

  // FIX 2026-04-26: si el user tiene una CCU del inventario hacia un par
  // que NO existe en el grafo (típicamente porque la nave destino es CONCEPT
  // y CIG no la vende continuamente, o porque is_ccu_eligible=false), antes
  // se perdía silenciosamente. Acá la agregamos como edge nuevo "owned-only"
  // así el algoritmo puede llegar al destino aunque no haya CCU disponible
  // a la venta hoy.
  const existingPairs = new Set(edges.map((e) => `${e.fromShipId}->${e.toShipId}`));
  const extraEdges: CCUEdge[] = [];
  for (const [key, owned] of ownedMap) {
    if (existingPairs.has(key)) continue;
    const [fromShipId, toShipId] = key.split("->");
    const fromShip = ships.get(fromShipId);
    const toShip = ships.get(toShipId);
    if (!fromShip || !toShip) continue;
    // Standard price = MSRP delta. No warbond porque no hay datos reales.
    const standardPrice = Math.max(0, toShip.msrpUsd - fromShip.msrpUsd);
    extraEdges.push({
      fromShipId,
      toShipId,
      standardPrice,
      warbondPrice: null,
      isWarbondAvailable: false,
      isOwned: true,
      ownedLocation: owned.location,
      ownedPricePaid: owned.pricePaid,
      isLimited: false, // owned CCUs no se filtran por isLimited
    });
  }

  return [...markedEdges, ...extraEdges];
}
