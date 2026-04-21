-- =============================================================================
-- Migration 055 — Close orphan mining_sessions (linked party ya terminada)
--
-- Contexto (2026-04-21):
--   Después de aplicar 054 (party lifecycle), quedaron mining_sessions con
--   `status='active'` cuyo `party_id` apunta a parties con `status='ended'`.
--   Esto hace que `/mining` auto-seleccione una sesión vieja y precargue crew
--   fantasma — bug que Pablo reportó justo después de aplicar Fase F:
--
--     "no hay party creada y en mining al cargar una orden si voy a party y
--      cliqueo sigue cargando la party"
--
--   Root cause: `PartyMiningDashboard` busca la primera mining_session con
--   `status='active'` y la monta, sin chequear si la party linked sigue viva.
--   Al cerrar una party por beacon / disolver, no cerrábamos las sesiones.
--
-- Esta migración:
--   1. Cierra mining_sessions huérfanas: `status='active'` + party_id apunta a
--      una party `ended`.  Fija `status='completed'` y `completed_at=NOW()`.
--   2. No borra filas (conserva historial de work orders / inventory / ledger
--      para las stats — mismo principio que Fase F).
--
-- Idempotente: se puede re-correr; solo actualiza filas que todavía están
-- activas con party ended.
-- =============================================================================

BEGIN;

UPDATE public.mining_sessions ms
SET
  status       = 'completed',
  completed_at = COALESCE(ms.completed_at, NOW())
WHERE
  ms.status = 'active'
  AND ms.party_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.parties p
    WHERE p.id = ms.party_id
      AND p.status = 'ended'
  );

COMMIT;
