-- =============================================================================
-- Migracion: 046_create_mining_stop_distributions
-- Modulo:    Mining → Trade — Distribucion de ganancias por stop
-- Fecha:     2026-04-18
-- =============================================================================
--
-- Una fila por cada vez que el usuario toca "Cobrado" en un stop de una
-- ruta activa. Linkea la mining session de origen con la ruta + stop de
-- venta, y sirve como ancla para los pending payouts y el ledger final.
--
-- Flujo:
--   1. Usuario toca "Cobrado" en el stop N de una ruta →
--      se crea una mining_stop_distribution con status='pending'.
--   2. Se calculan los mining_pending_payouts por cada miembro (mining +
--      trade) segun el split_mode elegido.
--   3. Cuando todos los stops de la ruta estan cobrados, el usuario toca
--      "Distribuido" → status='distributed', se escribe al
--      mining_settlement_ledger y se habilita "marcar como pagado".
--
-- El split_mode default es el de la mining_session; puede overridarse
-- al momento de cobrar. 'scu_mined' se difiere a fase posterior.
-- =============================================================================

CREATE TABLE IF NOT EXISTS mining_stop_distributions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Linkeo con la ruta (marker [route:GROUP_ID:STOP:TOTAL] en notes)
  route_group_id        TEXT NOT NULL,
  stop_index            INTEGER NOT NULL CHECK (stop_index >= 1),
  route_total_stops     INTEGER NOT NULL CHECK (route_total_stops >= 1),

  -- Linkeo con el origen minero (opcional — una ruta puede vender
  -- commodities que no vienen de mining, p.ej. compra-venta pura)
  mining_session_id     UUID REFERENCES mining_sessions(id) ON DELETE SET NULL,

  -- Snapshot de parties (party_id puede cambiar despues; guardamos el
  -- que habia al momento del cobro para que el ledger sea auditable)
  mining_party_id       UUID,
  trade_party_id        UUID,

  -- Numeros del stop
  gross_auec            NUMERIC(14,2) NOT NULL DEFAULT 0,   -- scu_sold * sell_price sumado entre WOs del stop
  buy_cost_auec         NUMERIC(14,2) NOT NULL DEFAULT 0,   -- scu_bought * buy_price (prorrateado al stop)
  expenses_auec         NUMERIC(14,2) NOT NULL DEFAULT 0,   -- trade_wo_expenses prorrateados
  net_auec              NUMERIC(14,2) NOT NULL DEFAULT 0,   -- gross - buy_cost - expenses (a repartir)

  -- Split
  split_mode            TEXT NOT NULL DEFAULT 'equitable'
                        CHECK (split_mode IN (
                          'equitable',      -- equitativo entre presentes
                          'manual_pct',     -- % manuales al cobrar
                          'role_weight'     -- roles con peso fijo
                          -- 'scu_mined' se agrega en fase posterior
                        )),

  -- Estado
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'distributed', 'archived')),

  -- Ownership — quien toco "Cobrado"
  triggered_by          UUID NOT NULL,
  triggered_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  distributed_at        TIMESTAMPTZ,

  notes                 TEXT,

  -- Un stop de una ruta puede cobrarse una sola vez (status≠archived)
  CONSTRAINT unique_route_stop_active
    UNIQUE (route_group_id, stop_index, status) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_msd_route           ON mining_stop_distributions(route_group_id);
CREATE INDEX IF NOT EXISTS idx_msd_mining_session  ON mining_stop_distributions(mining_session_id);
CREATE INDEX IF NOT EXISTS idx_msd_mining_party    ON mining_stop_distributions(mining_party_id);
CREATE INDEX IF NOT EXISTS idx_msd_trade_party     ON mining_stop_distributions(trade_party_id);
CREATE INDEX IF NOT EXISTS idx_msd_status          ON mining_stop_distributions(status);
CREATE INDEX IF NOT EXISTS idx_msd_triggered_by    ON mining_stop_distributions(triggered_by);

-- =============================================================================
-- Tabla puente: que WOs estan incluidas en cada distribution
-- (necesaria porque un stop puede agrupar varias WOs de distintas commodities)
-- =============================================================================

CREATE TABLE IF NOT EXISTS mining_stop_distribution_wos (
  distribution_id       UUID NOT NULL REFERENCES mining_stop_distributions(id) ON DELETE CASCADE,
  work_order_id         UUID NOT NULL REFERENCES trade_work_orders(id) ON DELETE CASCADE,
  PRIMARY KEY (distribution_id, work_order_id)
);

CREATE INDEX IF NOT EXISTS idx_msd_wos_wo ON mining_stop_distribution_wos(work_order_id);

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE mining_stop_distributions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE mining_stop_distribution_wos  ENABLE ROW LEVEL SECURITY;

-- Visible al owner de la sesion, a los miembros de las parties involucradas,
-- y al que la disparo.
CREATE POLICY "msd_select" ON mining_stop_distributions FOR SELECT USING (
  triggered_by = auth.uid()
  OR mining_session_id IN (
    SELECT id FROM mining_sessions WHERE owner_id = auth.uid()
  )
  OR mining_party_id IN (
    SELECT party_id FROM party_members WHERE user_id = auth.uid()
  )
  OR trade_party_id IN (
    SELECT party_id FROM party_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "msd_insert" ON mining_stop_distributions FOR INSERT WITH CHECK (
  triggered_by = auth.uid()
);

CREATE POLICY "msd_update" ON mining_stop_distributions FOR UPDATE USING (
  triggered_by = auth.uid()
  OR mining_session_id IN (
    SELECT id FROM mining_sessions WHERE owner_id = auth.uid()
  )
);

CREATE POLICY "msd_delete" ON mining_stop_distributions FOR DELETE USING (
  triggered_by = auth.uid()
  OR mining_session_id IN (
    SELECT id FROM mining_sessions WHERE owner_id = auth.uid()
  )
);

-- Tabla puente: herencia del permiso de la distribution
CREATE POLICY "msd_wos_select" ON mining_stop_distribution_wos FOR SELECT USING (
  distribution_id IN (SELECT id FROM mining_stop_distributions)
);
CREATE POLICY "msd_wos_insert" ON mining_stop_distribution_wos FOR INSERT WITH CHECK (
  distribution_id IN (
    SELECT id FROM mining_stop_distributions WHERE triggered_by = auth.uid()
  )
);
CREATE POLICY "msd_wos_delete" ON mining_stop_distribution_wos FOR DELETE USING (
  distribution_id IN (
    SELECT id FROM mining_stop_distributions WHERE triggered_by = auth.uid()
  )
);
