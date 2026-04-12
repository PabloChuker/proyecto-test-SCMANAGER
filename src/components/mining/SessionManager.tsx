"use client";

// =============================================================================
// SC LABS — Mining Session Manager
//
// Lists Supabase-backed mining sessions. Create new sessions with optional
// party auto-load. Selecting a session loads its members, orders, and inventory.
// =============================================================================

import { useEffect, useState } from "react";
import { useMiningStore } from "@/store/useMiningStore";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Party {
  id: string;
  name: string;
  status: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusColor(s: string) {
  switch (s) {
    case "active":
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/40";
    case "completed":
      return "bg-blue-500/20 text-blue-400 border-blue-500/40";
    case "archived":
      return "bg-zinc-700/30 text-zinc-500 border-zinc-600/40";
    default:
      return "bg-zinc-700/30 text-zinc-400 border-zinc-600/40";
  }
}

// ═════════════════════════════════════════════════════════════════════════════

export default function SessionManager() {
  const { user } = useAuth();
  const {
    sessions,
    activeSessionId,
    members,
    isLoading,
    error,
    fetchSessions,
    createSession,
    setActiveSession,
  } = useMiningStore();

  const [newName, setNewName] = useState("");
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null);
  const [parties, setParties] = useState<Party[]>([]);
  const [loadingParties, setLoadingParties] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  // Fetch sessions on mount
  useEffect(() => {
    if (user) fetchSessions();
  }, [user, fetchSessions]);

  // Fetch user's active parties for the dropdown
  useEffect(() => {
    if (!user || !showCreate) return;
    setLoadingParties(true);
    const supabase = createClient();

    // Find parties the user belongs to via party_members
    supabase
      .from("party_members")
      .select("party_id")
      .eq("user_id", user.id)
      .then(({ data: memberships }) => {
        if (!memberships || memberships.length === 0) {
          setParties([]);
          setLoadingParties(false);
          return;
        }
        const partyIds = memberships.map((m) => m.party_id);
        supabase
          .from("parties")
          .select("id, name, status")
          .in("id", partyIds)
          .eq("status", "active")
          .then(({ data }) => {
            setParties(data || []);
            setLoadingParties(false);
          });
      });
  }, [user, showCreate]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createSession(newName.trim(), selectedPartyId);
    setNewName("");
    setSelectedPartyId(null);
    setShowCreate(false);
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-zinc-200 tracking-wide font-mono">
          Mining Sessions
        </h2>
        <button
          onClick={() => setShowCreate((p) => !p)}
          className="px-4 py-2 bg-amber-500 text-zinc-900 rounded text-xs font-bold hover:bg-amber-400 transition-colors"
        >
          {showCreate ? "Cancel" : "+ New Session"}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="bg-zinc-900/70 border border-amber-500/30 rounded-lg p-4 space-y-3">
          <div className="text-[10px] tracking-[0.15em] uppercase text-amber-500 font-bold">
            Create New Session
          </div>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="Session name (e.g. Aaron Halo Run #5)"
            className="w-full bg-zinc-800/50 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/50"
          />

          {/* Party selector */}
          <div>
            <label className="text-[10px] tracking-[0.1em] uppercase text-zinc-500 font-bold block mb-1">
              Link Party (auto-loads members)
            </label>
            <select
              value={selectedPartyId || ""}
              onChange={(e) => setSelectedPartyId(e.target.value || null)}
              className="w-full bg-zinc-800/50 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/50"
            >
              <option value="">No party — solo session</option>
              {loadingParties && <option disabled>Loading parties…</option>}
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {selectedPartyId && (
              <p className="text-[10px] text-emerald-400 mt-1">
                Party members will be auto-loaded with suggested roles and shares.
              </p>
            )}
          </div>

          <button
            onClick={handleCreate}
            disabled={!newName.trim() || isLoading}
            className="w-full py-2 bg-amber-500 text-zinc-900 rounded font-bold text-sm hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? "Creating…" : "Create Session"}
          </button>
        </div>
      )}

      {/* Active session indicator */}
      {activeSession && (
        <div className="flex items-center justify-between bg-zinc-900/60 border border-amber-500/20 rounded-lg px-4 py-2">
          <div className="text-xs text-zinc-400">
            Active:{" "}
            <span className="text-amber-400 font-bold">{activeSession.name}</span>
            <span className="ml-2 text-zinc-600">
              · {members.length} member{members.length !== 1 ? "s" : ""}
            </span>
          </div>
          <button
            onClick={() => setActiveSession(null)}
            className="text-[10px] text-zinc-600 hover:text-zinc-400"
          >
            Deselect
          </button>
        </div>
      )}

      {/* Session list */}
      {isLoading && sessions.length === 0 ? (
        <div className="text-center py-12 text-zinc-600 text-sm">Loading sessions…</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-12 text-zinc-600 text-sm">
          No mining sessions yet. Create your first one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            return (
              <div
                key={session.id}
                onClick={() => setActiveSession(session.id)}
                className={`bg-zinc-900/70 border rounded-lg p-4 cursor-pointer transition-all ${
                  isActive
                    ? "border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.1)]"
                    : "border-zinc-700/60 hover:border-zinc-600"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                      {session.name}
                      {isActive && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded uppercase tracking-wider">
                          Active
                        </span>
                      )}
                      <span
                        className={`text-[9px] px-1.5 py-0.5 border rounded uppercase tracking-wider ${statusColor(session.status)}`}
                      >
                        {session.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-1">
                      {fmtDate(session.created_at)}
                      {session.party_id && (
                        <span className="ml-2 text-cyan-500">· Party linked</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
