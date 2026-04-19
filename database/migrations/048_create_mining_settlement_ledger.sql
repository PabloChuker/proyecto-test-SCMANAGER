-- =============================================================================
-- Migracion: 048_create_mining_settlement_ledger
-- Modulo:    Mining → Trade — Ledger de settlement
-- Fecha:     2026-04-18
-- =============================================================================
--
-- Ledger inmutable que registra quien le debe aUEC a quien. Se alimenta
-- cuando una mining_stop_distribution pasa a 'distributed' — cada
-- pending payout se vuelca aca como una deuda desde la "caja" (owner de
-- la sesion o financier del trade) hacia el beneficiario.
--
-- Ademas soporta entries de tipo 'settlement' cuando el algoritmo de
-- simplificacion de deudas (Splitwise-style) propone redirigir pagos
-- directos entre miembros para minimizar transacciones.
--
-- "paid" se marca manualmente cuando efectivamente se transfirio el
-- dinero en el juego (no hay API de wallet en SC). El ledger es el
-- sistema de tracking, no de movimientos reales.
-- =============================================================================

CREATE TABLE IF NOT EXISTS mining_settlement_ledger (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Sender → Receiver
  from_user_id          UUID,                                   -- NULL = "caja" / sesion
  from_display_name     TEXT NOT NULL,
  to_user_id            UUID,                                   -- NULL = invitado sin cuenta
  to_display_name       TEXT NOT NULL,

  amount_auec           NUMERIC(14,2) NOT NULL CHECK (amount_auec > 0),

  -- Origen del movimiento
  direction             TEXT NOT NULL
                        CHECK (direction IN (
                          'from_mining',     -- sale de una mining_stop_distribution
                          'settlement'       -- redireccionado por algoritmo de simplificacion
                        )),

  -- Referencias
  distribution_id       UUID REFERENCES mining_stop_distributions(id) ON DELETE SET NULL,
  pending_payout_id     UUID REFERENCES mining_pending_payouts(id) ON DELETE SET NULL,
  session_id            UUID REFERENCES mining_sessions(id) ON DELETE SET NULL,

  -- Estado de cobro
  paid                  BOOLEAN NOT NULL DEFAULT false,
  paid_at               TIMESTAMPTZ,
  paid_by               UUID,                                   -- quien marco como pagado

  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msl_from_user     ON mining_settlement_ledger(from_user_id);
CREATE INDEX IF NOT EXISTS idx_msl_to_user       ON mining_settlement_ledger(to_user_id);
CREATE INDEX IF NOT EXISTS idx_msl_distribution  ON mining_settlement_ledger(distribution_id);
CREATE INDEX IF NOT EXISTS idx_msl_session       ON mining_settlement_ledger(session_id);
CREATE INDEX IF NOT EXISTS idx_msl_paid          ON mining_settlement_ledger(paid);
CREATE INDEX IF NOT EXISTS idx_msl_created       ON mining_settlement_ledger(created_at DESC);

-- =============================================================================
-- RLS — visible a las dos puntas del movimiento o al owner de la sesion
-- =============================================================================

ALTER TABLE mining_settlement_ledger ENABLE ROW LEVEL SECURITY;

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

-- Solo se actualiza el estado "paid". Nunca se mutan montos ni partes.
CREATE POLICY "msl_update" ON mining_settlement_ledger FOR UPDATE USING (
  from_user_id = auth.uid()
  OR to_user_id = auth.uid()
  OR session_id IN (SELECT id FROM mining_sessions WHERE owner_id = auth.uid())
);

CREATE POLICY "msl_delete" ON mining_settlement_ledger FOR DELETE USING (
  session_id IN (SELECT id FROM mining_sessions WHERE owner_id = auth.uid())
);
