-- =============================================================================
-- Migracion: 036_create_mining_inventory
-- Modulo:    Mining & Industry — Integracion Social
-- Fecha:     2026-04-12
-- =============================================================================
--
-- Inventario de materiales refinados + log de movimientos (auditoria).
-- Reemplaza alfilo_wo_inventory y alfilo_wo_movements de localStorage.
-- El campo destination_ref es un hook para la fase futura de cargo/trade.
-- =============================================================================

CREATE TABLE IF NOT EXISTS mining_inventory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES mining_sessions(id) ON DELETE CASCADE,
  mineral_id      TEXT NOT NULL,
  mineral_name    TEXT NOT NULL,
  quantity        NUMERIC(12,4) NOT NULL DEFAULT 0,          -- disponible actual
  total_received  NUMERIC(12,4) NOT NULL DEFAULT 0,          -- acumulado historico

  CONSTRAINT uq_inventory_mineral UNIQUE(session_id, mineral_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_session ON mining_inventory(session_id);

-- =============================================================================
-- Movimientos de inventario (log inmutable de transacciones)
-- =============================================================================

CREATE TABLE IF NOT EXISTS mining_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES mining_sessions(id) ON DELETE CASCADE,
  work_order_id   UUID REFERENCES mining_work_orders(id) ON DELETE SET NULL,
  mineral_id      TEXT NOT NULL,
  mineral_name    TEXT NOT NULL,
  delta           NUMERIC(12,4) NOT NULL,                    -- +/- cantidad
  reason          TEXT NOT NULL
                  CHECK (reason IN (
                    'refine_complete',
                    'sell',
                    'craft',
                    'distribute',
                    'transfer_out',
                    'manual_add',
                    'manual_remove'
                  )),
  member_id       UUID REFERENCES mining_members(id) ON DELETE SET NULL,
  member_name     TEXT,
  destination_ref TEXT,                                      -- hook cargo/trade futuro
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movements_session ON mining_movements(session_id);
CREATE INDEX IF NOT EXISTS idx_movements_member  ON mining_movements(member_id);
CREATE INDEX IF NOT EXISTS idx_movements_reason  ON mining_movements(reason);
CREATE INDEX IF NOT EXISTS idx_movements_created ON mining_movements(created_at DESC);

-- RLS
ALTER TABLE mining_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE mining_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inv_select" ON mining_inventory FOR SELECT USING (
  session_id IN (SELECT id FROM mining_sessions WHERE owner_id = auth.uid())
  OR session_id IN (
    SELECT ms.id FROM mining_sessions ms
      JOIN party_members pm ON pm.party_id = ms.party_id
      WHERE pm.user_id = auth.uid()
  )
);
CREATE POLICY "inv_insert" ON mining_inventory FOR INSERT WITH CHECK (
  session_id IN (SELECT id FROM mining_sessions WHERE owner_id = auth.uid())
);
CREATE POLICY "inv_update" ON mining_inventory FOR UPDATE USING (
  session_id IN (SELECT id FROM mining_sessions WHERE owner_id = auth.uid())
);

CREATE POLICY "mov_select" ON mining_movements FOR SELECT USING (
  session_id IN (SELECT id FROM mining_sessions WHERE owner_id = auth.uid())
  OR session_id IN (
    SELECT ms.id FROM mining_sessions ms
      JOIN party_members pm ON pm.party_id = ms.party_id
      WHERE pm.user_id = auth.uid()
  )
);
CREATE POLICY "mov_insert" ON mining_movements FOR INSERT WITH CHECK (
  session_id IN (SELECT id FROM mining_sessions WHERE owner_id = auth.uid())
);
