-- =============================================================================
-- Migracion: 034_create_mining_members
-- Modulo:    Mining & Industry — Integracion Social
-- Fecha:     2026-04-12
-- =============================================================================
--
-- Miembros de una sesion minera, vinculados a profiles.
-- user_id NULL = invitado manual (no tiene cuenta SC Labs).
-- role determina el % sugerido; share_pct es el % real (editable).
-- =============================================================================

CREATE TABLE IF NOT EXISTS mining_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES mining_sessions(id) ON DELETE CASCADE,
  user_id         UUID,                                     -- NULL = guest/manual
  display_name    TEXT NOT NULL,
  avatar_url      TEXT,
  role            TEXT NOT NULL DEFAULT 'miner'
                  CHECK (role IN ('miner', 'escort', 'pilot', 'logistics', 'refiner', 'scout', 'custom')),
  share_pct       NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_from_party   BOOLEAN NOT NULL DEFAULT false,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un user registrado solo puede estar una vez por sesion
CREATE UNIQUE INDEX IF NOT EXISTS idx_mining_members_unique_user
  ON mining_members(session_id, user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mining_members_session ON mining_members(session_id);
CREATE INDEX IF NOT EXISTS idx_mining_members_user    ON mining_members(user_id);

-- RLS
ALTER TABLE mining_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mining_members_select" ON mining_members
  FOR SELECT USING (
    session_id IN (
      SELECT id FROM mining_sessions WHERE owner_id = auth.uid()
    )
    OR session_id IN (
      SELECT ms.id FROM mining_sessions ms
        JOIN party_members pm ON pm.party_id = ms.party_id
        WHERE pm.user_id = auth.uid()
    )
  );

CREATE POLICY "mining_members_insert" ON mining_members
  FOR INSERT WITH CHECK (
    session_id IN (
      SELECT id FROM mining_sessions WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "mining_members_update" ON mining_members
  FOR UPDATE USING (
    session_id IN (
      SELECT id FROM mining_sessions WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "mining_members_delete" ON mining_members
  FOR DELETE USING (
    session_id IN (
      SELECT id FROM mining_sessions WHERE owner_id = auth.uid()
    )
  );
