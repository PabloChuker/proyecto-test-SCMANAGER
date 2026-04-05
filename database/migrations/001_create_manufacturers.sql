-- =============================================================================
-- Migración: 001_create_manufacturers
-- Módulo:    Naves y loadouts — Star Citizen
-- Generado por: scripts/import-manufacturers.js
-- =============================================================================
--
-- DECISIONES DE DISEÑO
--
-- · id          UUID canónico del juego (campo `reference` del JSON).
--               Es el único identificador 100% único en los registros fuente.
--
-- · name        Nombre del fabricante. NOT NULL. Tipo text (convención Supabase/PG).
--
-- · code        Shortcode del juego (ej. "RSI", "DRAK"). NULLABLE.
--               NO se aplica UNIQUE porque el dataset origen contiene colisiones
--               conocidas (ej. "MIS" asignado a Mirai y a MISC).
--               Se indexa parcialmente para rendimiento en búsquedas.
--
-- · description Texto narrativo. NULLABLE (~10% de fabricantes no tienen descripción).
--
-- · Timestamps  No se añaden: tabla de referencia estática del juego.
--               Convención del proyecto: solo donde haya auditoría real.
-- =============================================================================

create table if not exists manufacturers (
  id          uuid  primary key,
  name        text  not null,
  code        text,
  description text
);

-- Índice parcial sobre code (solo filas con code asignado).
create index if not exists idx_manufacturers_code
  on manufacturers (code)
  where code is not null;

-- Índice sobre name para búsquedas y futuros joins desde ships.
create index if not exists idx_manufacturers_name
  on manufacturers (name);
