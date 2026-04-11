import type { SupabaseClient } from "@supabase/supabase-js";

export type NotificationType = "friend_request" | "party_invite" | "org_invite";

interface SendNotificationParams {
  supabase: SupabaseClient;
  recipientId: string;
  fromUserId: string;
  type: NotificationType;
  title: string;
  message?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Send a notification to a user.
 * Call from client-side — RLS ensures from_user_id must match auth.uid().
 */
export async function sendNotification({
  supabase,
  recipientId,
  fromUserId,
  type,
  title,
  message,
  link,
  metadata,
}: SendNotificationParams) {
  const { error } = await supabase.from("notifications").insert({
    user_id: recipientId,
    from_user_id: fromUserId,
    type,
    title,
    message: message ?? null,
    link: link ?? null,
    metadata: metadata ?? {},
  });

  if (error) {
    console.error("Failed to send notification:", error.message);
  }
}
