-- =============================================================================
-- Migration 073 — Event Raffle Session (live raffle stage)
-- 2026-05-07
-- =============================================================================
-- Agrega un campo `raffle_session JSONB` a community_events que mantiene el
-- estado en vivo del sorteo en escena ("modo sorteo"). El admin controla el
-- estado desde /events/[slug]/admin y la pagina publica /events/[slug] hace
-- polling para reemplazar el mapa con la stage de sorteo cuando phase != idle.
--
-- Estructura del JSONB:
-- {
--   "phase": "idle" | "loading" | "loaded" | "spinning" | "won" | "claimed",
--   "prize": {
--     "type": "ship" | "item",
--     "ship_id": "uuid",
--     "ship_name": "Aurora MR",
--     "ship_class": "AURORA_MR",
--     "label": "Aurora MR LTI",
--     "description": "Soportes MonsterTech para HOTAS"
--   } | null,
--   "winner": {
--     "registration_id": "uuid",
--     "user_id": "uuid",
--     "display_name": "elchuker",
--     "avatar_url": "https://...",
--     "rsi_handle": "elchuker"
--   } | null,
--   "won_at": "2026-06-06T17:30:00Z",
--   "claim_deadline_seconds": 60,
--   "spin_seed": 12345
-- }
-- =============================================================================

-- 1) Drop view (depende de community_events.* y necesitamos recrearla con la
--    columna nueva expuesta — Postgres congela la lista de columnas en el
--    create-time del view aunque sea SELECT e.*).
DROP VIEW IF EXISTS public.community_events_public;

-- 2) Agregar la columna a la tabla base.
ALTER TABLE public.community_events
  ADD COLUMN IF NOT EXISTS raffle_session JSONB NOT NULL DEFAULT '{"phase":"idle"}'::jsonb;

COMMENT ON COLUMN public.community_events.raffle_session IS
  'Estado live del sorteo en escena. phase: idle/loading/loaded/spinning/won/claimed. '
  'El admin actualiza via /api/events/[slug]/admin/raffle-state. '
  'La pagina publica hace polling cuando phase != idle.';

-- 3) Recrear la vista publica con los counts (mismo SELECT que migracion 072 +
--    raffle_session ya esta incluida via e.*).
CREATE OR REPLACE VIEW public.community_events_public
WITH (security_invoker = false) AS
SELECT
  e.*,
  (SELECT COUNT(*) FROM public.event_registrations r
    WHERE r.event_id = e.id AND r.attendance_intent = 'confirmed')        AS confirmed_count,
  (SELECT COUNT(*) FROM public.event_registrations r
    WHERE r.event_id = e.id AND r.attendance_intent = 'maybe')            AS maybe_count,
  (SELECT COUNT(*) FROM public.event_registrations r
    WHERE r.event_id = e.id AND r.attended = true)                        AS attended_count,
  (SELECT COUNT(*) FROM public.event_raffle_winners w
    WHERE w.event_id = e.id)                                              AS raffle_winners_count
FROM public.community_events e
WHERE e.is_active = true;

GRANT SELECT ON public.community_events_public TO authenticated, anon;
