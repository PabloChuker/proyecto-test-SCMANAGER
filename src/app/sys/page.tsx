import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service-role";
import { sql } from "@/lib/db";
import SysPanel from "./SysPanel";

export const dynamic = "force-dynamic";

async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await getServiceClient()
    .from("admin_users")
    .select("role")
    .eq("user_id", userId)
    .single();
  return !!data;
}

async function getLastRsiSyncAt(): Promise<string | null> {
  try {
    const rows: any[] = await sql.unsafe(
      `SELECT MAX(synced_at) AS last_synced FROM ship_prices_canonical`,
      [],
    );
    const v = rows[0]?.last_synced ?? null;
    return v ? new Date(v).toISOString() : null;
  } catch {
    return null;
  }
}

export default async function SysPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const admin = await isAdmin(user.id);
  if (!admin) notFound();

  const { data: settings } = await getServiceClient()
    .from("system_settings")
    .select("key, value");

  const maintenance =
    settings?.find((s) => s.key === "maintenance_mode")?.value === "true";

  const initialLastRsiSyncAt = await getLastRsiSyncAt();

  return (
    <SysPanel
      initialMaintenance={maintenance}
      initialLastRsiSyncAt={initialLastRsiSyncAt}
    />
  );
}
