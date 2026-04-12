-- =============================================================================
-- Migracion: 033_create_mining_sessions
-- Modulo:    Mining & Industry — Integracion Social
-- Fecha:     2026-04-12
-- =============================================================================
--
-- Sesiones de mineria. Reemplaza alfilo_wo_sessions de localStorage.
-- Vincula opcionalmente a una party para auto-cargar miembros.
-- =============================================================================

CREATE TABLE IF NOT EXISTS mining_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id      UUID,                                       -- FK logica a parties(id)
  owner_id      UUID NOT NULL,                              -- FK logica a auth.users(id)
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'completed', 'archived')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  notes         TEXT
);

CREATE INDEX IF NOT EXISTS idx_mining_sessions_owner  ON mining_sessions(owner_id);
CREATE INDEX IF NOT EXISTS idx_mining_sessions_party  ON mining_sessions(party_id);
CREATE INDEX IF NOT EXISTS idx_mining_sessions_status ON mining_sessions(status);

-- RLS
ALTER TABLE mining_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mining_sessions_select" ON mining_sessions
  FOR SELECT USING (
    owner_id = auth.uid()
    OR party_id IN (
      SELECT party_id FROM party_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "mining_sessions_insert" ON mining_sessions
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "mining_sessions_update" ON mining_sessions
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "mining_sessions_delete" ON mining_sessions
  FOR DELETE USING (owner_id = auth.uid());
