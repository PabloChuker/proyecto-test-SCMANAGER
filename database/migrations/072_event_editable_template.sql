-- =============================================================================
-- SC LABS — 072: community_events editables (templating)
--
-- Convierte community_events en una plantilla que cualquier organizador puede
-- adaptar a su Bar Citizen / evento: logo, tagline, ubicación con Google Maps,
-- redes sociales y links libres tipo "linktree".
-- =============================================================================

-- Recrear la vista para soportar columnas nuevas (ver migración 071).
DROP VIEW IF EXISTS public.community_events_public;

ALTER TABLE public.community_events
  ADD COLUMN IF NOT EXISTS logo_url        TEXT,
  ADD COLUMN IF NOT EXISTS tagline         TEXT CHECK (tagline IS NULL OR char_length(tagline) <= 200),
  ADD COLUMN IF NOT EXISTS google_maps_url TEXT,
  ADD COLUMN IF NOT EXISTS discord_url     TEXT,
  ADD COLUMN IF NOT EXISTS twitter_url     TEXT,
  ADD COLUMN IF NOT EXISTS website_url     TEXT,
  -- Lista libre de { label, url } para links extra (ej. "Patreon", "Twitch", "Tienda merch")
  ADD COLUMN IF NOT EXISTS custom_links    JSONB NOT NULL DEFAULT '[]'::jsonb;


-- Recrear la vista pública con los counts (igual que en 071) — ahora incluye
-- las columnas nuevas porque hace SELECT e.*.
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


-- ── RLS: admins del evento pueden UPDATE el evento mismo ───────────────────
DROP POLICY IF EXISTS community_events_admin_update ON public.community_events;
CREATE POLICY community_events_admin_update ON public.community_events
  FOR UPDATE TO authenticated
  USING (public.is_event_admin(id))
  WITH CHECK (public.is_event_admin(id));


-- ── Seed: cargar logo + Google Maps + tagline + redes para el Bar Citizen ──
UPDATE public.community_events
   SET logo_url        = '/events/bar-citizen-ourense-logo.png',
       tagline         = 'Encuentro presencial de la comunidad de Star Citizen — recorrido por bares emblemáticos del centro histórico.',
       google_maps_url = 'https://www.google.com/maps/search/?api=1&query=A+Casita+do+Pulpo+Ourense+Galicia',
       discord_url     = NULL,
       twitter_url     = NULL,
       website_url     = NULL,
       custom_links    = '[]'::jsonb,
       updated_at      = NOW()
 WHERE slug = 'bar-citizen-ourense-2026-06';
