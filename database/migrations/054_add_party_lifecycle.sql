-- =============================================================================
-- Migration 054 — Party lifecycle (ended_at + last_seen_at)
--
-- Contexto (2026-04-20):
--   La tabla `parties` se creó manualmente en Supabase (no hay migración previa),
--   y hasta ahora no tenía forma de cerrar una party automáticamente. El flujo
--   actual de `/party/page.tsx` solo cierra la party si el líder hace clic
--   explícito en "Disolver"; cerrar la pestaña deja la row `status='active'`
--   eternamente, acumulando parties fantasma en el dashboard de stats y
--   confundiendo al prefill de `/mining`.
--
-- Esta migración:
--   1. Agrega `ended_at` (cuándo se cerró) y `last_seen_at` (último heartbeat
--      conocido del líder / cualquier miembro — útil para detectar stale).
--   2. Crea un índice compuesto para filtrar rápido por `(status, last_seen_at)`.
--   3. One-shot backfill: marca como `ended` todas las parties activas con
--      `created_at` anterior a `NOW() - 24h` y fija su `ended_at = created_at + 24h`
--      (histórico conservador; si alguien estuvo 24h+ sin cerrar, asumimos que
--      ya terminó). Preserva filas (no DELETE) para que los stats de actividades
--      mantengan la trazabilidad.
--
-- Semántica del status:
--   - 'active' → party abierta, al menos un miembro conectado recientemente
--   - 'ended'  → party cerrada, se conserva como historial (no borrar)
-- =============================================================================

BEGIN;

-- 1. Nuevas columnas (idempotente)
ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS ended_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Índice para barridos de staleness (status + last_seen_at)
CREATE INDEX IF NOT EXISTS idx_parties_status_last_seen
  ON public.parties (status, last_seen_at);

-- 3. Backfill: cerrar huérfanas (>24h activas) preservando historial.
--    Les fijamos `ended_at = created_at + 24h` como timestamp conservador.
UPDATE public.parties
SET
  status       = 'ended',
  ended_at     = COALESCE(ended_at, created_at + INTERVAL '24 hours'),
  last_seen_at = COALESCE(last_seen_at, created_at + INTERVAL '24 hours')
WHERE
  status = 'active'
  AND created_at < NOW() - INTERVAL '24 hours';

-- 4. Para las que siguen 'active' pero no tienen last_seen_at, darle un valor
--    inicial basado en created_at así el heartbeat arranca desde algo coherente.
UPDATE public.parties
SET last_seen_at = created_at
WHERE
  status = 'active'
  AND last_seen_at IS NULL;

COMMIT;
