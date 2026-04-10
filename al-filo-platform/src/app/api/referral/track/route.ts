export const dynamic = "force-dynamic";
// =============================================================================
// SC LABS — POST /api/referral/track
//
// Registra una visita en la tabla referral_visits cuando un usuario llega al
// sitio con ?ref=<code>. No bloquea la navegación: si algo falla, solo lo
// logueamos y devolvemos 200 igualmente.
//
// Body (JSON):
//   {
//     ref: string,          // código del referral (2-32 chars, alfanumérico)
//     landingPath?: string  // path donde cayó el visitante
//   }
//
// Rate limiting: confiamos en que el cliente solo dispara esto una vez por
// sesión (lo guardamos en localStorage), pero igualmente sanitizamos input.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import {
  parsePostBody,
  sanitizeString,
  secureHeaders,
} from "@/lib/api-security";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function isValidRefCode(s: string): boolean {
  return /^[a-z0-9_-]{2,32}$/.test(s);
}

export async function POST(req: NextRequest) {
  try {
    const body = await parsePostBody<{
      ref?: string;
      landingPath?: string;
    }>(req);

    const rawRef = String(body?.ref ?? "").toLowerCase().trim();
    if (!rawRef || !isValidRefCode(rawRef)) {
      return NextResponse.json(
        { ok: false, error: "invalid ref code" },
        { status: 400, headers: secureHeaders() }
      );
    }

    const landingPath = sanitizeString(body?.landingPath ?? "/", 500);
    const userAgent = sanitizeString(req.headers.get("user-agent") ?? "", 500);
    const httpReferer = sanitizeString(req.headers.get("referer") ?? "", 500);
    const country = sanitizeString(
      req.headers.get("x-vercel-ip-country") ?? "",
      8
    );

    // Intentar obtener el user autenticado si existe
    let userId: string | null = null;
    try {
      const supabase = await createServerSupabaseClient();
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
    } catch {
      // Si falla la auth no rompemos el tracking
    }

    await sql`
      INSERT INTO referral_visits (
        ref_code,
        landing_path,
        http_referer,
        user_agent,
        country,
        user_id
      ) VALUES (
        ${rawRef},
        ${landingPath || null},
        ${httpReferer || null},
        ${userAgent || null},
        ${country || null},
        ${userId}
      )
    `;

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: secureHeaders() }
    );
  } catch (err) {
    console.error("[referral/track] error:", err);
    // No queremos que esto afecte la UX: devolvemos 200 silenciosamente.
    return NextResponse.json(
      { ok: false },
      { status: 200, headers: secureHeaders() }
    );
  }
}
