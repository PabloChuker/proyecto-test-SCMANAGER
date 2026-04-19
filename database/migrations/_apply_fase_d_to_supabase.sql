-- =============================================================================
-- _apply_fase_d_to_supabase.sql
-- =============================================================================
-- Helper consolidado: aplica 046 + 047 + 048 en una sola tanda.
-- Pegar este bloque en Supabase → SQL Editor → Run.
--
-- Crea las 3 tablas del pipeline de distribucion party (Fase D):
--   - mining_stop_distributions           (ancla por stop cobrado)
--   - mining_stop_distribution_wos        (puente WO ↔ distribution)
--   - mining_pending_payouts              (monto por miembro, pre-settlement)
--   - mining_settlement_ledger            (ledger de deudas entre miembros)
--
-- Todas usan CREATE TABLE IF NOT EXISTS → correr esto 2 veces no rompe.
-- RLS policies quedan activadas y filtradas por auth.uid().
--
-- Despues de correrlo, refrescar la schema cache:
--   Supabase Dashboard → Settings → API → "Reload schema cache"
-- (o esperar ~10s; PostgREST la rehace sola).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 046_create_mining_stop_distributions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mining_stop_distributions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_group_id        TEXT NOT NULL,
  stop_index            INTEGER NOT NULL CHECK (stop_index >= 1),
  route_total_stops     INTEGER NOT NULL CHECK (route_total_stops >= 1),
  mining_session_id     UUID REFERENCES mining_sessions(id) ON DELETE SET NULL,
  mining_party_id       UUID,
  trade_party_id        UUID,
  gross_auec            NUMERIC(14,2) NOT NULL DEFAULT 0,
  buy_cost_auec         NUMERIC(14,2) NOT NULL DEFAULT 0,
  expenses_auec         NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_auec              NUMERIC(14,2) NOT NULL DEFAULT 0,
  split_mode            TEXT NOT NULL DEFAULT 'equitable'
                        CHECK (split_mode IN ('equitable','manual_pct','role_weight')),
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','distributed','archived')),
  triggered_by          UUID NOT NULL,
  triggered_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  distributed_at        TIMESTAMPTZ,
  notes                 TEXT,
  CONSTRAINT unique_route_stop_active
    UNIQUE (route_group_id, stop_index, status) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_msd_route           ON mining_stop_distributions(route_group_id);
CREATE INDEX IF NOT EXISTS idx_msd_mining_session  ON mining_stop_distributions(mining_session_id);
CREATE INDEX IF NOT EXISTS idx_msd_mining_party    ON mining_stop_distributions(mining_party_id);
CREATE INDEX IF NOT EXISTS idx_msd_trade_party     ON mining_stop_distributions(trade_party_id);
CREATE INDEX IF NOT EXISTS idx_msd_status          ON mining_stop_distributions(status);
CREATE INDEX IF NOT EXISTS idx_msd_triggered_by    ON mining_stop_distributions(triggered_by);

CREATE TABLE IF NOT EXISTS mining_stop_distribution_wos (
  distribution_id       UUID NOT NULL REFERENCES mining_stop_distributions(id) ON DELETE CASCADE,
  work_order_id         UUID NOT NULL REFERENCES trade_work_orders(id) ON DELETE CASCADE,
  PRIMARY KEY (distribution_id, work_order_id)
);
CREATE INDEX IF NOT EXISTS idx_msd_wos_wo ON mining_stop_distribution_wos(work_order_id);

ALTER TABLE mining_stop_distributions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE mining_stop_distribution_wos  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "msd_select"      ON mining_stop_distributions;
DROP POLICY IF EXISTS "msd_insert"      ON mining_stop_distributions;
DROP POLICY IF EXISTS "msd_update"      ON mining_stop_distributions;
DROP POLICY IF EXISTS "msd_delete"      ON mining_stop_distributions;
DROP POLICY IF EXISTS "msd_wos_select"  ON mining_stop_distribution_wos;
DROP POLICY IF EXISTS "msd_wos_insert"  ON mining_stop_distribution_wos;
DROP POLICY IF EXISTS "msd_wos_delete"  ON mining_stop_distribution_wos;

CREATE POLICY "msd_select" ON mining_stop_distributions FOR SELECT USING (
  triggered_by = auth.uid()
  OR mining_session_id IN (SELECT id FROM mining_sessions WHERE owner_id = auth.uid())
  OR mining_party_id IN (SELECT party_id FROM party_members WHERE user_id = auth.uid())
  OR trade_party_id IN (SELECT party_id FROM party_members WHERE user_id = auth.uid())
);
CREATE POLICY "msd_insert" ON mining_stop_distributions FOR INSERT WITH CHECK (
  triggered_by = auth.uid()
);
CREATE POLICY "msd_update" ON mining_stop_distributions FOR UPDATE USING (
  triggered_by = auth.uid()
  OR mining_session_id IN (SELECT id FROM mining_sessions WHERE owner_id = auth.uid())
);
CREATE POLICY "msd_delete" ON mining_stop_distributions FOR DELETE USING (
  triggered_by = auth.uid()
  OR mining_session_id IN (SELECT id FROM mining_sessions WHERE owner_id = auth.uid())
);

CREATE POLICY "msd_wos_select" ON mining_stop_distribution_wos FOR SELECT USING (
  distribution_id IN (SELECT id FROM mining_stop_distributions)
);
CREATE POLICY "msd_wos_insert" ON mining_stop_distribution_wos FOR INSERT WITH CHECK (
  distribution_id IN (SELECT id FROM mining_stop_distributions WHERE triggered_by = auth.uid())
);
CREATE POLICY "msd_wos_delete" ON mining_stop_distribution_wos FOR DELETE USING (
  distribution_id IN (SELECT id FROM mining_stop_distributions WHERE triggered_by = auth.uid())
);

-- -----------------------------------------------------------------------------
-- 047_create_mining_pending_payouts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mining_pending_payouts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_id       UUID NOT NULL REFERENCES mining_stop_distributions(id) ON DELETE CASCADE,
  user_id               UUID,
  display_name          TEXT NOT NULL,
  avatar_url            TEXT,
  source                TEXT NOT NULL CHECK (source IN ('mining','trade','both')),
  mining_member_id      UUID REFERENCES mining_members(id) ON DELETE SET NULL,
  trade_participant_id  UUID REFERENCES trade_wo_participants(id) ON DELETE SET NULL,
  pending_auec          NUMERIC(14,2) NOT NULL DEFAULT 0,
  share_pct             NUMERIC(7,4),
  role_label            TEXT,
  weight_value          NUMERIC(5,2),
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','distributed','cancelled')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  distributed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mpp_distribution ON mining_pending_payouts(distribution_id);
CREATE INDEX IF NOT EXISTS idx_mpp_user         ON mining_pending_payouts(user_id);
CREATE INDEX IF NOT EXISTS idx_mpp_status       ON mining_pending_payouts(status);
CREATE INDEX IF NOT EXISTS idx_mpp_member       ON mining_pending_payouts(mining_member_id);
CREATE INDEX IF NOT EXISTS idx_mpp_trade_part   ON mining_pending_payouts(trade_participant_id);

ALTER TABLE mining_pending_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mpp_select" ON mining_pending_payouts;
DROP POLICY IF EXISTS "mpp_insert" ON mining_pending_payouts;
DROP POLICY IF EXISTS "mpp_update" ON mining_pending_payouts;
DROP POLICY IF EXISTS "mpp_delete" ON mining_pending_payouts;

CREATE POLICY "mpp_select" ON mining_pending_payouts FOR SELECT USING (
  user_id = auth.uid()
  OR distribution_id IN (
    SELECT id FROM mining_stop_distributions WHERE
      triggered_by = auth.uid()
      OR mining_session_id IN (SELECT id FROM mining_sessions WHERE owner_id = auth.uid())
      OR mining_party_id IN (SELECT party_id FROM party_members WHERE user_id = auth.uid())
      OR trade_party_id IN (SELECT party_id FROM party_members WHERE user_id = auth.uid())
  )
);
CREATE POLICY "mpp_insert" ON mining_pending_payouts FOR INSERT WITH CHECK (
  distribution_id IN (SELECT id FROM mining_stop_distributions WHERE triggered_by = auth.uid())
);
CREATE POLICY "mpp_update" ON mining_pending_payouts FOR UPDATE USING (
  distribution_id IN (
    SELECT id FROM mining_stop_distributions WHERE
      triggered_by = auth.uid()
      OR mining_session_id IN (SELECT id FROM mining_sessions WHERE owner_id = auth.uid())
  )
);
CREATE POLICY "mpp_delete" ON mining_pending_payouts FOR DELETE USING (
  distribution_id IN (SELECT id FROM mining_stop_distributions WHERE triggered_by = auth.uid())
);

-- -----------------------------------------------------------------------------
-- 048_create_mining_settlement_ledger
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mining_settlement_ledger (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id          UUID,
  from_display_name     TEXT NOT NULL,
  to_user_id            UUID,
  to_display_name       TEXT NOT NULL,
  amount_auec           NUMERIC(14,2) NOT NULL CHECK (amount_auec > 0),
  direction             TEXT NOT NULL CHECK (direction IN ('from_mining','settlement')),
  distribution_id       UUID REFERENCES mining_stop_distributions(id) ON DELETE SET NULL,
  pending_payout_id     UUID REFERENCES mining_pending_payouts(id) ON DELETE SET NULL,
  session_id            UUID REFERENCES mining_sessions(id) ON DELETE SET NULL,
  paid                  BOOLEAN NOT NULL DEFAULT false,
  paid_at               TIMESTAMPTZ,
  paid_by               UUID,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msl_from_user     ON mining_settlement_ledger(from_user_id);
CREATE INDEX IF NOT EXISTS idx_msl_to_user       ON mining_settlement_ledger(to_user_id);
CREATE INDEX IF NOT EXISTS idx_msl_distribution  ON mining_settlement_ledger(distribution_id);
CREATE INDEX IF NOT EXISTS idx_msl_session       ON mining_settlement_ledger(session_id);
CREATE INDEX IF NOT EXISTS idx_msl_paid          ON mining_settlement_ledger(paid);
CREATE INDEX IF NOT EXISTS idx_msl_created       ON mining_settlement_ledger(created_at DESC);

ALTER TABLE mining_settlement_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "msl_select" ON mining_settlement_ledger;
DROP POLICY IF EXISTS "msl_insert" ON mining_settlement_ledger;
DROP POLICY IF EXISTS "msl_update" ON mining_settlement_ledger;
DROP POLICY IF EXISTS "msl_delete" ON mining_settlement_ledger;

CREATE POLICY "msl_select" ON mining_settlement_ledger FOR SELECT USING (
  from_user_id = auth.uid()
  OR to_user_id = auth.uid()
  OR session_id IN (SELECT id FROM mining_sessions WHERE owner_id = auth.uid())
  OR session_id IN (
    SELECT ms.id FROM mining_sessions ms
      JOIN party_members pm ON pm.party_id = ms.party_id
      WHERE pm.user_id = auth.uid()
  )
);
CREATE POLICY "msl_insert" ON mining_settlement_ledger FOR INSERT WITH CHECK (
  session_id IN (SELECT id FROM mining_sessions WHERE owner_id = auth.uid())
  OR from_user_id = auth.uid()
);
CREATE POLICY "msl_update" ON mining_settlement_ledger FOR UPDATE USING (
  from_user_id = auth.uid()
  OR to_user_id = auth.uid()
  OR session_id IN (SELECT id FROM mining_sessions WHERE owner_id = auth.uid())
);
CREATE POLICY "msl_delete" ON mining_settlement_ledger FOR DELETE USING (
  session_id IN (SELECT id FROM mining_sessions WHERE owner_id = auth.uid())
);

-- =============================================================================
-- Verificacion: correr al final para confirmar que las 4 tablas existen
-- =============================================================================
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'mining_stop_distributions',
    'mining_stop_distribution_wos',
    'mining_pending_payouts',
    'mining_settlement_ledger'
  )
ORDER BY table_name;
