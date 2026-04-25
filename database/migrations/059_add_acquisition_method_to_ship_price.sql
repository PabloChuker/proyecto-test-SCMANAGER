-- =============================================================================
-- Migración: 059_add_acquisition_method_to_ship_price
-- Módulo:    Naves — método de adquisición / referral program
-- Generado:  2026-04-25 (Pablo)
-- =============================================================================
--
-- CONTEXTO
--
-- CIG tiene un Referral Program (https://robertsspaceindustries.com/en/referral-program)
-- donde algunas naves SOLO se obtienen invitando a nuevos jugadores. Las
-- variantes referral aparecían en SC Labs con un precio USD que NO es real
-- (no se pueden comprar ni en tienda ni en el juego). Esta migración suma una
-- columna `acquisition_method` que permite marcar cómo se consigue cada nave
-- y que la UI muestre "REFERRAL PROGRAM" en lugar del precio cuando
-- corresponde.
--
-- Valores posibles:
--   STORE        Default. Se compra en pledge store / tienda. Muestra precio USD.
--   REFERRAL     Solo via Referral Program. Oculta precio.
--   IN_GAME      Solo se consigue jugando (ya cubierto por INGAME_ONLY_PATTERNS).
--   SUBSCRIBER   Premio de suscriptor (a futuro).
--   EXCLUSIVE    Concept ship / evento especial / one-off (a futuro).
--
-- Naves marcadas como REFERRAL en esta migración (4 — las confirmadas como
-- exclusivas del programa post-julio 2025):
--   AEGS_Idris_M          Aegis Idris-M
--   VNCL_Scythe           Vanduul Scythe (Captured)
--   VNCL_Stinger          Esperia Stinger
--   AEGS_Gladius_Dunlevy  Aegis Gladius Dunlevy
--
-- NOTA: el Freelancer MAX se ofrece en algunos tiers del referral pero la
-- nave también se vende en pledge store, así que NO se marca como REFERRAL.
-- =============================================================================

ALTER TABLE ship_price
  ADD COLUMN IF NOT EXISTS acquisition_method varchar(16) NOT NULL DEFAULT 'STORE';

COMMENT ON COLUMN ship_price.acquisition_method IS
  'Cómo se obtiene la nave: STORE (pledge), REFERRAL (programa de referidos), IN_GAME, SUBSCRIBER, EXCLUSIVE.';

-- Marcar las 4 naves del referral program. Si por algún motivo no existe
-- el ship_id correspondiente, los UPDATE simplemente no afectan filas
-- (no rompen la migración).
UPDATE ship_price sp
   SET acquisition_method = 'REFERRAL'
  FROM ships s
 WHERE sp.id = s.id
   AND s.class_name IN (
     'AEGS_Idris_M',
     'VNCL_Scythe',
     'VNCL_Stinger',
     'AEGS_Gladius_Dunlevy'
   );
