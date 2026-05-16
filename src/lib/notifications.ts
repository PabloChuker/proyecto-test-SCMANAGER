import type { SupabaseClient } from "@supabase/supabase-js";

export type NotificationType =
  | "friend_request"
  | "party_invite"
  | "org_invite"
  // Fase E.3 — cuando alguien marca un entry del settlement ledger como pagado,
  // notificamos al receptor con "{from} te transfirió {amount} aUEC".
  | "payout_transferred"
  // Fase E.4 — cuando se crea un entry del settlement ledger (paid=false) con
  // to_user_id = usuario, notificamos con "Tenés un pago pendiente de {amount}
  // aUEC". Se marca as_read cuando se crea el payout_transferred asociado.
  | "payout_pending"
  // 2026-05-07 — cuando un admin de un evento registra a un usuario como
  // ganador del sorteo, le mandamos una notificacion al bell con link al
  // evento (?winner=<id>) para que entre y registre su email.
  | "raffle_won"
  // 2026-05-07 — cuando un user escanea el QR del evento y queda inscripto
  // (o se actualiza su attended=true), le confirmamos por el bell para que
  // tenga registro de su inscripcion sin depender de la pantalla post-QR.
  | "raffle_joined"
  // 2026-05-16 — cuando un leader de party invita a un usuario que comparte
  // organización, el endpoint /api/party/invite hace auto-join silencioso y
  // manda este tipo de notif INFORMATIVA (vs `party_invite` que es actionable).
  // El receptor ya está adentro de la party — la notif sólo le avisa.
  | "party_joined";

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
