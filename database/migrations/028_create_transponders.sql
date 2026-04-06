-- =============================================================================
-- Migración: 028_create_transponders
-- Módulo:    Naves y loadouts — Star Citizen
-- Generado por: scripts/import-transponders.js
-- =============================================================================
--
-- DECISIONES DE DISEÑO
--
-- · id              UUID canónico del juego (stdItem.UUID = reference). PK natural.
--
-- · class_name      ClassName del juego. Codifica la variante del transponder
--                   (ej. TRNS_Transponder_EM_100, TRNS_Transponder_EM_3000).
--
-- · name / description
--                   Campos de display. Actualmente vacíos (PLACEHOLDER) en todos
--                   los registros del dataset.
--
-- · size / grade    Enteros de clasificación estándar del sistema de ítems.
--                   Ambos son 1 en los registros actuales.
--
-- · manufacturer_id UUID del fabricante. Siempre NULL en el dataset actual
--                   (nil UUID 00000000-...). Incluido para consistencia de esquema.
--                   Sin FK forzada.
--
-- · Sin columnas de stats específicas de Transponder
--                   El JSON no contiene sub-objeto stdItem.Transponder en ningún
--                   registro actual. Los classNames sugieren emisión EM (EM_100,
--                   EM_3000) pero NO se generan columnas a partir de esa inferencia.
--                   Las columnas de stats se añadirán en una migración posterior
--                   cuando el dataset incluya los datos reales.
--
-- · Timestamps      No se añaden. Tabla de referencia estática del juego.
--
-- ESTADO DEL DATASET
-- Los 3 registros Transponder actuales son PLACEHOLDER o test_*.
-- La tabla se crea lista para cuando CIG publique datos definitivos.
-- =============================================================================

create table if not exists transponders (
  id              uuid  primary key,
  class_name      text  not null,
  item_name       text,
  name            text  not null,
  description     text,
  size            integer,
  grade           integer,
  manufacturer_id uuid
);

-- Búsquedas por class_name (cruce con otros datasets del juego).
create index if not exists idx_transponders_class_name
  on transponders (class_name);

-- Búsquedas por size + grade (filtros estándar de componentes).
create index if not exists idx_transponders_size_grade
  on transponders (size, grade);

-- Búsquedas por fabricante (parcial: solo filas con fabricante asignado).
create index if not exists idx_transponders_manufacturer_id
  on transponders (manufacturer_id)
  where manufacturer_id is not null;
