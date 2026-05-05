"use client";

// =============================================================================
// SC LABS — Community Chains (Phase B funcional, 2026-05-05)
//
// /hangar/chain-board/community — listing real con backend Supabase.
// Sort por votos / ahorro / recientes. Click en una cadena → detalle con
// votar + comentarios. Importar al planner copia el snapshot al localStorage
// del chain-board y redirige.
// =============================================================================

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/app/assets/header/Header";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";

interface CommunityChain {
  id: string;
  owner_id: string;
  owner_username: string | null;
  owner_display_name: string | null;
  owner_avatar_url: string | null;
  name: string;
  from_ship_name: string | null;
  to_ship_name: string | null;
  steps_count: number;
  msrp_cost: number;
  total_cost: number;
  savings: number;
  tags: string[];
  votes_count: number;
  comments_count: number;
  created_at: string;
  voted_by_me?: boolean;
}

interface ChainComment {
  id: string;
  body: string;
  created_at: string;
  author_username: string | null;
  author_display_name: string | null;
  author_avatar_url: string | null;
}

type SortMode = "votes" | "savings" | "recent";

export default function CommunityChainsPage() {
  const t = useTranslations("PageTitles");
  const router = useRouter();
  const { user } = useAuth();
  const [sortMode, setSortMode] = useState<SortMode>("votes");
  const [search, setSearch] = useState("");
  const [chains, setChains] = useState<CommunityChain[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch listing — debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ sort: sortMode });
      if (search.trim()) params.set("search", search.trim());
      fetch(`/api/chain-board/community?${params}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.error) throw new Error(d.error);
          setChains(d.chains ?? []);
          setError(null);
        })
        .catch((e) => setError(e?.message ?? "Error al cargar cadenas."))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [sortMode, search]);

  // Refresh listing (reusable después de votar/comentar)
  const refresh = useCallback(() => {
    const params = new URLSearchParams({ sort: sortMode });
    if (search.trim()) params.set("search", search.trim());
    fetch(`/api/chain-board/community?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setChains(d.chains ?? []);
      })
      .catch(() => {});
  }, [sortMode, search]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <video autoPlay loop muted playsInline className="fixed inset-0 w-full h-full object-cover opacity-10 pointer-events-none z-0">
        <source src="/videos/bg.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-gradient-to-b from-zinc-950/70 via-zinc-950/85 to-zinc-950/95 pointer-events-none z-0" />
      <Header subtitle={t("hangar")} />
      <div className="relative z-10 max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-lg sm:text-xl font-semibold text-zinc-100 tracking-wide flex items-center gap-2">
              <span className="text-2xl">🌐</span>
              Cadenas de la Comunidad
            </h1>
            <p className="text-[11px] text-zinc-500">
              Las mejores cadenas armadas y compartidas por usuarios. Votá, comentá, importá.
            </p>
          </div>
          <Link
            href="/hangar/chain-board"
            className="text-[10px] px-2.5 py-1.5 bg-zinc-900/60 border border-cyan-500/40 rounded-sm text-cyan-300 hover:bg-cyan-500/15 transition-colors"
          >
            ← Volver al planner
          </Link>
        </div>

        {!user && (
          <div className="px-3 py-2 rounded-sm border bg-amber-500/10 border-amber-500/30 text-amber-300 text-[11px]">
            Estás navegando como invitado. Para <strong>votar, comentar o publicar</strong> tu propia cadena, necesitás iniciar sesión.
          </div>
        )}

        {error && (
          <div className="px-3 py-2 rounded-sm border bg-rose-500/10 border-rose-500/30 text-rose-300 text-[11px]">
            {error}
          </div>
        )}

        {/* Filtros */}
        <div className="flex items-center gap-2 flex-wrap p-3 bg-zinc-900/40 border border-zinc-800/60 rounded-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, nave o tag..."
            className="flex-1 min-w-[200px] px-3 py-1.5 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[12px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-fuchsia-500/50"
          />
          <div className="flex items-center gap-1 p-0.5 bg-zinc-950/60 rounded-sm">
            <SortButton active={sortMode === "votes"} onClick={() => setSortMode("votes")} label="Más votadas" icon="⭐" />
            <SortButton active={sortMode === "savings"} onClick={() => setSortMode("savings")} label="Más ahorro" icon="💰" />
            <SortButton active={sortMode === "recent"} onClick={() => setSortMode("recent")} label="Recientes" icon="🕒" />
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_400px] gap-4">
          <div className="space-y-2">
            {loading && (
              <div className="text-center py-12 text-zinc-500 text-[12px] italic">
                Cargando cadenas...
              </div>
            )}
            {!loading && chains.length === 0 && !error && (
              <div className="text-center py-12 text-zinc-500 text-[12px] italic">
                {search.trim()
                  ? "Sin resultados con ese filtro."
                  : "No hay cadenas publicadas todavía. Sé el primero — armá una en el planner y dale Compartir → Publicar a comunidad."}
              </div>
            )}
            {!loading && chains.map((chain, idx) => (
              <ChainCard
                key={chain.id}
                chain={chain}
                rank={sortMode === "votes" || sortMode === "savings" ? idx + 1 : null}
                selected={selectedChainId === chain.id}
                onClick={() => setSelectedChainId(chain.id)}
              />
            ))}
          </div>

          <div className="space-y-2 md:sticky md:top-4 md:self-start">
            {selectedChainId ? (
              <ChainDetail
                chainId={selectedChainId}
                onClose={() => setSelectedChainId(null)}
                onChange={refresh}
                onImport={(snapshot) => {
                  try {
                    localStorage.setItem("sclabs-chain-board-v2", JSON.stringify(snapshot));
                    router.push("/hangar/chain-board");
                  } catch {
                    alert("No se pudo importar al planner.");
                  }
                }}
                isLoggedIn={!!user}
                currentUserId={user?.id ?? null}
              />
            ) : (
              <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-md p-6 text-center">
                <p className="text-[12px] text-zinc-500 mb-1">Sin cadena seleccionada</p>
                <p className="text-[10px] text-zinc-600">
                  Click en una cadena de la lista para ver su detalle, votar y comentar.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function SortButton({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-[10px] px-2 py-1 rounded-sm font-medium transition-colors flex items-center gap-1 ${
        active ? "bg-fuchsia-500/20 text-fuchsia-300" : "text-zinc-500 hover:text-zinc-300"
      }`}
    >
      <span>{icon}</span>
      {label}
    </button>
  );
}

function ChainCard({ chain, rank, selected, onClick }: { chain: CommunityChain; rank: number | null; selected: boolean; onClick: () => void }) {
  const author = chain.owner_display_name || chain.owner_username || "anónimo";
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-md border transition-colors ${
        selected ? "bg-fuchsia-500/10 border-fuchsia-500/50" : "bg-zinc-900/40 border-zinc-800/60 hover:border-fuchsia-500/40"
      }`}
    >
      <div className="flex items-start gap-3">
        {rank !== null && (
          <span className={`text-[18px] font-bold font-mono w-8 text-center shrink-0 ${
            rank === 1 ? "text-amber-400" : rank === 2 ? "text-zinc-300" : rank === 3 ? "text-orange-400" : "text-zinc-600"
          }`}>
            #{rank}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <h3 className="text-[13px] font-semibold text-zinc-100 truncate">{chain.name}</h3>
            <span className="text-[10px] text-zinc-500 font-mono shrink-0 truncate max-w-[100px]" title={author}>
              {author}
            </span>
          </div>
          <p className="text-[10px] text-zinc-500 mb-1.5">
            {chain.from_ship_name || "?"} → {chain.to_ship_name || "?"} · {chain.steps_count} pasos
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] flex items-center gap-1">
              <span className="text-zinc-500">Tienda</span>
              <span className="font-mono text-zinc-300">${Number(chain.msrp_cost).toFixed(0)}</span>
            </span>
            <span className="text-[10px] flex items-center gap-1">
              <span className="text-zinc-500">Cadena</span>
              <span className="font-mono text-cyan-300">${Number(chain.total_cost).toFixed(0)}</span>
            </span>
            <span className="text-[10px] flex items-center gap-1">
              <span className="text-emerald-500">Ahorro</span>
              <span className="font-mono text-emerald-300 font-bold">${Number(chain.savings).toFixed(0)}</span>
            </span>
            <span className="text-[10px] flex items-center gap-1 ml-auto">
              <span className={chain.voted_by_me ? "text-amber-300" : "text-amber-400"}>{chain.voted_by_me ? "★" : "⭐"}</span>
              <span className="font-mono text-amber-300">{chain.votes_count}</span>
            </span>
            <span className="text-[10px] flex items-center gap-1">
              <span className="text-zinc-500">💬</span>
              <span className="font-mono text-zinc-400">{chain.comments_count}</span>
            </span>
          </div>
          {chain.tags && chain.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {chain.tags.map((tag) => (
                <span key={tag} className="text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded-[2px] bg-zinc-800/60 text-zinc-400 border border-zinc-700/50">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function ChainDetail({
  chainId, onClose, onChange, onImport, isLoggedIn, currentUserId,
}: {
  chainId: string;
  onClose: () => void;
  onChange: () => void;
  onImport: (snapshot: any) => void;
  isLoggedIn: boolean;
  currentUserId: string | null;
}) {
  const [chain, setChain] = useState<(CommunityChain & { snapshot: any | null }) | null>(null);
  const [comments, setComments] = useState<ChainComment[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(true);

  // Cargar detalle + comentarios
  useEffect(() => {
    setLoadingDetail(true);
    Promise.all([
      fetch(`/api/chain-board/${chainId}`).then((r) => r.json()),
      fetch(`/api/chain-board/${chainId}/comments`).then((r) => r.json()),
    ])
      .then(([detail, cms]) => {
        if (detail.chain) setChain(detail.chain);
        if (cms.comments) setComments(cms.comments);
      })
      .catch(() => {})
      .finally(() => setLoadingDetail(false));
  }, [chainId]);

  const handleVote = async () => {
    if (!isLoggedIn || !chain) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/chain-board/${chainId}/vote`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      // Optimistic refresh del detail
      setChain((prev) => prev ? {
        ...prev,
        voted_by_me: d.voted,
        votes_count: prev.votes_count + (d.voted ? 1 : -1),
      } : prev);
      onChange();
    } catch (e: any) {
      alert(e?.message ?? "No se pudo votar.");
    } finally {
      setBusy(false);
    }
  };

  const handlePostComment = async () => {
    if (!isLoggedIn || !comment.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/chain-board/${chainId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: comment.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setComment("");
      // Reload comments
      const cms = await fetch(`/api/chain-board/${chainId}/comments`).then((r) => r.json());
      if (cms.comments) setComments(cms.comments);
      setChain((prev) => prev ? { ...prev, comments_count: prev.comments_count + 1 } : prev);
      onChange();
    } catch (e: any) {
      alert(e?.message ?? "No se pudo comentar.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!isLoggedIn || !chain || chain.owner_id !== currentUserId) return;
    if (!confirm(`¿Borrar "${chain.name}" definitivamente? No se puede deshacer.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/chain-board/${chainId}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      onClose();
      onChange();
    } catch (e: any) {
      alert(e?.message ?? "No se pudo borrar.");
    } finally {
      setBusy(false);
    }
  };

  if (loadingDetail) {
    return (
      <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-md p-6 text-center">
        <p className="text-[12px] text-zinc-500 italic">Cargando detalle...</p>
      </div>
    );
  }
  if (!chain) {
    return (
      <div className="bg-zinc-900/40 border border-rose-500/30 rounded-md p-6 text-center">
        <p className="text-[12px] text-rose-300">No se encontró la cadena.</p>
      </div>
    );
  }

  const isOwner = chain.owner_id === currentUserId;
  const author = chain.owner_display_name || chain.owner_username || "anónimo";

  return (
    <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-md overflow-hidden">
      <div className="px-3 pt-3 pb-2 border-b border-zinc-800/50 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-zinc-100 truncate">{chain.name}</h3>
          <p className="text-[10px] text-zinc-500 italic">Por {author}</p>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-rose-300 text-[14px] px-1 shrink-0">✕</button>
      </div>

      <div className="p-3 space-y-3 max-h-[600px] overflow-y-auto">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 bg-zinc-950/60 rounded-sm">
            <p className="text-[9px] uppercase tracking-widest text-zinc-500">Tienda</p>
            <p className="text-[14px] font-mono text-zinc-300 font-bold">${Number(chain.msrp_cost).toFixed(0)}</p>
          </div>
          <div className="p-2 bg-cyan-500/5 border border-cyan-500/20 rounded-sm">
            <p className="text-[9px] uppercase tracking-widest text-cyan-500">Cadena</p>
            <p className="text-[14px] font-mono text-cyan-300 font-bold">${Number(chain.total_cost).toFixed(0)}</p>
          </div>
          <div className="p-2 bg-emerald-500/5 border border-emerald-500/20 rounded-sm">
            <p className="text-[9px] uppercase tracking-widest text-emerald-500">Ahorro</p>
            <p className="text-[14px] font-mono text-emerald-300 font-bold">${Number(chain.savings).toFixed(0)}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleVote}
            disabled={!isLoggedIn || busy}
            className={`flex-1 px-2 py-1.5 rounded-sm border text-[11px] font-medium transition-colors flex items-center justify-center gap-1 ${
              chain.voted_by_me
                ? "border-amber-400 bg-amber-500/25 text-amber-200"
                : "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
            } ${!isLoggedIn || busy ? "opacity-50 cursor-not-allowed" : ""}`}
            title={!isLoggedIn ? "Iniciá sesión para votar" : chain.voted_by_me ? "Sacar voto" : "Votar"}
          >
            <span>{chain.voted_by_me ? "★" : "⭐"}</span>
            {chain.voted_by_me ? "Votada" : "Votar"} ({chain.votes_count})
          </button>
          <button
            onClick={() => chain.snapshot && onImport(chain.snapshot)}
            disabled={!chain.snapshot}
            className="flex-1 px-2 py-1.5 rounded-sm border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 text-[11px] font-medium hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
            title="Cargar esta cadena en mi planner"
          >
            ↓ Importar al planner
          </button>
        </div>

        {isOwner && (
          <button
            onClick={handleDelete}
            disabled={busy}
            className="w-full px-2 py-1 rounded-sm border border-rose-500/30 bg-rose-500/5 text-rose-400 text-[10px] font-mono uppercase tracking-wider hover:bg-rose-500/15 transition-colors disabled:opacity-50"
          >
            🗑 Borrar mi cadena
          </button>
        )}

        {chain.tags && chain.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {chain.tags.map((tag) => (
              <span key={tag} className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-zinc-800/60 text-zinc-400 border border-zinc-700/50">
                #{tag}
              </span>
            ))}
          </div>
        )}

        <div className="pt-2 border-t border-zinc-800/40">
          <h4 className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 mb-2">
            Comentarios ({comments.length})
          </h4>
          {isLoggedIn ? (
            <>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Tu opinión sobre esta cadena..."
                rows={3}
                maxLength={2000}
                disabled={busy}
                className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[11px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-fuchsia-500/50 resize-none disabled:opacity-50"
              />
              <button
                onClick={handlePostComment}
                disabled={busy || !comment.trim()}
                className="mt-1 w-full px-2 py-1.5 rounded-sm border border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-300 text-[11px] font-medium hover:bg-fuchsia-500/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Publicar comentario
              </button>
            </>
          ) : (
            <p className="text-[10px] text-zinc-600 italic">
              Iniciá sesión para comentar.
            </p>
          )}

          <div className="mt-3 space-y-2">
            {comments.map((c) => (
              <div key={c.id} className="bg-zinc-950/60 border border-zinc-800/60 rounded-sm p-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] text-fuchsia-300 font-medium truncate">
                    {c.author_display_name || c.author_username || "anónimo"}
                  </span>
                  <span className="text-[9px] text-zinc-600 ml-auto shrink-0">
                    {new Date(c.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-300 whitespace-pre-wrap leading-snug break-words">
                  {c.body}
                </p>
              </div>
            ))}
            {comments.length === 0 && (
              <p className="text-[10px] text-zinc-600 italic text-center py-2">
                Sin comentarios. Sé el primero.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
