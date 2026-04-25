-- =============================================================================
-- Migración: 062_referral_codes_unique_user
-- Módulo:    Referral program — un usuario = un código activo
-- Generado:  2026-04-25 (Pablo)
-- =============================================================================
--
-- Cuando los usuarios cargan su propio código de referral desde /profile,
-- queremos que sólo puedan tener UN código asociado a su user_id (no varios
-- duplicados). Los códigos de devs (chuker / xolii / garnok) tienen
-- user_id=NULL y por eso usamos un partial unique index.
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS referral_codes_user_id_unique
  ON referral_codes (user_id)
  WHERE user_id IS NOT NULL;
