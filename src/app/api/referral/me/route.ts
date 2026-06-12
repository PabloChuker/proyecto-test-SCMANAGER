// =============================================================================
// SC Labs — /api/referral/me (GET / POST / DELETE)
//
// Permite que el usuario logueado cargue/lea/borre SU código de referral del
// Star Citizen Referral Program. Una vez cargado entra al pool del rotador
// del header con weight=1 (baja exposición vs los devs que tienen weight=6).
//
//   GET    → devuelve el código del usuario actual (o null si no cargó)
//   POST   → upsert: { code: "STAR-XXXX-XXXX" }. Reemplaza el anterior.
//   DELETE → desactiva el código actual del usuario (no lo borra, soft).
//
// Validación:
//   • Formato STAR-XXXX-XXXX (4 alfanuméricos uppercase × 2 con guiones)
//   • UNIQUE(user_id) garantiza un solo código por user (mig 062)
//   • Conflicto de code (alguien más ya cargó el mismo) → 409
//
// Premium gating: por ahora abierto a cualquier user logueado (Pablo dijo
// "no lo limites por ahora, lo agregamos cuando programemos premium").
// Cuando llegue premium, agregar acá un check antes de permitir el upsert.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const CODE_RE = /^STAR-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

async function requireUserId(): Promise<string | NextResponse> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Auth required" },
      { status: 401 },
    );
  }
  return user.id;
}

// ── GET ──────────────────────────────────────────────────────────────────────
export async function GET() {
  const u = await requireUserId();
  if (typeof u !== "string") return u;
  try {
    const rows: any[] = await sql.unsafe(
      `SELECT code, owner_label, is_active, priority_weight, created_at
         FROM referral_codes
        WHERE user_id = $1
        LIMIT 1`,
      [u],
    );
    if (rows.length === 0) {
      return NextResponse.json({ code: null });
    }
    const r = rows[0];
    return NextResponse.json({
      code: r.code,
      ownerLabel: r.owner_label,
      isActive: r.is_active,
      priorityWeight: Number(r.priority_weight),
      createdAt: r.created_at,
    });
  } catch (err: any) {
    console.error("[referral/me GET]", err);
    return NextResponse.json(
      { error: "Failed", detail: err?.message ?? String(err) },
      { status: 500 },
    );
  }
}

// ── POST (upsert) ───────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const u = await requireUserId();
  if (typeof u !== "string") return u;
  try {
    const body = await request.json().catch(() => ({}));
    const codeRaw = String(body.code ?? "").trim().toUpperCase();
    if (!CODE_RE.test(codeRaw)) {
      return NextResponse.json(
        { error: "Invalid code format. Expected STAR-XXXX-XXXX." },
        { status: 400 },
      );
    }

    // Si el code ya existe pero NO es de este usuario, conflicto.
    // Sitio.13 (2026-06-12, SEGURIDAD): el check anterior exigía
    // `existing[0].user_id &&` — los códigos seed de los devs (user_id NULL,
    // ej. STAR-ZJVS-3FK4 de xolii) podían ser secuestrados por cualquier
    // usuario logueado. Ahora cualquier code pre-existente ajeno = 409.
    const existing: any[] = await sql.unsafe(
      `SELECT id, user_id FROM referral_codes WHERE code = $1 LIMIT 1`,
      [codeRaw],
    );
    if (existing.length > 0 && existing[0].user_id !== u) {
      return NextResponse.json(
        { error: "This referral code is already registered by another user." },
        { status: 409 },
      );
    }

    // Borrar cualquier código previo del usuario (para que el unique partial
    // index no choque cuando inserte uno nuevo)
    await sql.unsafe(
      `DELETE FROM referral_codes WHERE user_id = $1 AND code <> $2`,
      [u, codeRaw],
    );

    // Profile label opcional: tomamos display_name si existe.
    const profileRows: any[] = await sql.unsafe(
      `SELECT display_name FROM profiles WHERE id = $1 LIMIT 1`,
      [u],
    ).catch(() => []);
    const label = (profileRows[0]?.display_name ?? "").toString().slice(0, 40) || null;

    await sql.unsafe(
      `INSERT INTO referral_codes (code, owner_label, user_id, is_dev, priority_weight, is_active)
       VALUES ($1, $2, $3, false, 1, true)
       ON CONFLICT (code) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         owner_label = EXCLUDED.owner_label,
         is_active = true,
         updated_at = NOW()`,
      [codeRaw, label, u],
    );

    return NextResponse.json({ ok: true, code: codeRaw, ownerLabel: label });
  } catch (err: any) {
    console.error("[referral/me POST]", err);
    return NextResponse.json(
      { error: "Failed", detail: err?.message ?? String(err) },
      { status: 500 },
    );
  }
}

// ── DELETE (soft: marca inactivo) ───────────────────────────────────────────
export async function DELETE() {
  const u = await requireUserId();
  if (typeof u !== "string") return u;
  try {
    await sql.unsafe(
      `UPDATE referral_codes SET is_active = false, updated_at = NOW() WHERE user_id = $1`,
      [u],
    );
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[referral/me DELETE]", err);
    return NextResponse.json(
      { error: "Failed", detail: err?.message ?? String(err) },
      { status: 500 },
    );
  }
}
