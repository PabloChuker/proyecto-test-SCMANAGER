// =============================================================================
// SC LABS — /api/mining/distributions
//
// POST  — Crear o recalcular una distribucion de stop (cobrado)
// GET   — Listar distribuciones (con filtros opcionales)
// PATCH — Actualizar status (p.ej. pending → distributed → archived)
//
// Flujo POST:
//   1. Resuelve WOs del stop + trade participants + mining members.
//   2. Computa gross/buy_cost/expenses/net desde las WOs.
//   3. Llama a calculateSplit() para obtener los pending_payouts.
//   4. Si ya existia una pending distribution para (route_group_id, stop_index),
//      la reemplaza (borra sus payouts + updatea la row) — "va a recalcular".
//   5. Inserta mining_stop_distribution_wos y mining_pending_payouts.
//
// La escritura al settlement ledger ocurre cuando el status pasa a
// 'distributed' — eso se maneja en PATCH (fase D.4).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  calculateSplit,
  type MiningMemberInput,
  type TradeParticipantInput,
  type SplitMode,
  type MiningRole,
  type TradeRole,
} from "@/lib/distribution-calc";

// -- Helpers ----------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizeMiningRole(raw: unknown): MiningRole {
  const v = String(raw ?? "miner").toLowerCase();
  const allowed: MiningRole[] = ["miner", "escort", "pilot", "logistics", "refiner", "scout", "custom"];
  return (allowed as string[]).includes(v) ? (v as MiningRole) : "custom";
}

function normalizeTradeRole(raw: unknown): TradeRole {
  const v = String(raw ?? "crew").toLowerCase();
  const allowed: TradeRole[] = ["pilot", "escort", "scout", "financier", "mule", "crew", "other"];
  return (allowed as string[]).includes(v) ? (v as TradeRole) : "other";
}

// -- GET --------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sp = request.nextUrl.searchParams;
    const routeGroupId = sp.get("route_group_id");
    const miningSessionId = sp.get("mining_session_id");
    const status = sp.get("status");
    const id = sp.get("id");

    let query = supabase
      .from("mining_stop_distributions")
      .select(`
        *,
        mining_pending_payouts(*),
        mining_stop_distribution_wos(work_order_id)
      `)
      .order("triggered_at", { ascending: false });

    if (id) query = query.eq("id", id);
    if (routeGroupId) query = query.eq("route_group_id", routeGroupId);
    if (miningSessionId) query = query.eq("mining_session_id", miningSessionId);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// -- POST -------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const {
      route_group_id,
      stop_index,
      route_total_stops,
      mining_session_id,        // opcional — para compra-venta pura puede ser null
      work_order_ids,           // UUID[] — WOs que caen en este stop
      split_mode,               // "equitable" | "manual_pct" | "role_weight"
      manual_shares,            // { identityKey: pct } — solo manual_pct
      role_weight_overrides,    // opcional
      notes,
      // Overrides opcionales de numeros (si el cliente quiere forzar el prorrateo)
      gross_auec: gross_override,
      buy_cost_auec: buy_override,
      expenses_auec: expenses_override,
    } = body ?? {};

    // -- Validacion basica --------------------------------------------------
    if (!route_group_id || typeof route_group_id !== "string") {
      return NextResponse.json({ error: "route_group_id required" }, { status: 400 });
    }
    if (!Number.isFinite(stop_index) || stop_index < 1) {
      return NextResponse.json({ error: "stop_index must be >= 1" }, { status: 400 });
    }
    if (!Number.isFinite(route_total_stops) || route_total_stops < 1) {
      return NextResponse.json({ error: "route_total_stops must be >= 1" }, { status: 400 });
    }
    if (!Array.isArray(work_order_ids) || work_order_ids.length === 0) {
      return NextResponse.json({ error: "work_order_ids must be a non-empty array" }, { status: 400 });
    }
    const mode: SplitMode = split_mode === "manual_pct" || split_mode === "role_weight"
      ? split_mode
      : "equitable";

    // -- Cargar WOs + participantes + expenses ------------------------------
    const { data: wos, error: woErr } = await supabase
      .from("trade_work_orders")
      .select(`
        id, party_id, owner_id,
        scu_bought, scu_sold,
        buy_price_per_scu, sell_price_per_scu,
        total_buy, total_sell, total_expenses, net_profit,
        trade_wo_participants(*),
        trade_wo_expenses(*)
      `)
      .in("id", work_order_ids);

    if (woErr) throw woErr;
    if (!wos || wos.length === 0) {
      return NextResponse.json({ error: "No work orders found for given ids" }, { status: 404 });
    }

    // Suma agregada sobre las WOs del stop
    let gross = 0;
    let buyCost = 0;
    let expenses = 0;
    let tradeParty: string | null = null;

    for (const w of wos as any[]) {
      const wSell = Number(w.total_sell) || (Number(w.scu_sold || 0) * Number(w.sell_price_per_scu || 0));
      const wBuy = Number(w.total_buy) || (Number(w.scu_bought || 0) * Number(w.buy_price_per_scu || 0));
      const wExp = Number(w.total_expenses) || 0;
      gross += wSell;
      buyCost += wBuy;
      expenses += wExp;
      if (!tradeParty && w.party_id) tradeParty = w.party_id;
    }

    gross = round2(gross);
    buyCost = round2(buyCost);
    expenses = round2(expenses);

    // Overrides del cliente (permite prorrateo multi-stop en el futuro)
    if (Number.isFinite(gross_override)) gross = round2(Number(gross_override));
    if (Number.isFinite(buy_override)) buyCost = round2(Number(buy_override));
    if (Number.isFinite(expenses_override)) expenses = round2(Number(expenses_override));

    const net = round2(gross - buyCost - expenses);

    // -- Cargar participantes de trade agregando por WO ---------------------
    const tradeParticipants: TradeParticipantInput[] = [];
    for (const w of wos as any[]) {
      const rows = (w.trade_wo_participants || []) as any[];
      for (const p of rows) {
        tradeParticipants.push({
          id: p.id,
          userId: p.user_id || null,
          displayName: p.display_name || "Unnamed",
          avatarUrl: p.avatar_url ?? null,
          role: normalizeTradeRole(p.role),
          rolePct: p.role_pct ?? undefined,
          contributionUec: p.contribution_uec ?? undefined,
        });
      }
    }

    // -- Cargar miembros de mining ------------------------------------------
    let miningMembers: MiningMemberInput[] = [];
    let miningParty: string | null = null;
    if (mining_session_id) {
      const { data: session, error: sErr } = await supabase
        .from("mining_sessions")
        .select("id, party_id")
        .eq("id", mining_session_id)
        .single();
      if (sErr) throw sErr;
      miningParty = session?.party_id ?? null;

      const { data: mm, error: mErr } = await supabase
        .from("mining_members")
        .select("id, user_id, display_name, avatar_url, role")
        .eq("session_id", mining_session_id);
      if (mErr) throw mErr;
      miningMembers = (mm || []).map((m: any) => ({
        id: m.id,
        userId: m.user_id || null,
        displayName: m.display_name || "Unnamed",
        avatarUrl: m.avatar_url ?? null,
        role: normalizeMiningRole(m.role),
      }));
    }

    // -- Calcular split -----------------------------------------------------
    const split = calculateSplit({
      netAuec: net,
      splitMode: mode,
      miningMembers,
      tradeParticipants,
      manualShares: manual_shares ?? undefined,
      roleWeightOverrides: role_weight_overrides ?? undefined,
    });

    // -- Upsert distribution: si ya existia pending para (route, stop)
    //    → borramos payouts y reemplazamos numeros/rows. "Va a recalcular."
    const { data: existing, error: exErr } = await supabase
      .from("mining_stop_distributions")
      .select("id")
      .eq("route_group_id", route_group_id)
      .eq("stop_index", stop_index)
      .eq("status", "pending")
      .maybeSingle();
    if (exErr) throw exErr;

    let distributionId: string;

    if (existing?.id) {
      // Limpiar payouts + WOs puente viejos
      await supabase.from("mining_pending_payouts").delete().eq("distribution_id", existing.id);
      await supabase.from("mining_stop_distribution_wos").delete().eq("distribution_id", existing.id);

      const { data: upd, error: updErr } = await supabase
        .from("mining_stop_distributions")
        .update({
          route_total_stops,
          mining_session_id: mining_session_id || null,
          mining_party_id: miningParty,
          trade_party_id: tradeParty,
          gross_auec: gross,
          buy_cost_auec: buyCost,
          expenses_auec: expenses,
          net_auec: net,
          split_mode: mode,
          notes: notes ?? null,
        })
        .eq("id", existing.id)
        .select()
        .single();
      if (updErr) throw updErr;
      distributionId = upd.id;
    } else {
      const { data: ins, error: insErr } = await supabase
        .from("mining_stop_distributions")
        .insert({
          route_group_id,
          stop_index,
          route_total_stops,
          mining_session_id: mining_session_id || null,
          mining_party_id: miningParty,
          trade_party_id: tradeParty,
          gross_auec: gross,
          buy_cost_auec: buyCost,
          expenses_auec: expenses,
          net_auec: net,
          split_mode: mode,
          status: "pending",
          triggered_by: user.id,
          notes: notes ?? null,
        })
        .select()
        .single();
      if (insErr) throw insErr;
      distributionId = ins.id;
    }

    // -- Insertar puente WOs ------------------------------------------------
    const woBridge = work_order_ids.map((woId: string) => ({
      distribution_id: distributionId,
      work_order_id: woId,
    }));
    if (woBridge.length > 0) {
      const { error: bErr } = await supabase
        .from("mining_stop_distribution_wos")
        .insert(woBridge);
      if (bErr) throw bErr;
    }

    // -- Insertar pending payouts ------------------------------------------
    if (split.rows.length > 0) {
      const payoutRows = split.rows.map((r) => ({
        distribution_id: distributionId,
        user_id: r.userId,
        display_name: r.displayName,
        avatar_url: r.avatarUrl,
        source: r.source,
        mining_member_id: r.miningMemberId,
        trade_participant_id: r.tradeParticipantId,
        pending_auec: r.pendingAuec,
        share_pct: r.sharePct,
        role_label: r.rolesLabel,
        weight_value: r.weightValue,
        status: "pending",
      }));
      const { error: pErr } = await supabase
        .from("mining_pending_payouts")
        .insert(payoutRows);
      if (pErr) throw pErr;
    }

    // -- Devolver la distribution hidratada ---------------------------------
    const { data: hydrated } = await supabase
      .from("mining_stop_distributions")
      .select(`
        *,
        mining_pending_payouts(*),
        mining_stop_distribution_wos(work_order_id)
      `)
      .eq("id", distributionId)
      .single();

    return NextResponse.json(
      {
        data: hydrated,
        split: {
          mode: split.mode,
          total: split.total,
          warnings: split.warnings,
        },
      },
      { status: existing?.id ? 200 : 201 },
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// -- PATCH ------------------------------------------------------------------
//
// Solo permite modificar metadatos seguros: status, notes.
// La escritura al settlement ledger cuando status='distributed' se hace en
// fase D.4 (endpoint dedicado o flag en este mismo PATCH).

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { id, status, notes } = body ?? {};
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const updates: Record<string, any> = {};
    if (status && ["pending", "distributed", "archived"].includes(status)) {
      updates.status = status;
      if (status === "distributed") updates.distributed_at = new Date().toISOString();
    }
    if (notes !== undefined) updates.notes = notes;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "nothing to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("mining_stop_distributions")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    // Si marcamos como distributed, flipeamos los pending_payouts tambien.
    if (updates.status === "distributed") {
      await supabase
        .from("mining_pending_payouts")
        .update({ status: "distributed", distributed_at: updates.distributed_at })
        .eq("distribution_id", id);
    }

    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// -- DELETE -----------------------------------------------------------------
//
// Solo borra si esta en status='pending'. Una vez distributed la deuda quedo
// registrada en el ledger y no se puede borrar sin una reversa explicita.

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { data: dist, error: dErr } = await supabase
      .from("mining_stop_distributions")
      .select("id, status")
      .eq("id", id)
      .single();
    if (dErr) throw dErr;
    if (!dist) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (dist.status !== "pending") {
      return NextResponse.json(
        { error: `cannot delete distribution with status '${dist.status}'` },
        { status: 409 },
      );
    }

    await supabase.from("mining_pending_payouts").delete().eq("distribution_id", id);
    await supabase.from("mining_stop_distribution_wos").delete().eq("distribution_id", id);
    const { error } = await supabase.from("mining_stop_distributions").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
