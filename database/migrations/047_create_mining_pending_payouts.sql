-- =============================================================================
-- Migracion: 047_create_mining_pending_payouts
-- Modulo:    Mining → Trade — Pending payouts por miembro
-- Fecha:     2026-04-18
-- =============================================================================
--
-- Cuanto le toca a cada miembro por cada distribution. Se crea cuando el
-- usuario toca "Cobrado" en un stop, y queda en estado pending hasta que
-- la distribution pasa a 'distributed' (ahi se vuelca al ledger).
--
-- Una persona puede aparecer dos veces para la misma distribution:
--   - Una como miembro de mining (contributed_to_mining=true)
--   - Otra como participante de trade (contributed_to_trade=true)
-- En ese caso ambos rows existen y la lib distribution-calc colapsa los
-- montos al final.
-- =============================================================================

CREATE TABLE IF NOT EXISTS mining_pending_payouts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_id       UUID NOT NULL REFERENCES mining_stop_distributions(id) ON DELETE CASCADE,

  -- Identidad del beneficiario (snapshot — no FK rigido a mining_members
  -- porque tambien soportamos trade_wo_participants)
  user_id               UUID,                                   -- NULL = invitado / guest
  display_name          TEXT NOT NULL,
  avatar_url            TEXT,

  -- De donde vino la participacion
  source                TEXT NOT NULL
                        CHECK (source IN ('mining', 'trade', 'both')),
  mining_member_id      UUID REFERENCES mining_members(id) ON DELETE SET NULL,
  trade_participant_id  UUID REFERENCES trade_wo_participants(id) ON DELETE SET NULL,

  -- Monto y rastreo del calculo
  pending_auec          NUMERIC(14,2) NOT NULL DEFAULT 0,
  share_pct             NUMERIC(7,4),                            -- % aplicado (para auditoria)
  role_label            TEXT,                                    -- "miner", "pilot", etc. (para UI)
  weight_value          NUMERIC(5,2),                            -- peso aplicado si role_weight

  -- Booking
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'distributed', 'cancelled')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  distributed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mpp_distribution ON mining_pending_payouts(distribution_id);
CREATE INDEX IF NOT EXISTS idx_mpp_user         ON mining_pending_payouts(user_id);
CREATE INDEX IF NOT EXISTS idx_mpp_status       ON mining_pending_payouts(status);
CREATE INDEX IF NOT EXISTS idx_mpp_member       ON mining_pending_payouts(mining_member_id);
CREATE INDEX IF NOT EXISTS idx_mpp_trade_part   ON mining_pending_payouts(trade_participant_id);

-- =============================================================================
-- RLS — visible si podes ver la distribution padre
-- =============================================================================

ALTER TABLE mining_pending_payouts ENABLE ROW LEVEL SECURITY;

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
  distribution_id IN (
    SELECT id FROM mining_stop_distributions WHERE triggered_by = auth.uid()
  )
);

CREATE POLICY "mpp_update" ON mining_pending_payouts FOR UPDATE USING (
  distribution_id IN (
    SELECT id FROM mining_stop_distributions WHERE
      triggered_by = auth.uid()
      OR mining_session_id IN (SELECT id FROM mining_sessions WHERE owner_id = auth.uid())
  )
);

CREATE POLICY "mpp_delete" ON mining_pending_payouts FOR DELETE USING (
  distribution_id IN (
    SELECT id FROM mining_stop_distributions WHERE triggered_by = auth.uid()
  )
);
