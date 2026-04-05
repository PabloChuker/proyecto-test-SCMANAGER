-- =============================================================================
-- Migración: 025_create_scanners
-- Módulo:    Naves y loadouts — Star Citizen
-- Generado por: scripts/import-scanners.js
-- =============================================================================
--
-- DECISIONES DE DISEÑO
--
-- · id              UUID canónico del juego (stdItem.UUID = reference).
--                   Único en los registros fuente. PK natural.
--
-- · class_name      ClassName del juego, útil para cruzar con otros datasets.
--
-- · size / grade    Enteros de clasificación del ítem en el sistema del juego.
--
-- · mass / width / height / length
--                   Dimensiones físicas del componente. numeric para
--                   soportar valores decimales sin pérdida de precisión.
--
-- · manufacturer_id UUID del fabricante. Nullable: los Scanners actuales
--                   solo tienen "Unknown Manufacturer" (nil UUID → NULL).
--                   No se fuerza FK todavía: la tabla manufacturers podría
--                   no contener todos los UUIDs referenciados.
--
-- · Omitidos:       InventoryOccupancy, Ports, Durability → tablas separadas.
--                   DescriptionText → siempre vacío en este type.
--                   type → constante "Scanner", redundante.
--
-- · Timestamps:     No se añaden. Tabla de referencia estática del juego.
--
-- ESTADO DEL DATASET
-- Los 2 registros Scanner en ship-items.json son PLACEHOLDER sin datos reales.
-- La tabla se crea lista para cuando CIG publique los datos definitivos.
-- =============================================================================

create table if not exists scanners (
  id              uuid     primary key,
  class_name      text     not null,
  item_name       text,
  sub_type        text,
  size            integer,
  grade           integer,
  name            text     not null,
  description     text,
  mass            numeric,
  width           numeric,
  height          numeric,
  length          numeric,
  tags            text,
  classification  text,
  manufacturer_id uuid
);

-- Búsquedas por class_name (cruces con otros datasets del juego).
create index if not exists idx_scanners_class_name
  on scanners (class_name);

-- Búsquedas por size + grade (filtros habituales de componentes).
create index if not exists idx_scanners_size_grade
  on scanners (size, grade);

-- Búsquedas por fabricante (parcial: solo filas con manufacturer asignado).
create index if not exists idx_scanners_manufacturer_id
  on scanners (manufacturer_id)
  where manufacturer_id is not null;
