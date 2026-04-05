-- =============================================================================
-- Migración: 005_create_coolers
-- Módulo:    Naves y loadouts — Star Citizen
-- Generado por: scripts/import-coolers.js
-- =============================================================================
--
-- DECISIONES DE DISEÑO
--
-- · id                   UUID canónico del juego (stdItem.UUID). PK natural.
--                        Los 73 registros canónicos tienen UUID válido; 0 nil UUIDs.
--
-- · grade / class        De stdItem.DescriptionData["Grade"] / ["Class"].
--                        Presentes en 72/73 registros. Nullable.
--                        grade ∈ {A, B, C, D, Bespoke}
--                        class ∈ {Military, Civilian, Industrial, Stealth, Competition}
--
-- · grade_number         stdItem.Grade (1–4). Campo numérico estándar del sistema.
--
-- · size                 stdItem.Size (0–4). El 0 corresponde a coolers embebidos
--                        en naves específicas (Idris, Reclaimer, 890J, etc.).
--
-- · manufacturer_id      stdItem.Manufacturer.UUID.
--                        3/73 registros tienen nil UUID ("Unknown Manufacturer"):
--                          COOL_AEGS_S04_Idris_SCItem   → cooler embebido del Idris
--                          COOL_AEGS_S04_Reclaimer      → cooler embebido del Reclaimer
--                          COOL_ORIG_S04_890J_SCItem    → cooler embebido del 890J
--                        Todos tienen UUID nil → NULL en manufacturer_id.
--                        Sin FK forzada.
--
-- MÉTRICAS PRINCIPALES
-- · cooling_generation   stdItem.ResourceNetwork.Generation.Coolant  (14–102 /s)
--                        RUTA VALIDADA con Blizzard: RN.Generation.Coolant = 60 ✓
--                        Presente en 73/73 registros canónicos.
--
-- CONSUMO DE ENERGÍA  — DOS COLUMNAS SEPARADAS (73/73 con ambas)
-- · power_consumption_min  ← stdItem.ResourceNetwork.Usage.Power.Minimum  (1–5 pips)
-- · power_consumption_max  ← stdItem.ResourceNetwork.Usage.Power.Maximum  (1–6 pips)
--
--   Justificación: el JSON trae explícitamente Minimum y Maximum por separado.
--   No se usa una sola columna "power_consumption" porque la diferencia es
--   funcional: el mínimo es el consumo en reposo y el máximo el de carga completa.
--   Esta distinción es necesaria para la interfaz de gestión de energía.
--
--   Validado con Blizzard: Power.Minimum = 2, Power.Maximum = 5.
--   15/73 coolers tienen min = max (valores reales, no artefacto de relleno).
--
--   NOTA GENERAL: este patrón debe aplicarse a cualquier componente cuyo JSON
--   contenga stdItem.ResourceNetwork.Usage.Power.Minimum y .Maximum. La columna
--   única "power_consumption" solo es adecuada cuando el JSON solo tiene un valor.
--
-- · em_max               stdItem.Emission.Em.Maximum  (250–2970; 73/73)
--
-- · ir_max               stdItem.Emission.Ir  (2270–15000; 41 valores distintos)
--                        NO constante → columna funcional. Presente en 73/73.
--
-- · health               stdItem.Durability.Health  (73/73)
--
-- DISTORSIÓN  (stdItem.Distortion — presente en 73/73)
-- · distortion_shutdown_damage  stdItem.Distortion.Maximum
-- · distortion_decay_delay      stdItem.Distortion.DecayDelay  (1.5 / 3 / 4.5 / 6 s)
-- · distortion_decay_rate       stdItem.Distortion.DecayRate
-- · distortion_warning_ratio    stdItem.Distortion.WarningRatio  (constante 0.75;
--                               incluido porque Erkul lo muestra explícitamente)
-- · distortion_shutdown_time    stdItem.Distortion.ShutdownTime  (16.5–21 s;
--                               4 valores distintos → no constante)
--
-- DIMENSIONES  (stdItem.InventoryOccupancy — presente en 73/73)
-- · mass                 stdItem.Mass
-- · width/height/length  stdItem.InventoryOccupancy.Dimensions.*
-- · scu                  stdItem.InventoryOccupancy.Volume.SCU
--
-- · price                NULL. ship-items.json no incluye datos de precio.
--                        Columna reservada para futura integración.
--
-- · raw_data             stdItem completo como jsonb de respaldo.
--
-- Campos descartados:
--   subType                                   → constante "UNDEFINED" en todos
--   Distortion.RecoveryRatio                  → constante 0
--   Emission.Em.Minimum / Em.Decay            → sin valor diferencial por ítem
--   ResourceNetwork.States / Repair           → internos del motor
--   ResourceNetwork.Usage.Coolant.*           → mecánica interna de circulación
--   DimensionOverrides                        → override display/UI interno
--   Temperature                               → InternalTemperatureGeneration = 0
--   Interactions                              → strings de UI del juego
--
-- · Timestamps           No se añaden. Tabla de referencia estática del juego.
-- =============================================================================

create table if not exists coolers (
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
  -- Métrica principal
  cooling_generation          numeric,
  -- Consumo de energía (mínimo y máximo separados)
  power_consumption_min       numeric,
  power_consumption_max       numeric,
  -- Emisión e IR
  em_max                      numeric,
  ir_max                      numeric,
  -- Vida
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
create index if not exists idx_coolers_class_name
  on coolers (class_name);

-- Filtrado por tamaño (criterio principal de compatibilidad).
create index if not exists idx_coolers_size
  on coolers (size);

-- Filtrado por clase de cooler (Military, Civilian, Stealth, etc.).
create index if not exists idx_coolers_class
  on coolers (class)
  where class is not null;

-- Filtrado por grado (A/B/C/D/Bespoke).
create index if not exists idx_coolers_grade
  on coolers (grade)
  where grade is not null;

-- Ordenar / filtrar por generación de refrigeración (columna clave de Erkul).
create index if not exists idx_coolers_cooling_generation
  on coolers (cooling_generation)
  where cooling_generation is not null;

-- Búsquedas por fabricante.
create index if not exists idx_coolers_manufacturer_id
  on coolers (manufacturer_id)
  where manufacturer_id is not null;

-- Búsquedas en raw_data (jsonb) para campos no modelados.
create index if not exists idx_coolers_raw_data_gin
  on coolers using gin (raw_data)
  where raw_data is not null;
