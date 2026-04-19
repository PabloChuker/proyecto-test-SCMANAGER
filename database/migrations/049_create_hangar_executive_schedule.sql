-- =============================================================================
-- Migracion: 049_create_hangar_executive_schedule
-- Modulo:    Hangar Ejecutivo — Reloj sincronizado del Hangar VIP in-game
-- Fecha:     2026-04-19
-- =============================================================================
--
-- CIG introdujo en 4.x un "Hangar Ejecutivo" (invasion point instance) que se
-- abre y cierra en ciclos fijos. La comunidad reverse-engineerea estos ciclos
-- contra el tiempo real del servidor. gstool.org publica los parametros; los
-- derivamos de la pagina (JS obfuscado) inspeccionando el DOM renderizado:
--
--   interval_minutes        = 185   (3h 5min entre aperturas)
--   open_duration_minutes   =  65   (ventana abierto)
--   closed_duration_minutes = 120   (ventana cerrado)
--   anchor_utc              = 2026-04-19T11:59:00Z  (ciclo #192 abre)
--
-- Formula:
--   m = ((now_ms - anchor_ms) / 60000) mod interval_minutes
--   isOpen = m < open_duration_minutes
--
-- Si CIG cambia el ciclo (hotfix, patch), insertamos una fila nueva con
-- effective_from = timestamp del cambio y el reloj usa la mas reciente.
--
-- Tabla read-only para usuarios (RLS select=all, insert/update/delete=service
-- role). Fuente citada en UI como "datos publicos: gstool.org".
-- =============================================================================

CREATE TABLE IF NOT EXISTS hangar_executive_schedule (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parametros del ciclo
  interval_minutes        INTEGER NOT NULL CHECK (interval_minutes > 0),
  open_duration_minutes   INTEGER NOT NULL CHECK (open_duration_minutes > 0),
  closed_duration_minutes INTEGER NOT NULL
                          GENERATED ALWAYS AS (interval_minutes - open_duration_minutes) STORED,

  -- Anchor: timestamp UTC conocido de apertura de ciclo
  anchor_utc              TIMESTAMPTZ NOT NULL,
  anchor_cycle_number     INTEGER,        -- numero de ciclo en esa apertura (informativo)

  -- Version del juego a la que corresponde el parametro
  game_version            TEXT NOT NULL,

  -- Vigencia
  effective_from          TIMESTAMPTZ NOT NULL DEFAULT now(),
  superseded_at           TIMESTAMPTZ,    -- si se reemplazo, cuando

  -- Metadata
  source                  TEXT NOT NULL DEFAULT 'gstool.org',
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hes_effective ON hangar_executive_schedule(effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_hes_active    ON hangar_executive_schedule(superseded_at) WHERE superseded_at IS NULL;

-- =============================================================================
-- RLS: lectura publica, escritura solo via service role
-- =============================================================================

ALTER TABLE hangar_executive_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hes_public_read" ON hangar_executive_schedule
  FOR SELECT USING (true);

-- INSERT/UPDATE/DELETE: sin policy => bloqueado para auth.uid() regulares.
-- Solo el service_role bypass-ea RLS por defecto.

-- =============================================================================
-- Seed inicial — parametros derivados de gstool.org el 2026-04-19
-- =============================================================================

INSERT INTO hangar_executive_schedule (
  interval_minutes,
  open_duration_minutes,
  anchor_utc,
  anchor_cycle_number,
  game_version,
  source,
  notes
) VALUES (
  185,
  65,
  '2026-04-19T11:59:00Z',
  192,
  '4.7.1-live',
  'gstool.org (DOM-derived)',
  'Parametros derivados del DOM renderizado en gstool.org/#hangar el 2026-04-19 ~10:30 UTC. Validar contra proximo ciclo 193 (13:04 UTC).'
)
ON CONFLICT DO NOTHING;
