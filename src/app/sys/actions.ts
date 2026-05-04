"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service-role";
import { sql } from "@/lib/db";
import { runRsiSync, type RsiSyncResult } from "@/lib/rsi-sync";

async function getAdminSession() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await getServiceClient()
    .from("admin_users")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (!data) return null;
  return { user, role: data.role };
}

export async function getSystemSettings() {
  const session = await getAdminSession();
  if (!session) return null;

  const { data } = await getServiceClient()
    .from("system_settings")
    .select("key, value");

  return data ?? [];
}

export async function setMaintenanceMode(enabled: boolean) {
  const session = await getAdminSession();
  if (!session) throw new Error("Unauthorized");

  await getServiceClient()
    .from("system_settings")
    .update({ value: String(enabled) })
    .eq("key", "maintenance_mode");
}

// ── Sync RSI (CB.6, manual trigger) ──────────────────────────────────────
// Reemplazo del Vercel cron por un pulsador manual en /sys. Más barato (no
// gasta function invocations en runs automáticos) y le da a Pablo control de
// CUÁNDO refrescar (ej: justo después de un drop de IAE).

export interface RsiSyncResponse {
  ok: boolean;
  result?: RsiSyncResult;
  error?: string;
}

export async function runRsiSyncAction(): Promise<RsiSyncResponse> {
  const session = await getAdminSession();
  if (!session) {
    return { ok: false, error: "Unauthorized" };
  }
  try {
    const result = await runRsiSync(sql);
    return { ok: true, result };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "unknown" };
  }
}

/** Devuelve el último synced_at de ship_prices_canonical para display. */
export async function getLastRsiSyncAt(): Promise<{ lastSyncedAt: string | null }> {
  const session = await getAdminSession();
  if (!session) return { lastSyncedAt: null };
  try {
    const rows: any[] = await sql.unsafe(
      `SELECT MAX(synced_at) AS last_synced FROM ship_prices_canonical`,
      [],
    );
    const v = rows[0]?.last_synced ?? null;
    return { lastSyncedAt: v ? new Date(v).toISOString() : null };
  } catch {
    return { lastSyncedAt: null };
  }
}
