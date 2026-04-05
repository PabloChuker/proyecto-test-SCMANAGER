-- =============================================================================
-- Migración: 029_create_turrets
-- Módulo:    Naves y loadouts — Star Citizen
-- Generado por: scripts/import-turrets.js
-- =============================================================================
--
-- DECISIONES DE DISEÑO
--
-- · id                UUID canónico del juego (stdItem.UUID = reference). PK natural.
--
-- · class_name        ClassName del juego. Identifica la instancia de torreta
--                     específica de la nave
--                     (ej. AEGS_Redeemer_SCItem_Remote_Turret_Front).
--
-- · sub_type          Subtipo: GunTurret, MannedTurret, BallTurret, PDCTurret,
--                     TopTurret, MissileTurret, Utility, NoseMounted, CanardTurret,
--                     BottomTurret. 1 registro con subType="UNDEFINED" → NULL.
--
-- · size              Varía entre 1 y 12. Determina el arma máxima que puede montar.
--
-- · grade             Constante (1) en el dataset actual. Se incluye por consistencia
--                     con el esquema estándar de ítems.
--
-- · mass / width / height / length
--                     Dimensiones físicas con variación real entre registros.
--                     mass varía de 0 a 51.392.
--
-- · durability_health    HP de la torreta en combate. Rango: 1–1.000.000.
-- · durability_lifetime  Vida útil opcional (92/270 registros). Valores: 25, 720, 2160.
--
-- · ports             Array jsonb con los puertos de arma (1–17 por torreta).
--                     Contiene: PortName, Size, MinSize, MaxSize, Uneditable,
--                     EquippedItem (UUID del arma por defecto), Flags, Tags, Types.
--                     Índice GIN para consultas sobre contenido del array.
--
-- · movements         Array jsonb con la configuración de ejes de rotación yaw/pitch
--                     (stdItem.Turret.MovementList): velocidad, límites de ángulo,
--                     aceleración, tiempo de rampa.
--                     RotationStyle="SingleAxis" en todos los registros → omitido.
--
-- · manufacturer_id   UUID del fabricante. NULL para 16 registros con nil UUID.
--                     Sin FK forzada.
--
-- · description       stdItem.DescriptionText (texto limpio, sin header de metadatos).
--
-- · Campos descartados:
--     type / classification      → constante "Turret" / derivable de sub_type
--     tags / required_tags       → etiquetado interno del juego
--     RotationStyle              → constante "SingleAxis" en todos los registros
--     Salvageable / Repairable   → constantes (1) en todos los registros
--     Durability.Resistance      → umbrales siempre 0, sin valor diferenciador
--     Interactions               → strings de UI del juego
--     DescriptionData            → redundante con otros campos ya en la tabla
--     InventoryOccupancy / DimensionOverrides → display/UI interno
--     Distortion                 → 20% de registros, parámetros del motor
--     ResourceNetwork            → extremadamente raro (0.7%)
--     Seat                       → extremadamente raro (0.4%)
--
-- · Timestamps        No se añaden. Tabla de referencia estática del juego.
-- =============================================================================

create table if not exists turrets (
  id                    uuid     primary key,
  class_name            text     not null,
  item_name             text,
  name                  text     not null,
  description           text,
  sub_type              text,
  size                  integer,
  grade                 integer,
  mass                  numeric,
  width                 numeric,
  height                numeric,
  length                numeric,
  manufacturer_id       uuid,
  durability_health     numeric,
  durability_lifetime   numeric,
  ports                 jsonb,
  movements             jsonb
);

-- Búsquedas por class_name (cruce con loadouts y otros datasets).
create index if not exists idx_turrets_class_name
  on turrets (class_name);

-- Filtrado por subtipo (GunTurret, MannedTurret, PDCTurret, etc.).
create index if not exists idx_turrets_sub_type
  on turrets (sub_type)
  where sub_type is not null;

-- Filtrado por tamaño de torreta (determina qué armas acepta).
create index if not exists idx_turrets_size
  on turrets (size);

-- Búsquedas por fabricante (parcial: solo filas con fabricante asignado).
create index if not exists idx_turrets_manufacturer_id
  on turrets (manufacturer_id)
  where manufacturer_id is not null;

-- Consultas sobre puertos de arma (tamaño de puerto, arma equipada por defecto, etc.).
create index if not exists idx_turrets_ports_gin
  on turrets using gin (ports)
  where ports is not null;
