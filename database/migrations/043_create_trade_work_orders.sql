-- =============================================================================
-- Migracion: 043_create_trade_work_orders
-- Modulo:    Trade System — Work Orders
-- Fecha:     2026-04-13
-- =============================================================================
--
-- Work orders de comercio. Cada orden representa una corrida de trade
-- (solo o con party): compra de mercancia, venta, perdidas y reparto
-- de profit entre miembros participantes por rol + % editable.
--
-- Split model:
--   - Cada participante puede cargar contribution_uec (dinero o mercancia
--     aportada). Esa contribution se le devuelve antes del reparto.
--   - El profit neto = total_sell - total_buy - lost_value - expenses
--   - El profit neto se reparte segun role_pct de cada participante
--     (los role_pct deben sumar 100).
-- =============================================================================

CREATE TABLE IF NOT EXISTS trade_work_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          UUID NOT NULL,                            -- FK logica auth.users
  party_id          UUID,                                     -- FK logica a parties(id), opcional
  title             TEXT NOT NULL DEFAULT 'Trade Run',
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'in_progress', 'completed', 'archived')),

  -- Commodity + ruta (precargado desde Trade Routes o cargado a mano)
  commodity_code    TEXT,
  commodity_name    TEXT,
  buy_station       TEXT,
  buy_system        TEXT,
  sell_station      TEXT,
  sell_system       TEXT,

  -- Cantidades y precios (SCU y UEC)
  scu_bought        NUMERIC(12,2) NOT NULL DEFAULT 0,
  scu_sold          NUMERIC(12,2) NOT NULL DEFAULT 0,
  scu_lost          NUMERIC(12,2) NOT NULL DEFAULT 0,          -- mercancia perdida en el camino
  buy_price_per_scu NUMERIC(12,2) NOT NULL DEFAULT 0,
  sell_price_per_scu NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Totales calculados (pueden venir denormalizados para historial)
  total_buy         NUMERIC(14,2) NOT NULL DEFAULT 0,          -- scu_bought * buy_price
  total_sell        NUMERIC(14,2) NOT NULL DEFAULT 0,          -- scu_sold * sell_price
  total_expenses    NUMERIC(14,2) NOT NULL DEFAULT 0,          -- suma de trade_wo_expenses
  net_profit        NUMERIC(14,2) NOT NULL DEFAULT 0,          -- total_sell - total_buy - expenses

  -- Metadata
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_trade_wo_owner   ON trade_work_orders(owner_id);
CREATE INDEX IF NOT EXISTS idx_trade_wo_party   ON trade_work_orders(party_id);
CREATE INDEX IF NOT EXISTS idx_trade_wo_status  ON trade_work_orders(status);
CREATE INDEX IF NOT EXISTS idx_trade_wo_created ON trade_work_orders(created_at DESC);

-- =============================================================================
-- Participantes de la WO (roles + % del profit neto + aporte individual)
-- =============================================================================

CREATE TABLE IF NOT EXISTS trade_wo_participants (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id       UUID NOT NULL REFERENCES trade_work_orders(id) ON DELETE CASCADE,
  user_id             UUID,                                   -- FK logica auth.users (NULL = guest)
  display_name        TEXT NOT NULL,
  role                TEXT NOT NULL DEFAULT 'crew'
                      CHECK (role IN (
                        'pilot',       -- piloto principal
                        'escort',      -- escolta / defensa
                        'scout',       -- explorador / planeador de ruta
                        'financier',   -- puso el dinero (no va en el viaje)
                        'mule',        -- movio la carga
                        'crew',        -- tripulacion generica
                        'other'
                      )),
  role_pct            NUMERIC(5,2) NOT NULL DEFAULT 0,         -- porcentaje del profit neto
  contribution_uec    NUMERIC(14,2) NOT NULL DEFAULT 0,        -- dinero/mercancia aportada
  contribution_note   TEXT,                                    -- "puso 5M para la compra", etc.

  -- Calculados al cerrar la WO (snapshot)
  payout_uec          NUMERIC(14,2) NOT NULL DEFAULT 0,        -- contribution_uec + (net_profit * role_pct / 100)
  paid                BOOLEAN NOT NULL DEFAULT false,
  paid_at             TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trade_wo_part_wo   ON trade_wo_participants(work_order_id);
CREATE INDEX IF NOT EXISTS idx_trade_wo_part_user ON trade_wo_participants(user_id);

-- =============================================================================
-- Gastos generales de la WO (combustible, reparaciones, fees)
-- =============================================================================

CREATE TABLE IF NOT EXISTS trade_wo_expenses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id   UUID NOT NULL REFERENCES trade_work_orders(id) ON DELETE CASCADE,
  payer_id        UUID,                                        -- participant.user_id (opcional)
  payer_name      TEXT NOT NULL,
  description     TEXT NOT NULL,
  amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  expense_type    TEXT NOT NULL DEFAULT 'general'
                  CHECK (expense_type IN ('fuel', 'repair', 'ammo', 'fee', 'insurance', 'general')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trade_wo_exp_wo ON trade_wo_expenses(work_order_id);

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE trade_work_orders    ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_wo_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_wo_expenses    ENABLE ROW LEVEL SECURITY;

-- Work orders: visible al owner y a miembros de la party (si tiene party)
CREATE POLICY "trade_wo_select" ON trade_work_orders FOR SELECT USING (
  owner_id = auth.uid()
  OR party_id IN (
    SELECT party_id FROM party_members WHERE user_id = auth.uid()
  )
);
CREATE POLICY "trade_wo_insert" ON trade_work_orders FOR INSERT WITH CHECK (
  owner_id = auth.uid()
);
CREATE POLICY "trade_wo_update" ON trade_work_orders FOR UPDATE USING (
  owner_id = auth.uid()
);
CREATE POLICY "trade_wo_delete" ON trade_work_orders FOR DELETE USING (
  owner_id = auth.uid()
);

-- Participants: visible si podes ver la WO
CREATE POLICY "trade_wo_part_select" ON trade_wo_participants FOR SELECT USING (
  work_order_id IN (
    SELECT id FROM trade_work_orders WHERE owner_id = auth.uid()
  )
  OR work_order_id IN (
    SELECT two.id FROM trade_work_orders two
      JOIN party_members pm ON pm.party_id = two.party_id
      WHERE pm.user_id = auth.uid()
  )
  OR user_id = auth.uid()
);
CREATE POLICY "trade_wo_part_insert" ON trade_wo_participants FOR INSERT WITH CHECK (
  work_order_id IN (SELECT id FROM trade_work_orders WHERE owner_id = auth.uid())
);
CREATE POLICY "trade_wo_part_update" ON trade_wo_participants FOR UPDATE USING (
  work_order_id IN (SELECT id FROM trade_work_orders WHERE owner_id = auth.uid())
);
CREATE POLICY "trade_wo_part_delete" ON trade_wo_participants FOR DELETE USING (
  work_order_id IN (SELECT id FROM trade_work_orders WHERE owner_id = auth.uid())
);

-- Expenses: misma logica
CREATE POLICY "trade_wo_exp_select" ON trade_wo_expenses FOR SELECT USING (
  work_order_id IN (
    SELECT id FROM trade_work_orders WHERE owner_id = auth.uid()
  )
  OR work_order_id IN (
    SELECT two.id FROM trade_work_orders two
      JOIN party_members pm ON pm.party_id = two.party_id
      WHERE pm.user_id = auth.uid()
  )
);
CREATE POLICY "trade_wo_exp_insert" ON trade_wo_expenses FOR INSERT WITH CHECK (
  work_order_id IN (SELECT id FROM trade_work_orders WHERE owner_id = auth.uid())
);
CREATE POLICY "trade_wo_exp_update" ON trade_wo_expenses FOR UPDATE USING (
  work_order_id IN (SELECT id FROM trade_work_orders WHERE owner_id = auth.uid())
);
CREATE POLICY "trade_wo_exp_delete" ON trade_wo_expenses FOR DELETE USING (
  work_order_id IN (SELECT id FROM trade_work_orders WHERE owner_id = auth.uid())
);

-- =============================================================================
-- Trigger para mantener updated_at y recalcular totales
-- =============================================================================

CREATE OR REPLACE FUNCTION trade_wo_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trade_wo_updated ON trade_work_orders;
CREATE TRIGGER trg_trade_wo_updated
  BEFORE UPDATE ON trade_work_orders
  FOR EACH ROW EXECUTE FUNCTION trade_wo_touch_updated_at();
