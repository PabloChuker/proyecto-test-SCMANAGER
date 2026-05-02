-- =============================================================================
-- Migración: 054_weapon_mining_compat_cols
-- Módulo:    Mining lasers — unificación con weapon_mining
-- =============================================================================
--
-- Contexto: el código (API + LoadoutBuilder) lee algunas columnas que el
-- seed original de `mining_lasers` tenía pero que `weapon_mining` (tabla
-- más rica creada en migración 044) no incluyó: resistance, instability,
-- throttle_rate, throttle_min, heat_output, module_slots.
--
-- Esta migración agrega esas columnas a `weapon_mining` para que el catálogo
-- pueda migrar los consumers desde `mining_lasers` a `weapon_mining` sin
-- perder datos. El populate se hace en database/seeds/weapon_mining_compat_patch.sql
-- matcheando por prefix del name (mining_lasers "Arbor MH1" →
-- weapon_mining "Arbor MH1 Mining Laser" + sus variantes por ship).
--
-- · resistance        Resistencia del material que rompe el laser (0..1 aprox).
-- · instability       Inestabilidad que induce al rock (0..100).
-- · throttle_rate     Velocidad de variación del throttle.
-- · throttle_min      Throttle mínimo usable (0..1).
-- · heat_output       Calor generado por disparo sostenido.
-- · module_slots      Número de accesorios/módulos que acepta el laser (0..3).
--                     CRÍTICO para el LoadoutBuilder: resolveChildSlots usa
--                     este valor para decidir cuántos módulo-slots generar
--                     dinámicamente bajo el laser equipado.
-- =============================================================================

alter table weapon_mining
  add column if not exists resistance    double precision,
  add column if not exists instability   double precision,
  add column if not exists throttle_rate double precision,
  add column if not exists throttle_min  double precision,
  add column if not exists heat_output   double precision,
  add column if not exists module_slots  integer;

comment on column weapon_mining.module_slots
  is 'Número de slots de accesorio/módulo del laser (0..3). Usado por LoadoutBuilder.resolveChildSlots para generar slots hijos dinámicos.';
