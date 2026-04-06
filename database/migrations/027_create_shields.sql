-- =============================================================================
-- Migración: 027_create_shields
-- Módulo:    Naves y loadouts — Star Citizen
-- Generado por: scripts/import-shields.js
-- =============================================================================
--
-- DECISIONES DE DISEÑO
--
-- · id                   UUID canónico del juego (stdItem.UUID). PK natural.
--                        Los 66 registros canónicos tienen UUID válido; 0 nil UUIDs.
--
-- · grade / class        De stdItem.DescriptionData["Grade"] / ["Class"].
--                        Presentes en 64/66 registros. Nullable.
--                        grade ∈ {A, B, C, D, Bespoke}
--                        class ∈ {Military, Civilian, Industrial, Stealth, Competition}
--
-- · grade_number         stdItem.Grade (1–4). Campo numérico estándar del sistema.
--
-- · size                 stdItem.Size (0–4). El 0 son escudos de infraestructura.
--
-- · manufacturer_id      stdItem.Manufacturer.UUID. 1/66 registros tienen nil UUID
--                        → NULL. 9 fabricantes distintos. Sin FK forzada.
--
-- SHIELD CORE  (stdItem.Shield — presente en 66/66)
-- · pool_hp              stdItem.Shield.MaxShieldHealth  (máx HP del escudo)
-- · max_shield_regen     stdItem.Shield.MaxShieldRegen   (HP/s de regeneración)
-- · regen_time           stdItem.Shield.RegenerationTime (segundos para full regen)
-- · damaged_regen_delay  stdItem.Shield.DamagedDelay     (delay tras recibir daño)
-- · downed_regen_delay   stdItem.Shield.DownedDelay      (delay tras colapso total)
--
-- CONSUMO DE ENERGÍA  — DOS COLUMNAS SEPARADAS (66/66 con ambas)
-- · power_consumption_min  ← stdItem.ResourceNetwork.Usage.Power.Minimum  (1–5 pips)
-- · power_consumption_max  ← stdItem.ResourceNetwork.Usage.Power.Maximum  (1–6 pips)
--
--   Justificación: el JSON trae explícitamente Minimum y Maximum por separado.
--   No se usa una sola columna "power_consumption" porque la diferencia es
--   funcional: el mínimo es el consumo en reposo y el máximo el de carga completa.
--   Esta distinción es necesaria para la interfaz de gestión de energía.
--
--   Validado con FR-76: Power.Minimum = 1, Power.Maximum = 4.
--   11/66 escudos tienen min = max (valores reales, no artefacto de relleno).
--
--   NOTA GENERAL: este patrón debe aplicarse a cualquier componente cuyo JSON
--   contenga stdItem.ResourceNetwork.Usage.Power.Minimum y .Maximum. La columna
--   única "power_consumption" solo es adecuada cuando el JSON solo tiene un valor.
--
-- DISTORSIÓN  (stdItem.Distortion — presente en 66/66)
-- · distortion_shutdown_damage  stdItem.Distortion.Maximum       (10–30000)
-- · distortion_decay_delay      stdItem.Distortion.DecayDelay    (1.5–6 s)
-- · distortion_decay_rate       stdItem.Distortion.DecayRate     (/s)
-- · distortion_warning_ratio    stdItem.Distortion.WarningRatio  (constante 0.75;
--                               incluido porque Erkul lo muestra explícitamente)
-- · distortion_shutdown_time    stdItem.Distortion.ShutdownTime  (16.5–21 s;
--                               4 valores distintos → no constante)
--
-- EMISIÓN / VIDA
-- · em_max               stdItem.Emission.Em.Maximum  (0–3600; 66/66)
-- · health               stdItem.Durability.Health    (200–2250; 66/66)
--
-- RESISTENCIAS  (stdItem.Shield.Resistance.{Physical|Energy|Distortion})
-- · physical_resistance_min/max
-- · energy_resistance_min/max     (puede ser negativo: vulnerabilidad)
-- · distortion_resistance_min/max
--   Nota: Thermal/Biochemical/Stun constantes 0 en todos → descartadas.
--
-- ABSORCIONES  (stdItem.Shield.Absorption.{Physical|Energy|Distortion})
-- · physical_absorption_min/max
-- · energy_absorption_min/max
-- · distortion_absorption_min/max
--   Nota: Thermal/Biochemical/Stun constantes 1 en todos → descartadas.
--
-- DIMENSIONES
-- · mass                 stdItem.Mass
-- · width/height/length  stdItem.InventoryOccupancy.Dimensions.*
-- · scu                  stdItem.InventoryOccupancy.Volume.SCU
--
-- · price                NULL. ship-items.json no incluye datos de precio.
--
-- · raw_data             stdItem completo como jsonb de respaldo.
--
-- Campos descartados:
--   Resistance.Thermal / Biochemical / Stun   → constantes 0 en todos los registros
--   Absorption.Thermal / Biochemical / Stun   → constantes 1 en todos los registros
--   Distortion.RecoveryRatio                  → constante 0
--   Emission.Ir / Em.Minimum / Em.Decay       → Ir constante 0
--   ResourceNetwork.States / Repair / Generation → internos del motor
--   DimensionOverrides                        → override display/UI interno
--   Temperature                               → InternalTemperatureGeneration = 0
--   Interactions                              → strings de UI del juego
--
-- · Timestamps           No se añaden. Tabla de referencia estática del juego.
-- =============================================================================

create table if not exists shields (
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
  -- Shield core
  pool_hp                     numeric,
  max_shield_regen            numeric,
  regen_time                  numeric,
  damaged_regen_delay         numeric,
  downed_regen_delay          numeric,
  -- Consumo de energía (mínimo y máximo separados)
  power_consumption_min       numeric,
  power_consumption_max       numeric,
  -- Distorsión
  distortion_shutdown_damage  numeric,
  distortion_decay_delay      numeric,
  distortion_decay_rate       numeric,
  distortion_warning_ratio    numeric,
  distortion_shutdown_time    numeric,
  -- Emisión y vida
  em_max                      numeric,
  health                      numeric,
  -- Resistencias por tipo de daño
  physical_resistance_min     numeric,
  physical_resistance_max     numeric,
  energy_resistance_min       numeric,
  energy_resistance_max       numeric,
  distortion_resistance_min   numeric,
  distortion_resistance_max   numeric,
  -- Absorciones por tipo de daño
  physical_absorption_min     numeric,
  physical_absorption_max     numeric,
  energy_absorption_min       numeric,
  energy_absorption_max       numeric,
  distortion_absorption_min   numeric,
  distortion_absorption_max   numeric,
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
create index if not exists idx_shields_class_name
  on shields (class_name);

-- Filtrado por tamaño (criterio principal de compatibilidad).
create index if not exists idx_shields_size
  on shields (size);

-- Filtrado por clase de escudo (Military, Civilian, Stealth, etc.).
create index if not exists idx_shields_class
  on shields (class)
  where class is not null;

-- Filtrado por grado (A/B/C/D/Bespoke).
create index if not exists idx_shields_grade
  on shields (grade)
  where grade is not null;

-- Ordenar / filtrar por pool HP (columna clave de Erkul).
create index if not exists idx_shields_pool_hp
  on shields (pool_hp)
  where pool_hp is not null;

-- Búsquedas por fabricante.
create index if not exists idx_shields_manufacturer_id
  on shields (manufacturer_id)
  where manufacturer_id is not null;

-- Búsquedas en raw_data (jsonb) para campos no modelados.
create index if not exists idx_shields_raw_data_gin
  on shields using gin (raw_data)
  where raw_data is not null;
