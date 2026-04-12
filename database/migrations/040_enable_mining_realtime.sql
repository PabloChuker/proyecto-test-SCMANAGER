-- =============================================================================
-- SC LABS — Enable Supabase Realtime on mining tables
--
-- Adds mining tables to the supabase_realtime publication so that party
-- members can see live updates on work orders, inventory, and crew changes.
-- =============================================================================

-- Add tables to supabase_realtime publication (idempotent: ignores if already added)
ALTER PUBLICATION supabase_realtime ADD TABLE mining_work_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE mining_inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE mining_movements;
ALTER PUBLICATION supabase_realtime ADD TABLE mining_members;
ALTER PUBLICATION supabase_realtime ADD TABLE mining_expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE mining_crew_payouts;

-- NOTE: If you get "relation already member of publication" errors, that's fine.
-- It means the table was already enabled. You can safely ignore those.
--
-- To run this in Supabase SQL Editor:
--   1. Go to SQL Editor in the Supabase dashboard
--   2. Paste this file and run
--   3. Errors about "already member" can be ignored
