"use client";

// =============================================================================
// SC LABS — Mining Crew Panel
//
// Displays and manages mining session members: roles, share %, add/remove,
// auto-balance, lock/unlock shares. Shows ledger accumulations per person.
// =============================================================================

import { useState } from "react";
import { useMiningStore } from "@/store/useMiningStore";
import {
  ROLE_DEFAULTS,
  type MiningRole,
  type MiningMember,
} from "@/types/mining";

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtAuec(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toFixed(0);
}

const ROLES = Object.entries(ROLE_DEFAULTS) as [MiningRole, (typeof ROLE_DEFAULTS)[MiningRole]][];

// ═════════════════════════════════════════════════════════════════════════════

export default function CrewPanel() {
  const {
    activeSessionId,
    members,
    lockedShareIds,
    ledger,
    isLoading,
    addMember,
    updateMember,
    removeMember,
    rebalanceShares,
    lockShare,
    unlockShare,
    fetchLedger,
  } = useMiningStore();

  const [addName, setAddName] = useState("");
  const [addRole, setAddRole] = useState<MiningRole>("miner");
  const [showAddForm, setShowAddForm] = useState(false);
  const [showLedger, setShowLedger] = useState(false);
  const [editingShareId, setEditingShareId] = useState<string | null>(null);
  const [editShareValue, setEditShareValue] = useState("");

  if (!activeSessionId) {
    return (
      <div className="text-center py-12 text-zinc-600 text-sm">
        Select a mining session first to manage crew.
      </div>
    );
  }

  const totalPct = members.reduce((sum, m) => sum + m.share_pct, 0);

  const handleAddMember = async () => {
    if (!addName.trim() || !activeSessionId) return;
    await addMember(activeSessionId, addName.trim(), null, null, addRole);
    setAddName("");
    setAddRole("miner");
    setShowAddForm(false);
  };

  const handleRoleChange = async (member: MiningMember, newRole: MiningRole) => {
    await updateMember(member.id, { role: newRole });
    rebalanceShares();
  };

  const handleShareEdit = (member: MiningMember) => {
    setEditingShareId(member.id);
    setEditShareValue(member.share_pct.toFixed(1));
  };

  const handleShareSave = async (memberId: string) => {
    const val = parseFloat(editShareValue);
    if (isNaN(val) || val < 0 || val > 100) return;
    lockShare(memberId);
    await updateMember(memberId, { share_pct: val });
    rebalanceShares();
    setEditingShareId(null);
  };

  const handleToggleLedger = () => {
    if (!showLedger) fetchLedger(true);
    setShowLedger((p) => !p);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-zinc-200 tracking-wide font-mono">
          Crew ({members.length})
        </h2>
        <div className="flex gap-2">
          <button
            onClick={handleToggleLedger}
            className={`px-3 py-1.5 rounded text-[10px] font-bold tracking-wider transition-colors ${
              showLedger
                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-zinc-200"
            }`}
          >
            Ledger
          </button>
          <button
            onClick={rebalanceShares}
            className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-bold text-zinc-400 hover:text-amber-400 hover:border-amber-500/30 transition-colors"
          >
            Auto-Balance
          </button>
          <button
            onClick={() => setShowAddForm((p) => !p)}
            className="px-3 py-1.5 bg-amber-500 text-zinc-900 rounded text-[10px] font-bold hover:bg-amber-400 transition-colors"
          >
            + Add
          </button>
        </div>
      </div>

      {/* Share total indicator */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              Math.abs(totalPct - 100) < 0.5
                ? "bg-emerald-500"
                : totalPct > 100
                  ? "bg-red-500"
                  : "bg-amber-500"
            }`}
            style={{ width: `${Math.min(totalPct, 100)}%` }}
          />
        </div>
        <span
          className={`text-xs font-mono font-bold ${
            Math.abs(totalPct - 100) < 0.5
              ? "text-emerald-400"
              : "text-amber-400"
          }`}
        >
          {totalPct.toFixed(1)}%
        </span>
      </div>

      {/* Add member form */}
      {showAddForm && (
        <div className="bg-zinc-900/70 border border-amber-500/30 rounded-lg p-4 space-y-3">
          <div className="text-[10px] tracking-[0.15em] uppercase text-amber-500 font-bold">
            Add Crew Member
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              type="text"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddMember()}
              placeholder="Display name"
              className="bg-zinc-800/50 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/50"
            />
            <select
              value={addRole}
              onChange={(e) => setAddRole(e.target.value as MiningRole)}
              className="bg-zinc-800/50 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/50"
            >
              {ROLES.map(([key, cfg]) => (
                <option key={key} value={key}>
                  {cfg.icon} {cfg.label} ({cfg.suggestedPct}%)
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleAddMember}
            disabled={!addName.trim() || isLoading}
            className="w-full py-2 bg-amber-500 text-zinc-900 rounded font-bold text-sm hover:bg-amber-400 disabled:opacity-40 transition-colors"
          >
            Add Member
          </button>
        </div>
      )}

      {/* Member cards */}
      {members.length === 0 ? (
        <div className="text-center py-8 text-zinc-600 text-sm">
          No crew members yet. Link a party when creating a session or add members manually.
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((member) => {
            const roleCfg = ROLE_DEFAULTS[member.role];
            const isLocked = lockedShareIds.has(member.id);
            const isEditing = editingShareId === member.id;

            return (
              <div
                key={member.id}
                className="bg-zinc-900/70 border border-zinc-700/60 rounded-lg p-3"
              >
                <div className="flex items-center justify-between">
                  {/* Left: avatar + name + role */}
                  <div className="flex items-center gap-3">
                    {member.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-sm">
                        {roleCfg.icon}
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                        {member.display_name}
                        {member.is_from_party && (
                          <span className="text-[8px] px-1 py-0.5 bg-cyan-500/20 text-cyan-400 rounded uppercase tracking-wider">
                            Party
                          </span>
                        )}
                      </div>
                      {/* Role selector */}
                      <select
                        value={member.role}
                        onChange={(e) => handleRoleChange(member, e.target.value as MiningRole)}
                        className="bg-transparent text-[11px] text-zinc-500 focus:outline-none cursor-pointer hover:text-zinc-300"
                      >
                        {ROLES.map(([key, cfg]) => (
                          <option key={key} value={key}>
                            {cfg.icon} {cfg.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Right: share % + actions */}
                  <div className="flex items-center gap-2">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          value={editShareValue}
                          onChange={(e) => setEditShareValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleShareSave(member.id);
                            if (e.key === "Escape") setEditingShareId(null);
                          }}
                          className="w-16 bg-zinc-800 border border-amber-500/50 rounded px-2 py-1 text-xs font-mono text-zinc-100 text-right focus:outline-none"
                          autoFocus
                        />
                        <button
                          onClick={() => handleShareSave(member.id)}
                          className="text-emerald-400 hover:text-emerald-300 text-xs"
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => setEditingShareId(null)}
                          className="text-zinc-500 hover:text-zinc-300 text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleShareEdit(member)}
                        className={`text-lg font-mono font-bold px-2 py-1 rounded transition-colors ${
                          isLocked
                            ? "text-amber-400 bg-amber-500/10 border border-amber-500/20"
                            : "text-zinc-300 hover:text-amber-400 hover:bg-amber-500/5"
                        }`}
                        title={isLocked ? "Locked (click to edit)" : "Click to edit share %"}
                      >
                        {member.share_pct.toFixed(1)}%
                      </button>
                    )}

                    {/* Lock/unlock toggle */}
                    <button
                      onClick={() => (isLocked ? unlockShare(member.id) : lockShare(member.id))}
                      className={`text-xs px-1 ${
                        isLocked
                          ? "text-amber-400 hover:text-amber-300"
                          : "text-zinc-600 hover:text-zinc-400"
                      }`}
                      title={isLocked ? "Unlock share" : "Lock share (prevent auto-balance)"}
                    >
                      {isLocked ? "🔒" : "🔓"}
                    </button>

                    {/* Remove */}
                    <button
                      onClick={() => removeMember(member.id)}
                      className="text-red-500/40 hover:text-red-400 text-xs ml-1"
                      title="Remove member"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════ LEDGER (cross-session accumulations) ═══════ */}
      {showLedger && (
        <div className="space-y-3 mt-4">
          <div className="text-[10px] tracking-[0.15em] uppercase text-cyan-500 font-bold">
            Cross-Session Ledger
          </div>
          {ledger.length === 0 ? (
            <div className="text-center py-6 text-zinc-600 text-sm">
              No ledger data yet. Complete work orders and distribute payouts to see accumulations.
            </div>
          ) : (
            <div className="bg-zinc-900/70 border border-zinc-700/60 rounded-lg overflow-hidden">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-2 bg-zinc-800/40 text-[10px] tracking-[0.1em] uppercase text-zinc-500 font-bold border-b border-zinc-700/40">
                <span>Member</span>
                <span className="text-right">Earned</span>
                <span className="text-right">Paid</span>
                <span className="text-right">Balance</span>
                <span className="text-right">Sessions</span>
              </div>
              {ledger.map((entry) => (
                <div
                  key={entry.id}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-3 border-b border-zinc-800/30 items-center"
                >
                  <span className="text-sm font-bold text-zinc-200">
                    {entry.display_name}
                  </span>
                  <span className="text-xs font-mono text-amber-400 text-right">
                    {fmtAuec(entry.total_earned)}
                  </span>
                  <span className="text-xs font-mono text-emerald-400 text-right">
                    {fmtAuec(entry.total_paid)}
                  </span>
                  <span
                    className={`text-sm font-mono font-bold text-right ${
                      entry.balance > 0
                        ? "text-amber-400"
                        : entry.balance < 0
                          ? "text-red-400"
                          : "text-zinc-500"
                    }`}
                  >
                    {fmtAuec(entry.balance)}
                  </span>
                  <span className="text-xs font-mono text-zinc-500 text-right">
                    {entry.total_sessions}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
