import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client with service role for API routes.
 * Uses the anon key (safe for server-side DB queries via RLS or public tables).
 * Replaces the old Prisma client for all raw SQL / table queries.
 */
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
