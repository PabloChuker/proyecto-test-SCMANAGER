-- =============================================================================
-- Migración: 030_create_weapon_attachments
-- Módulo:    Naves y loadouts — Star Citizen
-- Generado por: scripts/import-weapon-attachments.js
-- =============================================================================
--
-- DECISIONES DE DISEÑO
--
-- · id              UUID canónico del juego (stdItem.UUID = reference). PK natural.
--                   Los 320 registros tienen UUID válido (0 nil UUIDs en stdItem.UUID).
--
-- · class_name      ClassName del juego. Codifica la variante y el arma compatible
--                   (ej. BEHR_JavelinBallisticCannon_Barrel_S7).
--                   Principal identificador mientras los nombres sean PLACEHOLDER.
--
-- · sub_type        Subtipo: Barrel | FiringMechanism | PowerArray | Ventilation.
--                   Distribución perfectamente uniforme: 80 registros por subtipo.
--
-- · size / grade    Rango de size: 1–10. Rango de grade: 1–7.
--                   Ambos varían y son el criterio principal de filtrado de juego.
--
-- · manufacturer_id UUID del fabricante. NULL para 194/320 registros (60.6%)
--                   que tienen nil UUID (todos mapean a "Unknown Manufacturer").
--                   Sin FK forzada.
--
-- · Sin description / dimensions / WeaponModifier
--                   description y DescriptionText están vacíos ("") en todos.
--                   width / height / length / mass son constantes (0.15 / 0).
--                   stdItem.WeaponModifier: todos los multiplicadores son 1.0 o 0
--                   en los 320 registros sin excepción. Sin valor de consulta.
--                   stdItem.WeaponAttachment: presente solo en Barrel (80 items),
--                   sus campos son constantes y redundantes con sub_type.
--                   stdItem.Durability: presente en solo 8 registros (2.5%),
--                   todos sus campos son constantes (Health=1).
--
-- ESTADO DEL DATASET
-- Los 320 registros WeaponAttachment tienen Name = "<= PLACEHOLDER =>".
-- Los datos estructurales (class_name, sub_type, size, grade) son válidos.
-- La tabla se crea lista para cuando CIG publique los nombres definitivos.
-- =============================================================================

create table if not exists weapon_attachments (
  id              uuid     primary key,
  class_name      text     not null,
  item_name       text,
  name            text     not null,
  sub_type        text,
  size            integer,
  grade           integer,
  manufacturer_id uuid
);

-- Búsquedas por class_name (cruce con armas y loadouts del juego).
create index if not exists idx_weapon_attachments_class_name
  on weapon_attachments (class_name);

-- Filtrado por subtipo (Barrel, FiringMechanism, PowerArray, Ventilation).
create index if not exists idx_weapon_attachments_sub_type
  on weapon_attachments (sub_type)
  where sub_type is not null;

-- Filtrado por tamaño y grado (criterio principal de compatibilidad con armas).
create index if not exists idx_weapon_attachments_size_grade
  on weapon_attachments (size, grade);

-- Búsquedas por fabricante (parcial: solo filas con fabricante asignado).
create index if not exists idx_weapon_attachments_manufacturer_id
  on weapon_attachments (manufacturer_id)
  where manufacturer_id is not null;
