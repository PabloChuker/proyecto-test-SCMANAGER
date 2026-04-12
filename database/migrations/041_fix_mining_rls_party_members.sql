-- =============================================================================
-- Migracion: 041_fix_mining_rls_party_members
-- Modulo:    Mining & Industry — RLS fix for party members
-- Fecha:     2026-04-12
-- =============================================================================
--
-- Problem: INSERT/UPDATE/DELETE policies on mining_work_orders only allow
-- the session owner. Party members could SEE orders but not CREATE them.
-- This migration fixes the policies so all party members can fully interact.
-- =============================================================================

-- ─── Drop old restrictive policies ──────────────────────────────────────────
DROP POLICY IF EXISTS "wo_insert" ON mining_work_orders;
DROP POLICY IF EXISTS "wo_update" ON mining_work_orders;
DROP POLICY IF EXISTS "wo_delete" ON mining_work_orders;

-- ─── Recreate with party member access ──────────────────────────────────────

-- INSERT: session owner OR party member can create work orders
CREATE POLICY "wo_insert" ON mining_work_orders FOR INSERT WITH CHECK (
  session_id IN (SELECT id FROM mining_sessions WHERE owner_id = auth.uid())
  OR session_id IN (
    SELECT ms.id FROM mining_sessions ms
      JOIN party_members pm ON pm.party_id = ms.party_id
      WHERE pm.user_id = auth.uid()
  )
);

-- UPDATE: session owner OR party member can update work orders
CREATE POLICY "wo_update" ON mining_work_orders FOR UPDATE USING (
  session_id IN (SELECT id FROM mining_sessions WHERE owner_id = auth.uid())
  OR session_id IN (
    SELECT ms.id FROM mining_sessions ms
      JOIN party_members pm ON pm.party_id = ms.party_id
      WHERE pm.user_id = auth.uid()
  )
);

-- DELETE: session owner OR party member can delete work orders
CREATE POLICY "wo_delete" ON mining_work_orders FOR DELETE USING (
  session_id IN (SELECT id FROM mining_sessions WHERE owner_id = auth.uid())
  OR session_id IN (
    SELECT ms.id FROM mining_sessions ms
      JOIN party_members pm ON pm.party_id = ms.party_id
      WHERE pm.user_id = auth.uid()
  )
);

-- ─── Also fix mining_inventory policies ─────────────────────────────────────
-- (same issue: party members need INSERT/UPDATE/DELETE access)

DROP POLICY IF EXISTS "inv_insert" ON mining_inventory;
DROP POLICY IF EXISTS "inv_update" ON mining_inventory;
DROP POLICY IF EXISTS "inv_delete" ON mining_inventory;

CREATE POLICY "inv_insert" ON mining_inventory FOR INSERT WITH CHECK (
  session_id IN (SELECT id FROM mining_sessions WHERE owner_id = auth.uid())
  OR session_id IN (
    SELECT ms.id FROM mining_sessions ms
      JOIN party_members pm ON pm.party_id = ms.party_id
      WHERE pm.user_id = auth.uid()
  )
);

CREATE POLICY "inv_update" ON mining_inventory FOR UPDATE USING (
  session_id IN (SELECT id FROM mining_sessions WHERE owner_id = auth.uid())
  OR session_id IN (
    SELECT ms.id FROM mining_sessions ms
      JOIN party_members pm ON pm.party_id = ms.party_id
      WHERE pm.user_id = auth.uid()
  )
);

CREATE POLICY "inv_delete" ON mining_inventory FOR DELETE USING (
  session_id IN (SELECT id FROM mining_sessions WHERE owner_id = auth.uid())
  OR session_id IN (
    SELECT ms.id FROM mining_sessions ms
      JOIN party_members pm ON pm.party_id = ms.party_id
      WHERE pm.user_id = auth.uid()
  )
);
