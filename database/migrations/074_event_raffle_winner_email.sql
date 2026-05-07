-- =============================================================================
-- Migration 074 — Event Raffle Winner Email + Claim Timestamp
-- 2026-05-07
-- =============================================================================
-- Permite que el ganador de un sorteo registre su email para que el equipo
-- organizador le envie el premio (gift code, soportes fisicos, etc).
-- =============================================================================

-- 1) Drop view (depende de community_events.* y la vista
--    event_raffle_winners_public hace SELECT w.*)
DROP VIEW IF EXISTS public.event_raffle_winners_public;

-- 2) Agregar columnas
ALTER TABLE public.event_raffle_winners
  ADD COLUMN IF NOT EXISTS winner_email TEXT,
  ADD COLUMN IF NOT EXISTS claimed_at   TIMESTAMPTZ;

COMMENT ON COLUMN public.event_raffle_winners.winner_email IS
  'Email opcional que el ganador registra para recibir el premio. Lo carga el ganador despues del sorteo via /api/events/[slug]/raffle/winner-email.';
COMMENT ON COLUMN public.event_raffle_winners.claimed_at IS
  'Timestamp de cuando el ganador grabo su email — marca la reclamacion exitosa.';

-- 3) Recrear la vista publica de winners. Mismo SELECT que el original
--    (matchea el pg_get_viewdef del estado pre-074) + las columnas nuevas
--    winner_email y claimed_at. Usamos profiles directo + security_invoker
--    false como el original, para no romper consumers que esperan el shape
--    historico.
CREATE OR REPLACE VIEW public.event_raffle_winners_public
WITH (security_invoker = false) AS
SELECT
  w.id,
  w.event_id,
  w.prize,
  w.notes,
  w.drawn_at,
  w.winner_email,
  w.claimed_at,
  r.display_name   AS winner_display_name,
  r.rsi_handle     AS winner_rsi_handle,
  p.username       AS winner_username,
  p.avatar_url     AS winner_avatar_url
FROM public.event_raffle_winners w
JOIN public.event_registrations r ON r.id = w.registration_id
LEFT JOIN public.profiles p       ON p.id = r.user_id;

GRANT SELECT ON public.event_raffle_winners_public TO authenticated, anon;

-- 4) RLS update — winners pueden UPDATE su propio email vía la registration.
--    Solo dejamos que el dueño de la registration (= el ganador) toque
--    winner_email + claimed_at. Resto se queda con drawn_by/admin.
ALTER TABLE public.event_raffle_winners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_raffle_winners_self_claim ON public.event_raffle_winners;
CREATE POLICY event_raffle_winners_self_claim ON public.event_raffle_winners
  FOR UPDATE TO authenticated
  USING (
    registration_id IN (
      SELECT id FROM public.event_registrations WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    registration_id IN (
      SELECT id FROM public.event_registrations WHERE user_id = auth.uid()
    )
  );
