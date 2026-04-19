// =============================================================================
// SC LABS — Debt simplifier (Splitwise-style greedy)
//
// Toma una lista de entries del settlement ledger (cada una "A le debe X a B")
// y produce una lista minima de transferencias que saldan los balances netos
// entre miembros.
//
// Algoritmo: greedy O(n log n).
//   1. Computar balance neto por persona:
//        balance[p] = sum(recibidos) - sum(pagados)
//      Los que reciben son > 0 (creditors), los que deben son < 0 (debtors).
//   2. Ordenar creditors desc y debtors asc (por |monto|).
//   3. Match cabeza con cabeza: el debtor de mayor deuda le paga al creditor
//      de mayor credito hasta que uno de los dos se salde, luego avanza.
//
// No es optimal-optimal (problema NP-hard) pero en practica matchea Splitwise
// dentro de 1-2 transacciones del optimo global. Suficiente para grupos de <20.
//
// Las entries paid=true se ignoran (ya se transfirieron fuera de la app).
// =============================================================================

const EPSILON = 0.01; // aUEC de tolerancia para cerrar balances

// -- Input types -----------------------------------------------------------

export interface LedgerEntryInput {
  id: string;
  fromUserId: string | null;    // null = "caja" / sesion
  fromDisplayName: string;
  toUserId: string | null;
  toDisplayName: string;
  amountAuec: number;
  paid: boolean;
}

// Identidad de persona en el grafo de deudas. null userId => invitado / caja.
// Usamos una key compuesta para no colapsar dos "Unnamed" distintos.
function identityKey(userId: string | null, displayName: string): string {
  if (userId) return `u:${userId}`;
  return `n:${(displayName || "unknown").trim().toLowerCase()}`;
}

// -- Output types ----------------------------------------------------------

export interface PersonBalance {
  key: string;
  userId: string | null;
  displayName: string;
  balance: number;   // > 0 => se le debe; < 0 => debe
  gross: number;     // total recibido (sin netear)
  owed: number;      // total que deberia pagar (sin netear)
}

export interface SimplifiedTransfer {
  fromKey: string;
  fromUserId: string | null;
  fromDisplayName: string;
  toKey: string;
  toUserId: string | null;
  toDisplayName: string;
  amount: number;
}

export interface DebtSimplifyResult {
  balances: PersonBalance[];
  transfers: SimplifiedTransfer[];
  /** Entries efectivamente consideradas (unpaid). */
  consideredCount: number;
  /** Entries saltadas porque ya estaban pagadas. */
  skippedPaidCount: number;
  /** Suma total bruta considerada (deberia sumar cero despues de netear). */
  totalFlow: number;
}

// -- Core ------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function simplifyDebts(entries: LedgerEntryInput[]): DebtSimplifyResult {
  const balanceMap = new Map<string, PersonBalance>();
  let considered = 0;
  let skipped = 0;
  let totalFlow = 0;

  const ensurePerson = (
    userId: string | null,
    displayName: string,
  ): PersonBalance => {
    const key = identityKey(userId, displayName);
    let row = balanceMap.get(key);
    if (!row) {
      row = {
        key,
        userId,
        displayName: displayName || "Unnamed",
        balance: 0,
        gross: 0,
        owed: 0,
      };
      balanceMap.set(key, row);
    }
    return row;
  };

  for (const e of entries) {
    if (e.paid) { skipped++; continue; }
    const amount = Number(e.amountAuec) || 0;
    if (amount <= 0) continue;
    considered++;
    totalFlow += amount;
    const from = ensurePerson(e.fromUserId, e.fromDisplayName);
    const to = ensurePerson(e.toUserId, e.toDisplayName);
    from.balance -= amount;
    from.owed += amount;
    to.balance += amount;
    to.gross += amount;
  }

  // Redondeo final del balance para no arrastrar floats raros
  for (const row of balanceMap.values()) {
    row.balance = round2(row.balance);
    row.gross = round2(row.gross);
    row.owed = round2(row.owed);
  }

  // Algoritmo greedy: empareja head creditor con head debtor
  const creditors = Array.from(balanceMap.values())
    .filter((p) => p.balance > EPSILON)
    .map((p) => ({ ...p }))
    .sort((a, b) => b.balance - a.balance);
  const debtors = Array.from(balanceMap.values())
    .filter((p) => p.balance < -EPSILON)
    .map((p) => ({ ...p }))
    .sort((a, b) => a.balance - b.balance); // mas negativo primero

  const transfers: SimplifiedTransfer[] = [];
  let ci = 0;
  let di = 0;
  let guard = 0;

  while (ci < creditors.length && di < debtors.length) {
    guard++;
    if (guard > 10_000) break; // safety

    const c = creditors[ci];
    const d = debtors[di];
    const pay = Math.min(c.balance, -d.balance);
    if (pay <= EPSILON) break;

    transfers.push({
      fromKey: d.key,
      fromUserId: d.userId,
      fromDisplayName: d.displayName,
      toKey: c.key,
      toUserId: c.userId,
      toDisplayName: c.displayName,
      amount: round2(pay),
    });

    c.balance = round2(c.balance - pay);
    d.balance = round2(d.balance + pay);

    if (c.balance <= EPSILON) ci++;
    if (d.balance >= -EPSILON) di++;
  }

  return {
    balances: Array.from(balanceMap.values()).sort(
      (a, b) => Math.abs(b.balance) - Math.abs(a.balance),
    ),
    transfers,
    consideredCount: considered,
    skippedPaidCount: skipped,
    totalFlow: round2(totalFlow),
  };
}
