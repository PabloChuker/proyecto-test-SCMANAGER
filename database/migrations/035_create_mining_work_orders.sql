-- =============================================================================
-- Migracion: 035_create_mining_work_orders
-- Modulo:    Mining & Industry — Integracion Social
-- Fecha:     2026-04-12
-- =============================================================================
--
-- Work orders (ordenes de trabajo minero). Reemplaza alfilo_wo_orders.
-- Cada orden pertenece a una sesion y registra minerales, valores, timer.
-- Los gastos y payouts van en tablas separadas para normalizar.
-- =============================================================================

CREATE TABLE IF NOT EXISTS mining_work_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES mining_sessions(id) ON DELETE CASCADE,
  created_by        UUID NOT NULL,                          -- FK logica auth.users

  -- Tipo de operacion
  order_type        TEXT NOT NULL CHECK (order_type IN ('ship', 'roc', 'salvage', 'share')),
  status            TEXT NOT NULL DEFAULT 'in_progress'
                    CHECK (status IN ('in_progress', 'completed', 'collected')),

  -- Refineria (solo ship mining)
  refinery_id       TEXT,
  refinery_name     TEXT,
  refining_method   TEXT,

  -- Minerales: [{ id, name, quantity, yieldQty, value }]
  ores              JSONB NOT NULL DEFAULT '[]',

  -- Financiero
  total_yield       NUMERIC(12,2) NOT NULL DEFAULT 0,
  gross_value       NUMERIC(12,2) NOT NULL DEFAULT 0,
  sell_price        NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_profit        NUMERIC(12,2) NOT NULL DEFAULT 0,
  motrader_fee      NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Timer de refineria
  countdown_seconds INTEGER NOT NULL DEFAULT 0,
  countdown_ends_at TIMESTAMPTZ,

  -- Metadata
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  collected_at      TIMESTAMPTZ,
  notes             TEXT
);

CREATE INDEX IF NOT EXISTS idx_wo_session ON mining_work_orders(session_id);
CREATE INDEX IF NOT EXISTS idx_wo_status  ON mining_work_orders(status);
CREATE INDEX IF NOT EXISTS idx_wo_type    ON mining_work_orders(order_type);

-- =============================================================================
-- Gastos por orden
-- =============================================================================

CREATE TABLE IF NOT EXISTS mining_expenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES mining_work_orders(id) ON DELETE CASCADE,
  claimant_id   UUID,                                       -- NULL = guest
  claimant_name TEXT NOT NULL,
  expense_name  TEXT NOT NULL,
  amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  expense_type  TEXT NOT NULL DEFAULT 'general'
                CHECK (expense_type IN ('fuel', 'ammo', 'repair', 'fee', 'general')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_wo ON mining_expenses(work_order_id);

-- =============================================================================
-- Crew payouts por orden (lo que le corresponde a cada miembro)
-- =============================================================================

CREATE TABLE IF NOT EXISTS mining_crew_payouts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id   UUID NOT NULL REFERENCES mining_work_orders(id) ON DELETE CASCADE,
  member_id       UUID NOT NULL REFERENCES mining_members(id) ON DELETE CASCADE,
  share_pct       NUMERIC(5,2) NOT NULL,
  payout_auec     NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid            BOOLEAN NOT NULL DEFAULT false,
  paid_at         TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payouts_unique
  ON mining_crew_payouts(work_order_id, member_id);
CREATE INDEX IF NOT EXISTS idx_payouts_wo     ON mining_crew_payouts(work_order_id);
CREATE INDEX IF NOT EXISTS idx_payouts_member ON mining_crew_payouts(member_id);

-- RLS para las 3 tablas de esta migracion
ALTER TABLE mining_work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE mining_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE mining_crew_payouts ENABLE ROW LEVEL SECURITY;

-- Work orders: visible a participantes de la sesion
CREATE POLICY "wo_select" ON mining_work_orders FOR SELECT USING (
  session_id IN (SELECT id FROM mining_sessions WHERE owner_id = auth.uid())
  OR session_id IN (
    SELECT ms.id FROM mining_sessions ms
      JOIN party_members pm ON pm.party_id = ms.party_id
      WHERE pm.user_id = auth.uid()
  )
);
CREATE POLICY "wo_insert" ON mining_work_orders FOR INSERT WITH CHECK (
  session_id IN (SELECT id FROM mining_sessions WHERE owner_id = auth.uid())
);
CREATE POLICY "wo_update" ON mining_work_orders FOR UPDATE USING (
  session_id IN (SELECT id FROM mining_sessions WHERE owner_id = auth.uid())
);
CREATE POLICY "wo_delete" ON mining_work_orders FOR DELETE USING (
  session_id IN (SELECT id FROM mining_sessions WHERE owner_id = auth.uid())
);

-- Expenses: misma logica
CREATE POLICY "exp_select" ON mining_expenses FOR SELECT USING (
  work_order_id IN (SELECT id FROM mining_work_orders WHERE session_id IN (
    SELECT id FROM mining_sessions WHERE owner_id = auth.uid()
  ))
  OR work_order_id IN (SELECT id FROM mining_work_orders WHERE session_id IN (
    SELECT ms.id FROM mining_sessions ms JOIN party_members pm ON pm.party_id = ms.party_id WHERE pm.user_id = auth.uid()
  ))
);
CREATE POLICY "exp_insert" ON mining_expenses FOR INSERT WITH CHECK (
  work_order_id IN (SELECT id FROM mining_work_orders WHERE session_id IN (
    SELECT id FROM mining_sessions WHERE owner_id = auth.uid()
  ))
);

-- Payouts: misma logica
CREATE POLICY "pay_select" ON mining_crew_payouts FOR SELECT USING (
  work_order_id IN (SELECT id FROM mining_work_orders WHERE session_id IN (
    SELECT id FROM mining_sessions WHERE owner_id = auth.uid()
  ))
  OR member_id IN (SELECT id FROM mining_members WHERE user_id = auth.uid())
);
CREATE POLICY "pay_insert" ON mining_crew_payouts FOR INSERT WITH CHECK (
  work_order_id IN (SELECT id FROM mining_work_orders WHERE session_id IN (
    SELECT id FROM mining_sessions WHERE owner_id = auth.uid()
  ))
);
