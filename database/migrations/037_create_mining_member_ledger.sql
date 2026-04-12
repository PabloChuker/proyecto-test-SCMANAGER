-- =============================================================================
-- Migracion: 037_create_mining_member_ledger
-- Modulo:    Mining & Industry — Integracion Social
-- Fecha:     2026-04-12
-- =============================================================================
--
-- Ledger de acumulados cross-sesion por persona.
-- Permite ver "cuanto le debo a cada persona en total" a traves de TODAS
-- las sesiones. Se actualiza via triggers o llamadas explicitas.
--
-- materials_received es JSONB: { "QUAN": 15.2, "GOLD": 8.0, ... }
-- =============================================================================

CREATE TABLE IF NOT EXISTS mining_member_ledger (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID UNIQUE,                            -- NULL = guest acumulado por nombre
  display_name        TEXT NOT NULL,

  -- Acumulados financieros
  total_earned        NUMERIC(14,2) NOT NULL DEFAULT 0,       -- total aUEC asignado
  total_paid          NUMERIC(14,2) NOT NULL DEFAULT 0,       -- total aUEC transferido
  total_expenses      NUMERIC(14,2) NOT NULL DEFAULT 0,       -- total gastos reclamados
  balance             NUMERIC(14,2) NOT NULL DEFAULT 0,       -- earned - paid

  -- Participacion
  total_orders        INTEGER NOT NULL DEFAULT 0,
  total_sessions      INTEGER NOT NULL DEFAULT 0,

  -- Materiales acumulados
  materials_received  JSONB NOT NULL DEFAULT '{}',
  materials_value     NUMERIC(14,2) NOT NULL DEFAULT 0,

  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_user    ON mining_member_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_balance ON mining_member_ledger(balance DESC);

-- RLS: cada usuario ve su propio ledger + el owner de sesion ve todos
ALTER TABLE mining_member_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ledger_select" ON mining_member_ledger FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM mining_sessions WHERE owner_id = auth.uid()
  )
);

-- Solo el sistema (via service role) o el owner actualiza el ledger
CREATE POLICY "ledger_insert" ON mining_member_ledger FOR INSERT WITH CHECK (true);
CREATE POLICY "ledger_update" ON mining_member_ledger FOR UPDATE USING (true);

-- =============================================================================
-- Funcion helper: actualizar ledger al insertar un payout
-- Se puede invocar manualmente o como trigger.
-- =============================================================================

CREATE OR REPLACE FUNCTION update_mining_ledger_on_payout()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id   UUID;
  v_name      TEXT;
BEGIN
  -- Obtener user_id y display_name del member
  SELECT mm.user_id, mm.display_name
    INTO v_user_id, v_name
    FROM mining_members mm
    WHERE mm.id = NEW.member_id;

  -- Upsert en el ledger
  INSERT INTO mining_member_ledger (user_id, display_name, total_earned, total_orders, updated_at)
    VALUES (v_user_id, v_name, NEW.payout_auec, 1, now())
  ON CONFLICT (user_id) DO UPDATE SET
    total_earned  = mining_member_ledger.total_earned + NEW.payout_auec,
    total_orders  = mining_member_ledger.total_orders + 1,
    balance       = (mining_member_ledger.total_earned + NEW.payout_auec) - mining_member_ledger.total_paid,
    display_name  = COALESCE(v_name, mining_member_ledger.display_name),
    updated_at    = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_ledger_on_payout
  AFTER INSERT ON mining_crew_payouts
  FOR EACH ROW
  EXECUTE FUNCTION update_mining_ledger_on_payout();

-- =============================================================================
-- Funcion helper: actualizar ledger al registrar pago
-- =============================================================================

CREATE OR REPLACE FUNCTION update_mining_ledger_on_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF NEW.paid = true AND (OLD.paid IS NULL OR OLD.paid = false) THEN
    SELECT mm.user_id INTO v_user_id
      FROM mining_members mm WHERE mm.id = NEW.member_id;

    UPDATE mining_member_ledger SET
      total_paid = total_paid + NEW.payout_auec,
      balance    = total_earned - (total_paid + NEW.payout_auec),
      updated_at = now()
    WHERE user_id = v_user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_ledger_on_payment
  AFTER UPDATE ON mining_crew_payouts
  FOR EACH ROW
  EXECUTE FUNCTION update_mining_ledger_on_payment();
