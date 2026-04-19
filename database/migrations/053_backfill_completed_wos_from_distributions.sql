-- =============================================================================
-- SC LABS — Backfill: marcar como 'completed' las trade_work_orders que ya
-- tienen una distribucion distribuida pero quedaron en draft/in_progress.
--
-- Contexto (Fase E.E5): hasta abril 2026 el endpoint /api/mining/distributions
-- PATCH status='distributed' actualizaba los pending_payouts y el ledger pero
-- NUNCA marcaba las WOs como 'completed'. Resultado: el ActiveRoutePanel
-- acumulaba rutas fantasma porque su filtro `completed >= total` nunca se
-- satisfacía.
--
-- Esta migracion repara los datos existentes de una sola vez. El bug ya esta
-- arreglado en el endpoint, asi que los nuevos distributed marcaran las WOs
-- correctamente sin necesidad de volver a correr esto.
--
-- Idempotente: solo toca WOs que están en la tabla bridge de distribuciones
-- distribuidas y que todavia no estan 'completed'.
-- =============================================================================

UPDATE trade_work_orders AS two
SET
  status = 'completed',
  completed_at = COALESCE(msd.distributed_at, NOW())
FROM mining_stop_distribution_wos AS msdw
JOIN mining_stop_distributions AS msd
  ON msd.id = msdw.distribution_id
WHERE two.id = msdw.work_order_id
  AND msd.status IN ('distributed', 'closed')
  AND two.status <> 'completed';

-- Para visibilidad al correr:
--   SELECT status, COUNT(*) FROM trade_work_orders GROUP BY status;
