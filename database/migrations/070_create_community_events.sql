-- =============================================================================
-- SC LABS — 070: community_events + event_registrations + event_pois +
--              event_announcements
--
-- Sistema de eventos comunitarios — primer caso de uso: Bar Citizen Ourense
-- (sponsor 6-jun-2026). Soporta:
--   · catálogo de eventos (futuro-proof, no hardcoded)
--   · registro de asistentes
--   · sorteo (raffle entry, opt-in dentro de la registración)
--   · POIs del mapa (route waypoints + meeting points)
--   · anuncios del organizador
-- =============================================================================

-- ── 1) community_events ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_events (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                     TEXT NOT NULL UNIQUE,
  name                     TEXT NOT NULL,
  description              TEXT,
  event_date               TIMESTAMPTZ NOT NULL,
  location                 TEXT,
  sponsor_name             TEXT,
  sponsor_url              TEXT,
  banner_url               TEXT,
  map_image_url            TEXT,
  map_image_aspect_ratio   NUMERIC,
  is_active                BOOLEAN NOT NULL DEFAULT true,
  registration_open        BOOLEAN NOT NULL DEFAULT true,
  raffle_active            BOOLEAN NOT NULL DEFAULT true,
  raffle_prize_description TEXT,
  raffle_rules             TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_events_slug   ON public.community_events(slug);
CREATE INDEX IF NOT EXISTS idx_community_events_active ON public.community_events(is_active, event_date DESC);

ALTER TABLE public.community_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS community_events_read ON public.community_events;
CREATE POLICY community_events_read ON public.community_events
  FOR SELECT TO authenticated, anon USING (true);

-- Solo el postgres user (vía migrations / scripts) puede modificar eventos.
-- No habilitamos INSERT/UPDATE/DELETE para authenticated/anon.


-- ── 2) event_registrations ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_registrations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID NOT NULL REFERENCES public.community_events(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name        TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  rsi_handle          TEXT CHECK (rsi_handle IS NULL OR char_length(rsi_handle) <= 80),
  attendance_intent   TEXT NOT NULL DEFAULT 'confirmed'
                       CHECK (attendance_intent IN ('confirmed', 'maybe', 'no')),
  notes               TEXT CHECK (notes IS NULL OR char_length(notes) <= 500),
  raffle_entry        BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_registrations_event   ON public.event_registrations(event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_registrations_user    ON public.event_registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_event_registrations_raffle  ON public.event_registrations(event_id) WHERE raffle_entry = true;

ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;

-- Read pública: que los usuarios vean cuántos van y los displaynames.
DROP POLICY IF EXISTS event_registrations_read ON public.event_registrations;
CREATE POLICY event_registrations_read ON public.event_registrations
  FOR SELECT TO authenticated, anon USING (true);

-- Insert: solo en nombre propio.
DROP POLICY IF EXISTS event_registrations_insert ON public.event_registrations;
CREATE POLICY event_registrations_insert ON public.event_registrations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Update: solo own (para cambiar attendance_intent / raffle_entry / notes).
DROP POLICY IF EXISTS event_registrations_update ON public.event_registrations;
CREATE POLICY event_registrations_update ON public.event_registrations
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS event_registrations_delete ON public.event_registrations;
CREATE POLICY event_registrations_delete ON public.event_registrations
  FOR DELETE TO authenticated USING (auth.uid() = user_id);


-- ── 3) event_pois (puntos de interés del mapa) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_pois (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES public.community_events(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  poi_type        TEXT NOT NULL DEFAULT 'route'
                   CHECK (poi_type IN ('start', 'route', 'meeting', 'end', 'reference')),
  order_index     INT NOT NULL DEFAULT 0,
  -- Coordenadas en porcentaje sobre la imagen del mapa (más portable que
  -- píxeles absolutos — permite que la imagen se reescale).
  map_x_percent   NUMERIC(5, 2) CHECK (map_x_percent >= 0 AND map_x_percent <= 100),
  map_y_percent   NUMERIC(5, 2) CHECK (map_y_percent >= 0 AND map_y_percent <= 100),
  -- Geolocalización real (lat/lng) para "llevar al usuario" via Google Maps,
  -- Apple Maps, etc. Opcional — si no está, sólo se ve en el mapa de la pizza.
  latitude        NUMERIC(10, 6),
  longitude       NUMERIC(10, 6),
  icon            TEXT,                -- emoji o URL chiquita
  external_url    TEXT,                -- ej. la web del bar
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_pois_event ON public.event_pois(event_id, order_index);

ALTER TABLE public.event_pois ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_pois_read ON public.event_pois;
CREATE POLICY event_pois_read ON public.event_pois
  FOR SELECT TO authenticated, anon USING (true);


-- ── 4) event_announcements ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES public.community_events(id) ON DELETE CASCADE,
  title       TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  posted_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_pinned   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_announcements_event ON public.event_announcements(event_id, is_pinned DESC, created_at DESC);

ALTER TABLE public.event_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_announcements_read ON public.event_announcements;
CREATE POLICY event_announcements_read ON public.event_announcements
  FOR SELECT TO authenticated, anon USING (true);


-- ── 5) Vista pública con conteos para el listing ────────────────────────────
CREATE OR REPLACE VIEW public.community_events_public
WITH (security_invoker = false) AS
SELECT
  e.*,
  (SELECT COUNT(*) FROM public.event_registrations r
    WHERE r.event_id = e.id AND r.attendance_intent = 'confirmed') AS confirmed_count,
  (SELECT COUNT(*) FROM public.event_registrations r
    WHERE r.event_id = e.id AND r.attendance_intent = 'maybe')     AS maybe_count,
  (SELECT COUNT(*) FROM public.event_registrations r
    WHERE r.event_id = e.id AND r.raffle_entry = true)             AS raffle_entries_count
FROM public.community_events e
WHERE e.is_active = true;

GRANT SELECT ON public.community_events_public TO authenticated, anon;


-- ── 6) Seed inicial: Bar Citizen Ourense (6 jun 2026) ───────────────────────
-- Slug estable: 'bar-citizen-ourense-2026-06'
INSERT INTO public.community_events (
  slug, name, description, event_date, location,
  sponsor_name, sponsor_url, banner_url, map_image_url,
  is_active, registration_open, raffle_active,
  raffle_prize_description, raffle_rules
) VALUES (
  'bar-citizen-ourense-2026-06',
  'Bar Citizen Ourense',
  'Encuentro presencial de la comunidad de Star Citizen en Ourense, Galicia. Recorrido por bares emblemáticos del centro histórico con punto de partida en A Casita do Pulpo y final en Trampitan. Sorteo de naves de CIG entre los participantes registrados.',
  '2026-06-06 18:00:00+00',
  'Ourense, Galicia (España)',
  'Bar Citizen Ourense',
  null,
  '/events/bar-citizen-ourense-map.png',
  '/events/bar-citizen-ourense-map.png',
  true, true, true,
  'Sorteo de naves donadas por Cloud Imperium Games (CIG) a la comunidad asistente al evento. Se anunciará el premio exacto en el lugar.',
  '1) Registrate desde SC Labs antes del evento. 2) Marcá la casilla "Participo del sorteo" al registrarte. 3) Asistí presencialmente al evento. 4) El sorteo se realizará al final del recorrido en Trampitan. 5) Los ganadores recibirán los códigos de regalo en su email registrado.'
)
ON CONFLICT (slug) DO UPDATE SET
  name                       = EXCLUDED.name,
  description                = EXCLUDED.description,
  event_date                 = EXCLUDED.event_date,
  location                   = EXCLUDED.location,
  sponsor_name               = EXCLUDED.sponsor_name,
  banner_url                 = EXCLUDED.banner_url,
  map_image_url              = EXCLUDED.map_image_url,
  raffle_prize_description   = EXCLUDED.raffle_prize_description,
  raffle_rules               = EXCLUDED.raffle_rules,
  updated_at                 = NOW();


-- ── 7) Seed POIs del mapa ───────────────────────────────────────────────────
-- Coordenadas en % aproximadas leídas de la imagen
-- (1436x2048; eje Y va de arriba=0 a abajo=100).

DO $$
DECLARE
  v_event_id UUID;
BEGIN
  SELECT id INTO v_event_id FROM public.community_events
   WHERE slug = 'bar-citizen-ourense-2026-06';

  IF v_event_id IS NULL THEN
    RAISE NOTICE 'Event not found, skipping POIs';
    RETURN;
  END IF;

  -- Limpiar POIs previos del mismo evento (idempotente)
  DELETE FROM public.event_pois WHERE event_id = v_event_id;

  INSERT INTO public.event_pois (event_id, name, description, poi_type, order_index, map_x_percent, map_y_percent, icon) VALUES
    (v_event_id, 'A Casita do Pulpo',         'Punto de partida del recorrido.',                    'start',     1, 75, 27, '🐙'),
    (v_event_id, 'Demamaluis - Depapaluis',   'Segunda parada.',                                    'route',     2, 80, 36, '👬'),
    (v_event_id, 'Acio',                       'Tercera parada — vinos.',                            'route',     3, 85, 45, '🍇'),
    (v_event_id, 'O Enxebre',                  'Cuarta parada — taberna típica.',                    'route',     4, 85, 53, '🏠'),
    (v_event_id, 'A Casa do Pulpo',            'Punto medio del recorrido.',                         'meeting',   5, 50, 50, '🐙'),
    (v_event_id, 'Druida',                     'Sexta parada — cocido.',                             'route',     6, 45, 70, '🥣'),
    (v_event_id, 'Bar Mundial',                'Séptima parada — barriles.',                         'route',     7, 30, 75, '🍺'),
    (v_event_id, 'Trampitan',                  'Punto final del recorrido y sorteo de naves.',       'end',       8, 45, 80, '🎩'),
    -- POIs de referencia (no son parte de la ruta, pero ubican al asistente)
    (v_event_id, 'Fuente Fría',                'Punto de referencia.',                               'reference', 0, 50, 30, '⛲'),
    (v_event_id, 'Ataranzana',                 'Punto de referencia.',                               'reference', 0, 55, 38, '⛵');
END $$;
