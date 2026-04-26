"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { supabaseService } from "@/lib/supabase/service-role";

async function getAdminSession() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabaseService
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

  const { data } = await supabaseService
    .from("system_settings")
    .select("key, value");

  return data ?? [];
}

export async function setMaintenanceMode(enabled: boolean) {
  const session = await getAdminSession();
  if (!session) throw new Error("Unauthorized");

  await supabaseService
    .from("system_settings")
    .update({ value: String(enabled) })
    .eq("key", "maintenance_mode");
}
