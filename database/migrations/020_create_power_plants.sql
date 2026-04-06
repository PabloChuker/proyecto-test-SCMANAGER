-- =============================================================================
-- Migración: 020_create_power_plants
-- Módulo:    Naves y loadouts — Star Citizen
-- Generado por: scripts/import-power_plants.js
-- =============================================================================
--
-- DECISIONES DE DISEÑO
--
-- · id                   UUID canónico del juego (stdItem.UUID). PK natural.
--                        Los 87 registros tienen UUID válido; 0 nil UUIDs.
--
-- · grade / class        De stdItem.DescriptionData["Grade"] / ["Class"].
--                        Presentes en 74/87 registros. Nullable.
--                        grade ∈ {A, B, C, D, Bespoke}
--                        class ∈ {Military, Industrial, Competition, Stealth, Civilian}
--
-- · grade_number         stdItem.Grade (1–4). Campo numérico estándar del sistema.
--
-- · size                 stdItem.Size (0–4). El 0 son plants de infraestructura.
--
-- · manufacturer_id      stdItem.Manufacturer.UUID. 15/87 registros tienen nil UUID
--                        → NULL. 9 fabricantes distintos. Sin FK forzada.
--
-- · power_generation     stdItem.ResourceNetwork.Generation.Power (10–10000).
--                        Fuente validada con JS-500. Presente en 82/87;
--                        los 5 sin dato son todos PLACEHOLDER y quedan excluidos.
--                        En registros canónicos: 77/77 tienen este dato.
--
-- · em_max               stdItem.Emission.Em.Maximum (0–14400; 34 valores distintos).
--                        Presente en 82/87 registros.
--
-- · health               stdItem.Durability.Health (1–420000; 56 valores distintos).
--                        Presente en 86/87 registros.
--
-- · distortion_shutdown_damage  stdItem.Distortion.Maximum (10–115000).
-- · distortion_decay_delay      stdItem.Distortion.DecayDelay (1.5–6 s).
-- · distortion_decay_rate       stdItem.Distortion.DecayRate (0.67–7666.67 /s).
-- · distortion_warning_ratio    stdItem.Distortion.WarningRatio (constante 0.75;
--                               incluido porque Erkul lo muestra explícitamente).
-- · distortion_shutdown_time    stdItem.Distortion.ShutdownTime (11.5–21 s).
--                               Tiempo hasta apagado al alcanzar Maximum.
--                               Todos los campos de distorsión: presentes en 82/87.
--
-- · mass                 stdItem.Mass (0–540000; 24 valores distintos).
-- · width/height/length  stdItem.InventoryOccupancy.Dimensions.* (todos presentes).
-- · scu                  stdItem.InventoryOccupancy.Volume.SCU (0–2.1).
--
-- · price                NULL. ship-items.json no incluye datos de precio.
--                        Columna reservada para futura integración con fuente
--                        de precios (API de mercado, uex.space, etc.).
--
-- · raw_data             stdItem completo como jsonb de respaldo.
--                        No sustituye a las columnas funcionales.
--
-- · Campos descartados:
--     subType / classification               → constante "Power"
--     Temperature.InternalTemperatureGeneration → constante 0
--     Interactions                           → strings de UI del juego (86/87)
--     DimensionOverrides                     → override display/UI interno
--     Emission.Ir / Em.Minimum / Em.Decay    → Ir constante 0, otros sin valor
--     Distortion.RecoveryRatio / PowerRatioAtMaxDistortion → constantes 0
--     ResourceNetwork.States / Repair        → datos internos del motor
--     stdItem.Tags                           → presentes en solo 5/87
--
-- · Timestamps           No se añaden. Tabla de referencia estática del juego.
-- =============================================================================

create table if not exists power_plants (
  -- Identidad
  id                          uuid     primary key,
  class_name                  text     not null,
  item_name                   text,
  name                        text     not null,
  description                 text,
  -- Fabricante
  manufacturer_id             uuid,
  -- Clasificación Erkul
  size                        integer,
  grade_number                integer,
  grade                       text,
  class                       text,
  -- Métricas principales
  power_generation            numeric,
  em_max                      numeric,
  health                      numeric,
  -- Distorsión
  distortion_shutdown_damage  numeric,
  distortion_decay_delay      numeric,
  distortion_decay_rate       numeric,
  distortion_warning_ratio    numeric,
  distortion_shutdown_time    numeric,
  -- Dimensiones y masa
  mass                        numeric,
  width                       numeric,
  height                      numeric,
  length                      numeric,
  scu                         numeric,
  -- Precio (fuente externa pendiente)
  price                       numeric,
  -- Respaldo técnico
  raw_data                    jsonb
);

-- Búsquedas por class_name (cruce con loadouts y naves).
create index if not exists idx_power_plants_class_name
  on power_plants (class_name);

-- Filtrado por tamaño (criterio principal de compatibilidad).
create index if not exists idx_power_plants_size
  on power_plants (size);

-- Filtrado por clase de planta (Military, Civilian, Stealth, etc.).
create index if not exists idx_power_plants_class
  on power_plants (class)
  where class is not null;

-- Filtrado por grado (A/B/C/D/Bespoke).
create index if not exists idx_power_plants_grade
  on power_plants (grade)
  where grade is not null;

-- Ordenar / filtrar por generación de energía (columna clave de Erkul).
create index if not exists idx_power_plants_power_generation
  on power_plants (power_generation)
  where power_generation is not null;

-- Búsquedas por fabricante.
create index if not exists idx_power_plants_manufacturer_id
  on power_plants (manufacturer_id)
  where manufacturer_id is not null;

-- Búsquedas en raw_data (jsonb) para campos no modelados.
create index if not exists idx_power_plants_raw_data_gin
  on power_plants using gin (raw_data)
  where raw_data is not null;
