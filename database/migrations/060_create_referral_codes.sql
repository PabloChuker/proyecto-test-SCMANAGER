-- =============================================================================
-- Migración: 060_create_referral_codes
-- Módulo:    Referral program — códigos de referidos para rotador del Header
-- Generado:  2026-04-25 (Fase S — Pablo)
-- =============================================================================
--
-- CONTEXTO
--
-- En SC Labs queremos exponer aleatoriamente códigos de referidos del Star
-- Citizen Referral Program (RSI) en el header de la web. Los nuevos jugadores
-- que se registren con uno de estos códigos reciben 50000 UEC y el dueño
-- del código recibe puntos de referral en su ladder.
--
-- El expositor del header rota entre los códigos activos. La probabilidad
-- de que un código aparezca está ponderada por `priority_weight` (default
-- 1). Los códigos de devs arrancan con weight 6 (interpretación de
-- "+500% de probabilidad" = 100% base + 500% extra = 600% = 6x).
--
-- A futuro, cuando entre el flujo "premium", los usuarios premium podrán
-- cargar su propio código desde /profile y se irán balanceando los pesos.
--
-- COLUMNAS
--
--   code              STAR-XXXX-XXXX (único). El usuario lo puede copiar tal cual.
--   owner_label       Nombre legible del dueño (chuker, xolii, etc.) — opcional,
--                     solo informativo en el panel admin.
--   user_id           FK a auth.users si el código pertenece a un usuario
--                     registrado. NULL para los devs (no son usuarios típicos).
--   is_dev            Marca códigos de "core team" para distinguirlos en panels.
--   priority_weight   Peso de exposición. 1 = baseline (premium normal).
--                     6 = devs (+500% extra sobre baseline).
--   is_active         Permite desactivar un código sin borrarlo (ej. cuando
--                     el dueño se queda sin slots de recruits o pide bajarlo).
-- =============================================================================

CREATE TABLE IF NOT EXISTS referral_codes (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text          NOT NULL UNIQUE,
  owner_label     text,
  user_id         uuid,
  is_dev          boolean       NOT NULL DEFAULT false,
  priority_weight numeric       NOT NULL DEFAULT 1,
  is_active       boolean       NOT NULL DEFAULT true,
  created_at      timestamptz   NOT NULL DEFAULT NOW(),
  updated_at      timestamptz   NOT NULL DEFAULT NOW(),
  CONSTRAINT referral_codes_code_format_chk
    CHECK (code ~ '^STAR-[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  CONSTRAINT referral_codes_priority_chk
    CHECK (priority_weight > 0)
);

CREATE INDEX IF NOT EXISTS referral_codes_active_idx
  ON referral_codes (is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS referral_codes_user_idx
  ON referral_codes (user_id) WHERE user_id IS NOT NULL;

COMMENT ON TABLE  referral_codes                 IS 'Códigos de referral del Star Citizen Referral Program. Expuestos aleatoriamente en el header de SC Labs con ponderación priority_weight.';
COMMENT ON COLUMN referral_codes.priority_weight IS '1 = baseline (premium user). 6 = dev (+500% sobre baseline). Mayor peso = mayor probabilidad de salir en la rotación.';

-- ── Seed inicial: 2 códigos de los devs (Pablo / chuker + Xolii) ─────────────
-- weight=6 representa "+500%" (1 + 500% = 600% = 6x más probable que baseline).
INSERT INTO referral_codes (code, owner_label, is_dev, priority_weight)
VALUES
  ('STAR-NX5M-LHLQ', 'chuker', true, 6),
  ('STAR-ZJVS-3FK4', 'xolii',  true, 6)
ON CONFLICT (code) DO UPDATE SET
  owner_label     = EXCLUDED.owner_label,
  is_dev          = EXCLUDED.is_dev,
  priority_weight = EXCLUDED.priority_weight,
  updated_at      = NOW();
