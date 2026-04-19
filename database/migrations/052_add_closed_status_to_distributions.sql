-- =============================================================================
-- Migracion: 052_add_closed_status_to_distributions
-- Modulo:    Trade / Mining — Cierre explicito de orden de pago (Fase E.2)
-- Fecha:     2026-04-19
-- =============================================================================
--
-- Extiende mining_stop_distributions con un estado 'closed' + columnas
-- closed_at / closed_by. El cierre es una accion explicita del usuario
-- (distinto de archived) que solo se habilita cuando TODOS los entries del
-- mining_settlement_ledger para esta distribution estan paid=true.
--
-- Flujo:
--   1. status='pending'      → creada por Cobrar
--   2. status='distributed'  → tocada "Distribuido"; ledger entries insertados
--   3. status='closed'       → todos los pagos marcados paid=true + user
--                              cerro la orden de pago (no se pueden tocar mas).
--
-- 'archived' sigue disponible para casos de rollback/error (no reemplaza 'closed').
-- =============================================================================

-- 1) Extender el CHECK de status para admitir 'closed'.
ALTER TABLE mining_stop_distributions
  DROP CONSTRAINT IF EXISTS mining_stop_distributions_status_check;

ALTER TABLE mining_stop_distributions
  ADD CONSTRAINT mining_stop_distributions_status_check
  CHECK (status IN ('pending', 'distributed', 'closed', 'archived'));

-- 2) Columnas de auditoria del cierre.
ALTER TABLE mining_stop_distributions
  ADD COLUMN IF NOT EXISTS closed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by  UUID;

CREATE INDEX IF NOT EXISTS idx_msd_closed_by ON mining_stop_distributions(closed_by);

-- 3) (Opcional) comentarios de tabla para que quede documentado el semantico.
COMMENT ON COLUMN mining_stop_distributions.closed_at IS
  'Fase E.2 — timestamp en que el usuario cerro la orden de pago. Solo puede setearse cuando todos los mining_settlement_ledger entries asociados estan paid=true.';

COMMENT ON COLUMN mining_stop_distributions.closed_by IS
  'Fase E.2 — usuario que cerro la orden. Normalmente = triggered_by pero puede diferir si alguien con permisos de admin cerro por otro.';
