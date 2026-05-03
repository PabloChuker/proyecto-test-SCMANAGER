-- =============================================================================
-- Migración 067 — ship_prices_canonical
-- =============================================================================
-- Origen: tabla extraída de https://starcitizen.tools/List_of_pledge_vehicles
-- por Pablo (xlsx con 246 ships, mayo 2026).
--
-- ¿Por qué tabla nueva en vez de extender ship_price?
--   · Datos crudos del Wiki — fuente externa que se actualiza periódicamente.
--   · ship_price es derivada (la usa el solver); no quiero acoplarla a un
--     schema externo que puede cambiar.
--   · Permite re-cargar todo con un script idempotente sin riesgo de pisar
--     datos de runtime que setean otros componentes.
--
-- Uso primario (Fase CCU.5b):
--   El solver `/api/ccu/calculate` mode "Esperar y Ahorrar" consulta
--   warbond_usd ACÁ primero (valor real del Wiki) antes de caer al cap
--   teórico del 10% (ccu-engine getMaxWarbondDiscount). Esto soluciona los
--   86 outliers donde el descuento real es > 10% (RAFT 42%, Cyclone 27%, etc).
--
-- ship_id nullable: el match contra `ships(id)` lo intenta el script de
-- carga via fuzzy name. Si no matchea, el row queda con ship_id=null pero
-- ship_name conserva el dato. Después un MERGE manual lo reconcilia.
-- =============================================================================

CREATE TABLE IF NOT EXISTS ship_prices_canonical (
  id                       SERIAL PRIMARY KEY,
  ship_name                TEXT        NOT NULL UNIQUE,
  -- ship_id sin FK formal: ships tiene PK compuesta (id, game_version),
  -- y este lookup canónico es version-agnostic. El match se hace soft-link
  -- por el script de carga; la integridad referencial NO es necesaria
  -- porque la tabla es derived data del Wiki (re-cargable cuando sea).
  ship_id                  UUID        NULL,
  manufacturer             TEXT,
  career                   TEXT,
  role                     TEXT,
  size                     TEXT,
  production_state         TEXT,        -- 'Flight ready' | 'In concept' | 'Active production' | etc.
  pledge_availability      TEXT,        -- 'Always available' | 'Time-limited sales' | 'Quantity-limited sales' | etc.

  -- Precios USD ──────────────────────────────────────────────────────────────
  pledge_usd               NUMERIC(10,2),       -- standalone price actual
  orig_pledge_usd          NUMERIC(10,2),       -- standalone price cuando salió en concept
  warbond_usd              NUMERIC(10,2),       -- warbond price actual (LA COLUMNA CLAVE)
  orig_warbond_usd         NUMERIC(10,2),       -- warbond price cuando salió en concept

  -- Loaner + economía in-game ────────────────────────────────────────────────
  loaner                   TEXT,                -- nave de cortesía durante desarrollo (62/246 tienen)
  avg_purchase_auec        NUMERIC(20,2),       -- precio promedio in-game en aUEC
  avg_daily_rental_auec    NUMERIC(20,2),       -- costo de renta in-game

  -- Metadata ─────────────────────────────────────────────────────────────────
  concept_date             DATE,                -- fecha en que se anunció en concept
  source                   TEXT DEFAULT 'starcitizen.tools',
  synced_at                TIMESTAMPTZ DEFAULT NOW()
);

-- Lookup rápido cuando el solver hace JOIN contra ships(id).
CREATE INDEX IF NOT EXISTS idx_spc_ship_id ON ship_prices_canonical(ship_id) WHERE ship_id IS NOT NULL;

-- El solver filtra por warbond_usd IS NOT NULL — index parcial reduce tamaño.
CREATE INDEX IF NOT EXISTS idx_spc_warbond_not_null ON ship_prices_canonical(warbond_usd) WHERE warbond_usd IS NOT NULL;

-- Búsqueda fuzzy por nombre (case-insensitive prefix).
CREATE INDEX IF NOT EXISTS idx_spc_ship_name_lower ON ship_prices_canonical(LOWER(ship_name));

COMMENT ON TABLE ship_prices_canonical IS
  'Precios canónicos de ships (fuente: Star Citizen Wiki). Carga via script load_rsi_prices_canonical.mjs.';
COMMENT ON COLUMN ship_prices_canonical.warbond_usd IS
  'Warbond price REAL del Wiki. El solver CCU lo prefiere sobre el cap teórico del 10% MSRP.';
COMMENT ON COLUMN ship_prices_canonical.ship_id IS
  'Link contra ships.id si el script encontró match por nombre. NULL = unlinked, requiere reconciliación manual.';
