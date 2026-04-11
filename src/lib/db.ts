// =============================================================================
// SC LABS — Database Client
// Uses postgres.js for raw SQL queries against Supabase PostgreSQL.
// Import: import { sql } from '@/lib/db'
// Usage:  const rows = await sql`SELECT * FROM ships WHERE id = ${id}`;
//         const rows = await sql.unsafe(query, params);
// =============================================================================

import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ??
  process.env.DIRECT_URL ??
  "";

export const sql = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});
