-- =============================================================================
-- SC LABS — 071: admins de evento + asistencia confirmada + sorteo
--
-- Extiende el módulo de eventos comunitarios:
--   · admin_user_ids en community_events: array de UUIDs autorizados a
--     confirmar asistencia y disparar sorteos.
--   · attended + attended_confirmed_at + attended_confirmed_by en
--     event_registrations: el sistema de "presente" lo confirma un admin
--     al chequear quién asistió físicamente.
--   · event_raffle_winners: registro inmutable de cada sorteo realizado
--     (premio + ganador + admin que lo disparó).
-- =============================================================================

-- ── 0) Drop community_events_public para poder ALTER el tabla base ─────────
-- La vista usa SELECT e.* así que cualquier ALTER TABLE community_events
-- falla con "cannot change name of view column". Recreamos al final.
DROP VIEW IF EXISTS public.community_events_public;

-- ── 1) admin_user_ids en community_events ───────────────────────────────────
ALTER TABLE public.community_events
  ADD COLUMN IF NOT EXISTS admin_user_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

CREATE INDEX IF NOT EXISTS idx_community_events_admins ON public.community_events USING GIN (admin_user_ids);

-- Helper SQL function: chequea si auth.uid() es admin de este evento.
CREATE OR REPLACE FUNCTION public.is_event_admin(p_event_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_admins UUID[];
  v_user UUID;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN RETURN false; END IF;
  SELECT admin_user_ids INTO v_admins FROM public.community_events WHERE id = p_event_id;
  IF v_admins IS NULL THEN RETURN false; END IF;
  RETURN v_user = ANY(v_admins);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;


-- ── 2) attended + admin confirmation en event_registrations ─────────────────
ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS attended BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attended_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attended_confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_event_registrations_attended
  ON public.event_registrations(event_id) WHERE attended = true;

-- RLS: admins del evento pueden UPDATE el campo attended (además del user
-- propio que sigue pudiendo modificar sus campos personales).
DROP POLICY IF EXISTS event_registrations_admin_update ON public.event_registrations;
CREATE POLICY event_registrations_admin_update ON public.event_registrations
  FOR UPDATE TO authenticated
  USING (public.is_event_admin(event_id))
  WITH CHECK (public.is_event_admin(event_id));


-- ── 3) event_raffle_winners ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_raffle_winners (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES public.community_events(id) ON DELETE CASCADE,
  registration_id UUID NOT NULL REFERENCES public.event_registrations(id) ON DELETE CASCADE,
  prize           TEXT NOT NULL CHECK (char_length(prize) BETWEEN 1 AND 200),
  notes           TEXT CHECK (notes IS NULL OR char_length(notes) <= 1000),
  drawn_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  drawn_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_event_raffle_winners_event ON public.event_raffle_winners(event_id, drawn_at DESC);

ALTER TABLE public.event_raffle_winners ENABLE ROW LEVEL SECURITY;

-- Read pública (todos pueden ver los ganadores publicados)
DROP POLICY IF EXISTS event_raffle_winners_read ON public.event_raffle_winners;
CREATE POLICY event_raffle_winners_read ON public.event_raffle_winners
  FOR SELECT TO authenticated, anon USING (true);

-- Solo admins del evento pueden insert/update/delete
DROP POLICY IF EXISTS event_raffle_winners_admin_write ON public.event_raffle_winners;
CREATE POLICY event_raffle_winners_admin_write ON public.event_raffle_winners
  FOR INSERT TO authenticated WITH CHECK (public.is_event_admin(event_id));

DROP POLICY IF EXISTS event_raffle_winners_admin_update ON public.event_raffle_winners;
CREATE POLICY event_raffle_winners_admin_update ON public.event_raffle_winners
  FOR UPDATE TO authenticated
  USING (public.is_event_admin(event_id))
  WITH CHECK (public.is_event_admin(event_id));

DROP POLICY IF EXISTS event_raffle_winners_admin_delete ON public.event_raffle_winners;
CREATE POLICY event_raffle_winners_admin_delete ON public.event_raffle_winners
  FOR DELETE TO authenticated USING (public.is_event_admin(event_id));


-- ── 4) Vista pública con datos del ganador ──────────────────────────────────
-- Útil para "ver ganadores" después del sorteo sin tocar las tablas base.
CREATE OR REPLACE VIEW public.event_raffle_winners_public
WITH (security_invoker = false) AS
SELECT
  w.id,
  w.event_id,
  w.prize,
  w.notes,
  w.drawn_at,
  r.display_name        AS winner_display_name,
  r.rsi_handle          AS winner_rsi_handle,
  p.username            AS winner_username,
  p.avatar_url          AS winner_avatar_url
FROM public.event_raffle_winners w
JOIN public.event_registrations r ON r.id = w.registration_id
LEFT JOIN public.profiles p ON p.id = r.user_id;

GRANT SELECT ON public.event_raffle_winners_public TO authenticated, anon;


-- ── 5) Actualizar la vista community_events_public con counts útiles ────────
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


-- ── 6) Seed: Pablo (elchuker) como admin del Bar Citizen Ourense ────────────
UPDATE public.community_events
   SET admin_user_ids = ARRAY['64a3d786-fc21-471e-bf69-549f19fc8a5c'::uuid]
 WHERE slug = 'bar-citizen-ourense-2026-06';
