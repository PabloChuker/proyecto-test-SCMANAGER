"use client";

// =============================================================================
// SC LABS — Community Chains (Phase A scaffold, 2026-05-05)
//
// Página /hangar/chain-board/community — listing de cadenas compartidas
// por la comunidad con voting + comentarios.
//
// Phase A (este turno): UI completa funcionando con MOCK DATA local. Permite
//   navegar el flujo, ver el listing, ver detalle, ver dónde irían los votos
//   y comentarios.
// Phase B (próximo turno): conectar a backend Supabase real.
//   - Migración 069_create_shared_chains.sql (tabla shared_chains + chain_votes
//     + chain_comments + RLS)
//   - API endpoints: POST /api/chain-board/share, GET /api/chain-board/community,
//     POST /api/chain-board/[id]/vote, POST /api/chain-board/[id]/comments
//   - Botón "Publicar a comunidad" en el workspace
// =============================================================================

import { useState } from "react";
import Link from "next/link";
import Header from "@/app/assets/header/Header";
import { useTranslations } from "next-intl";

interface CommunityChain {
  id: string;
  name: string;
  authorName: string;
  fromShipName: string;
  toShipName: string;
  steps: number;
  totalCost: number;
  msrpCost: number;
  savings: number;
  votes: number;
  comments: number;
  postedAt: string;
  tags: string[];
}

// Phase A: data mock para que el user vea cómo va a verse. Se reemplaza por
// fetch a /api/chain-board/community en Phase B.
const MOCK_CHAINS: CommunityChain[] = [
  {
    id: "demo-1",
    name: "Aurora ES → Polaris LTI (max ahorro)",
    authorName: "DemoUser",
    fromShipName: "Aurora ES",
    toShipName: "Polaris",
    steps: 11,
    totalCost: 480,
    msrpCost: 750,
    savings: 270,
    votes: 42,
    comments: 8,
    postedAt: "2026-05-04T10:00:00Z",
    tags: ["LTI", "Capital", "Warbond-only"],
  },
  {
    id: "demo-2",
    name: "Mustang Alpha → Carrack",
    authorName: "DemoUser",
    fromShipName: "Mustang Alpha",
    toShipName: "Carrack",
    steps: 9,
    totalCost: 425,
    msrpCost: 600,
    savings: 175,
    votes: 31,
    comments: 5,
    postedAt: "2026-05-03T14:00:00Z",
    tags: ["Exploración", "120m"],
  },
  {
    id: "demo-3",
    name: "Aurora MR → Starlancer TAC",
    authorName: "DemoUser",
    fromShipName: "Aurora MR",
    toShipName: "Starlancer TAC",
    steps: 6,
    totalCost: 295,
    msrpCost: 330,
    savings: 35,
    votes: 18,
    comments: 2,
    postedAt: "2026-05-03T09:00:00Z",
    tags: ["Combate"],
  },
];

type SortMode = "votes" | "savings" | "recent";

export default function CommunityChainsPage() {
  const t = useTranslations("PageTitles");
  const [sortMode, setSortMode] = useState<SortMode>("votes");
  const [search, setSearch] = useState("");
  const [selectedChain, setSelectedChain] = useState<CommunityChain | null>(null);

  const sorted = [...MOCK_CHAINS]
    .filter((c) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.fromShipName.toLowerCase().includes(q) ||
        c.toShipName.toLowerCase().includes(q) ||
        c.tags.some((tg) => tg.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      if (sortMode === "votes") return b.votes - a.votes;
      if (sortMode === "savings") return b.savings - a.savings;
      return new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime();
    });

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <video autoPlay loop muted playsInline className="fixed inset-0 w-full h-full object-cover opacity-10 pointer-events-none z-0">
        <source src="/videos/bg.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-gradient-to-b from-zinc-950/70 via-zinc-950/85 to-zinc-950/95 pointer-events-none z-0" />
      <Header subtitle={t("hangar")} />
      <div className="relative z-10 max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-lg sm:text-xl font-semibold text-zinc-100 tracking-wide flex items-center gap-2">
              <span className="text-2xl">🌐</span>
              Cadenas de la Comunidad
              <span className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-sm bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/30">
                Beta
              </span>
            </h1>
            <p className="text-[11px] text-zinc-500">
              Las mejores cadenas armadas y compartidas por usuarios. Votá las que te sirven.
            </p>
          </div>
          <Link
            href="/hangar/chain-board"
            className="text-[10px] px-2.5 py-1.5 bg-zinc-900/60 border border-cyan-500/40 rounded-sm text-cyan-300 hover:bg-cyan-500/15 transition-colors"
          >
            ← Volver al planner
          </Link>
        </div>

        {/* Aviso fase A */}
        <div className="px-3 py-2 rounded-sm border bg-amber-500/10 border-amber-500/30 text-amber-300 text-[11px]">
          <strong>En construcción:</strong> Estas cadenas son ejemplos demo. La integración con backend
          (publicar, votar, comentar) llega en la próxima fase. Por ahora podés{" "}
          <strong>compartir tu cadena</strong> con el botón <code className="px-1 py-0.5 bg-zinc-950/60 rounded">🔗 Compartir</code> del
          planner — copia el JSON al portapapeles y otro user lo pega en <code className="px-1 py-0.5 bg-zinc-950/60 rounded">↑ Import</code>.
        </div>

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

        {/* Grid 2-col: listing + detalle */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_400px] gap-4">
          {/* Listing */}
          <div className="space-y-2">
            {sorted.map((chain, idx) => (
              <ChainCard
                key={chain.id}
                chain={chain}
                rank={sortMode === "votes" || sortMode === "savings" ? idx + 1 : null}
                selected={selectedChain?.id === chain.id}
                onClick={() => setSelectedChain(chain)}
              />
            ))}
            {sorted.length === 0 && (
              <div className="text-center py-12 text-zinc-500 text-[12px] italic">
                Sin resultados con esos filtros.
              </div>
            )}
          </div>

          {/* Detalle */}
          <div className="space-y-2 md:sticky md:top-4 md:self-start">
            {selectedChain ? (
              <ChainDetail chain={selectedChain} onClose={() => setSelectedChain(null)} />
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

function SortButton({
  active, onClick, label, icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: string;
}) {
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

function ChainCard({
  chain, rank, selected, onClick,
}: {
  chain: CommunityChain;
  rank: number | null;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-md border transition-colors ${
        selected
          ? "bg-fuchsia-500/10 border-fuchsia-500/50"
          : "bg-zinc-900/40 border-zinc-800/60 hover:border-fuchsia-500/40"
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
            <span className="text-[10px] text-zinc-500 font-mono shrink-0">{chain.authorName}</span>
          </div>
          <p className="text-[10px] text-zinc-500 mb-1.5">
            {chain.fromShipName} → {chain.toShipName} · {chain.steps} pasos
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] flex items-center gap-1">
              <span className="text-zinc-500">Tienda</span>
              <span className="font-mono text-zinc-300">${chain.msrpCost}</span>
            </span>
            <span className="text-[10px] flex items-center gap-1">
              <span className="text-zinc-500">Cadena</span>
              <span className="font-mono text-cyan-300">${chain.totalCost}</span>
            </span>
            <span className="text-[10px] flex items-center gap-1">
              <span className="text-emerald-500">Ahorro</span>
              <span className="font-mono text-emerald-300 font-bold">${chain.savings}</span>
            </span>
            <span className="text-[10px] flex items-center gap-1 ml-auto">
              <span className="text-amber-400">⭐</span>
              <span className="font-mono text-amber-300">{chain.votes}</span>
            </span>
            <span className="text-[10px] flex items-center gap-1">
              <span className="text-zinc-500">💬</span>
              <span className="font-mono text-zinc-400">{chain.comments}</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {chain.tags.map((tag) => (
              <span key={tag} className="text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded-[2px] bg-zinc-800/60 text-zinc-400 border border-zinc-700/50">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}

function ChainDetail({
  chain, onClose,
}: {
  chain: CommunityChain;
  onClose: () => void;
}) {
  const [comment, setComment] = useState("");

  return (
    <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-md overflow-hidden">
      <div className="px-3 pt-3 pb-2 border-b border-zinc-800/50 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold text-zinc-100">{chain.name}</h3>
          <p className="text-[10px] text-zinc-500 italic">Por {chain.authorName}</p>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-rose-300 text-[14px] px-1 shrink-0">✕</button>
      </div>

      <div className="p-3 space-y-3">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 bg-zinc-950/60 rounded-sm">
            <p className="text-[9px] uppercase tracking-widest text-zinc-500">Tienda</p>
            <p className="text-[14px] font-mono text-zinc-300 font-bold">${chain.msrpCost}</p>
          </div>
          <div className="p-2 bg-cyan-500/5 border border-cyan-500/20 rounded-sm">
            <p className="text-[9px] uppercase tracking-widest text-cyan-500">Cadena</p>
            <p className="text-[14px] font-mono text-cyan-300 font-bold">${chain.totalCost}</p>
          </div>
          <div className="p-2 bg-emerald-500/5 border border-emerald-500/20 rounded-sm">
            <p className="text-[9px] uppercase tracking-widest text-emerald-500">Ahorro</p>
            <p className="text-[14px] font-mono text-emerald-300 font-bold">${chain.savings}</p>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex gap-2">
          <button
            disabled
            className="flex-1 px-2 py-1.5 rounded-sm border border-amber-500/30 bg-amber-500/10 text-amber-400 text-[11px] font-medium cursor-not-allowed opacity-60"
            title="Próximamente — votar requiere login + backend"
          >
            ⭐ Votar ({chain.votes})
          </button>
          <button
            disabled
            className="flex-1 px-2 py-1.5 rounded-sm border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 text-[11px] font-medium cursor-not-allowed opacity-60"
            title="Próximamente — copiar al planner requiere backend"
          >
            ↓ Importar al planner
          </button>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1">
          {chain.tags.map((tag) => (
            <span key={tag} className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-zinc-800/60 text-zinc-400 border border-zinc-700/50">
              #{tag}
            </span>
          ))}
        </div>

        {/* Comments section */}
        <div className="pt-2 border-t border-zinc-800/40">
          <h4 className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 mb-2">
            Comentarios ({chain.comments})
          </h4>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Tu opinión sobre esta cadena..."
            rows={3}
            disabled
            className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[11px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-fuchsia-500/50 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            disabled
            className="mt-1 w-full px-2 py-1.5 rounded-sm border border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-400 text-[11px] font-medium cursor-not-allowed opacity-60"
            title="Próximamente — comentar requiere login + backend"
          >
            Publicar comentario
          </button>
          <p className="mt-2 text-[9px] text-zinc-600 italic text-center">
            Phase A: UI lista. Voting + comments se conectan al backend Supabase en el próximo deploy.
          </p>
        </div>
      </div>
    </div>
  );
}
