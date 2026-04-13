"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  X, MessageSquare, Edit2, Lock, ChevronDown,
  UserPlus, Shield, Briefcase, Star, Users, Package, Activity
} from "lucide-react";
import Header from "@/app/assets/header/Header";
import { SIDEBAR_ITEMS } from "@/app/assets/header/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { PageVideoBackground } from "@/components/shared/PageVideoBackground";

// ── Types ─────────────────────────────────────────────────────────────────
type LeftPanelId  = "loadouts" | "org" | "work";
type RightPanelId = "wishlist" | "amigos" | "party";

// ── Color maps ────────────────────────────────────────────────────────────
const chipCls = {
  olive:  "bg-lime-500/10 text-lime-400",
  accent: "bg-amber-500/10 text-amber-400",
  steel:  "bg-slate-500/10 text-slate-300",
  khaki:  "bg-yellow-500/10 text-yellow-400",
  rust:   "bg-orange-600/10 text-orange-400",
  ghost:  "bg-zinc-800 text-zinc-600",
} as const;

const abCls = {
  default: "border-zinc-600/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
  olive:   "border-lime-700/50 text-lime-400 hover:bg-lime-500/10",
  danger:  "border-orange-700/50 text-orange-400 hover:bg-orange-600/10",
  accent:  "border-amber-600/50 text-amber-400 hover:bg-amber-500/10",
} as const;

const avCls = {
  accent: "bg-amber-500/10 text-amber-400",
  olive:  "bg-lime-500/10 text-lime-400",
  steel:  "bg-slate-500/10 text-slate-300",
  khaki:  "bg-yellow-500/10 text-yellow-400",
  rust:   "bg-orange-600/10 text-orange-400",
  muted:  "bg-zinc-800 text-zinc-500",
} as const;

type ChipV = keyof typeof chipCls;
type AbV   = keyof typeof abCls;
type AvV   = keyof typeof avCls;

// ── Micro components ──────────────────────────────────────────────────────

function Chip({ v, children }: { v: ChipV; children: React.ReactNode }) {
  return (
    <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full font-mono whitespace-nowrap ${chipCls[v]}`}>
      {children}
    </span>
  );
}

function ABtn({ v = "default", onClick, children }: { v?: AbV; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`h-[30px] px-3 rounded border bg-transparent font-mono text-[11px] cursor-pointer whitespace-nowrap transition-all duration-150 ${abCls[v]}`}
    >
      {children}
    </button>
  );
}

function OnlinePip({ on }: { on: boolean }) {
  return (
    <div className={`w-2.5 h-2.5 rounded-full border-2 border-zinc-900 flex-shrink-0 ${on ? "bg-lime-400" : "bg-zinc-700"}`} />
  );
}

function AvCircle({ init, color }: { init: string; color: AvV }) {
  return (
    <div className={`w-[42px] h-[42px] rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${avCls[color]}`}>
      {init}
    </div>
  );
}

function IBox({ children, cls }: { children: React.ReactNode; cls: string }) {
  return (
    <div className={`w-[42px] h-[42px] rounded-lg flex items-center justify-center flex-shrink-0 ${cls}`}>
      {children}
    </div>
  );
}

function ProgBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="mt-1.5 h-[3px] bg-zinc-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function SLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`font-mono text-[10px] tracking-[0.12em] uppercase text-zinc-600 mb-3.5 ${className}`}>
      {children}
    </div>
  );
}

function SubLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`font-mono text-[10px] tracking-[0.1em] uppercase text-zinc-600 mt-4 mb-2.5 ${className}`}>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3.5 py-3 border-b border-zinc-800/30 last:border-b-0">
      {children}
    </div>
  );
}

function SPHead({ title, sub, onClose }: { title: string; sub: string; onClose: () => void }) {
  return (
    <div className="bg-zinc-900 px-7 py-5 border-b border-zinc-800/40 flex items-center justify-between flex-shrink-0">
      <div>
        <div className="font-bold text-[22px] text-zinc-100 tracking-wide">{title}</div>
        <div className="text-[11px] text-zinc-600 mt-0.5 font-mono tracking-widest">{sub}</div>
      </div>
      <button
        onClick={onClose}
        className="w-[34px] h-[34px] rounded border border-zinc-600/50 bg-transparent flex items-center justify-center cursor-pointer text-zinc-400 flex-shrink-0 transition-all hover:bg-zinc-800 hover:text-zinc-100"
      >
        <X size={12} />
      </button>
    </div>
  );
}

function Sec({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`px-7 py-5 border-b border-zinc-800/30 last:border-b-0 ${className}`}>
      {children}
    </div>
  );
}

function DashedBtn({ children, solid = false }: { children: React.ReactNode; solid?: boolean }) {
  return (
    <button
      className={`w-full h-10 rounded border bg-transparent font-mono text-[11px] tracking-widest cursor-pointer transition-all flex items-center justify-center gap-2 ${
        solid
          ? "border-amber-600/60 text-amber-400 hover:bg-amber-500/10"
          : "border-dashed border-zinc-600/50 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-200 hover:border-amber-600/40 hover:border-solid"
      }`}
    >
      {children}
    </button>
  );
}

// ── Static data ───────────────────────────────────────────────────────────

const LOADOUTS = [
  { ship: "Perseus",      maker: "RSI",   role: "Cañonero",      crew: 3,  tag: "Combat",  cv: "steel"  as ChipV },
  { ship: "Polaris",      maker: "RSI",   role: "Corbeta",       crew: 14, tag: "Capital",  cv: "accent" as ChipV },
  { ship: "F7A Hornet",   maker: "Anvil", role: "Caza",          crew: 1,  tag: "Fighter",  cv: "olive"  as ChipV },
  { ship: "Buccaneer",    maker: "Drake", role: "Caza ligero",   crew: 1,  tag: "Fighter",  cv: "rust"   as ChipV },
  { ship: "Reclaimer",    maker: "Aegis", role: "Salvamento",    crew: 5,  tag: "Salvage",  cv: "khaki"  as ChipV },
  { ship: "Cutlass Black",maker: "Drake", role: "Multipropósito",crew: 2,  tag: "Multi",    cv: "olive"  as ChipV },
  { ship: "Prospector",   maker: "MISC",  role: "Minería",       crew: 1,  tag: "Mining",   cv: "steel"  as ChipV },
  { ship: "Gladius",      maker: "Aegis", role: "Interceptor",   crew: 1,  tag: "Fighter",  cv: "rust"   as ChipV },
];

const ORG_ONLINE = [
  { init: "CX", color: "accent" as AvV, name: "Commander X",  rank: "Rango 5 · Líder"   },
  { init: "VP", color: "olive"  as AvV, name: "VoidPilot",    rank: "Rango 4 · Oficial"  },
  { init: "SK", color: "steel"  as AvV, name: "SkyKing99",    rank: "Rango 3 · Oficial"  },
];

const ORG_OFFLINE = [
  { init: "NR", name: "NightRaider", last: "Hace 2h"    },
  { init: "GX", name: "GhostX",      last: "Hace 5h"    },
  { init: "RV", name: "RedViper",    last: "Hace 1 día"  },
  { init: "PL", name: "PlanetLord",  last: "Hace 2 días" },
  { init: "AX", name: "AxionPilot",  last: "Hace 3 días" },
];

const WORK_ORDERS = [
  {
    id: 1, icon: "accent" as ChipV, name: "Ouratite · 40 SCU", loc: "ARC-L1 Wide Forest Station",
    pct: 72, barColor: "bg-amber-500", cv: "accent" as ChipV, code: "Q589",
    details: { Mineral:"Ouratite", Cantidad:"40 SCU", Lugar:"ARC-L1 Wide Forest", "Tiempo restante":"~28 min", Participantes:"Sr_Frost, xNova", "Resultado estimado":"589 aUEC" },
  },
  {
    id: 2, icon: "olive"  as ChipV, name: "Laranite · 22 SCU", loc: "Crusader Security Station",
    pct: 38, barColor: "bg-lime-600", cv: "olive" as ChipV, code: "R114",
    details: { Mineral:"Laranite", Cantidad:"22 SCU", Lugar:"Crusader Security St.", "Tiempo restante":"~1h 12 min", Participantes:"Sr_Frost", "Resultado estimado":"1,140 aUEC" },
  },
  {
    id: 3, icon: "steel"  as ChipV, name: "Chatarra · 18 SCU", loc: "Port Tressler · Microtech",
    pct: 91, barColor: "bg-slate-500", cv: "steel" as ChipV, code: "S047",
    details: { Tipo:"Chatarra procesada", Cantidad:"18 SCU", Lugar:"Port Tressler", "Tiempo restante":"~4 min", Participantes:"Sr_Frost, ZeroRisk, xNova", "Resultado estimado":"2,340 aUEC" },
  },
  {
    id: 4, icon: "khaki"  as ChipV, name: "Bexalite · 55 SCU", loc: "MIC-L1 Shallow Frontier Station",
    pct: 54, barColor: "bg-yellow-600", cv: "khaki" as ChipV, code: "M203",
    details: { Mineral:"Bexalite", Cantidad:"55 SCU", Lugar:"MIC-L1 Shallow Frontier", "Tiempo restante":"~45 min", Participantes:"Sr_Frost, Xoliii, kuzuribot", "Resultado estimado":"3,850 aUEC" },
  },
  {
    id: 5, icon: "olive"  as ChipV, name: "Chatarra · 30 SCU", loc: "HUR-L2 Faithful Dream Station",
    pct: 19, barColor: "bg-lime-700", cv: "olive" as ChipV, code: "H088",
    details: { Tipo:"Chatarra procesada", Cantidad:"30 SCU", Lugar:"HUR-L2 Faithful Dream", "Tiempo restante":"~2h 30 min", Participantes:"Sr_Frost", "Resultado estimado":"1,620 aUEC" },
  },
];

const WORK_PENDING = [
  {
    id: 6, name: "Recuperación · Pyro",     meta: "Riesgo alto · 120,000 aUEC",
    details: { Tipo:"Recuperación de datos", Sistema:"Pyro", Riesgo:"Alto", Recompensa:"120,000 aUEC" },
  },
  {
    id: 7, name: "Minería · Quantanium",     meta: "Riesgo extremo · 340,000 aUEC",
    details: { Mineral:"Quantanium", Sistema:"Stanton · Yela", Riesgo:"Extremo — inestable", Recompensa:"340,000 aUEC" },
  },
  {
    id: 8, name: "Escolta de convoy",        meta: "Stanton · Riesgo medio · 65,000 aUEC",
    details: { Tipo:"Escolta armada", Ruta:"Port Olisar → Lorville", Riesgo:"Medio", Recompensa:"65,000 aUEC" },
  },
];

const WISHLIST_SHIPS = [
  { name: "Hammerhead", maker: "Aegis", role: "Cañonero",    price: "~42M aUEC",  cv: "accent" as ChipV },
  { name: "890 Jump",   maker: "Origin",role: "Exploración", price: "~350M aUEC", cv: "steel"  as ChipV },
  { name: "Carrack",    maker: "Anvil", role: "Exploración", price: "~48M aUEC",  cv: "olive"  as ChipV },
];

const WISHLIST_COMPS = [
  { name: "K&W S3 Shield",     type: "Escudo",    size: "Talla 3", price: "~180K aUEC" },
  { name: "Behring M7A Laser", type: "Arma",      size: "Talla 4", price: "~240K aUEC" },
  { name: "Aegis Powerplant",  type: "Motor",     size: "Talla 2", price: "~90K aUEC"  },
  { name: "RSI Thruster Type-B",type:"Propulsor", size: "Talla 3", price: "~120K aUEC" },
];

const FRIENDS_PENDING = [
  { init: "VK", color: "accent" as AvV, name: "ViperKal",  time: "Solicitud hace 2 horas" },
  { init: "NX", color: "steel"  as AvV, name: "NovaxSC",   time: "Solicitud hace 1 día"   },
];

const FRIENDS_ONLINE = [
  { init: "eC", color: "olive"  as AvV, name: "elchuker",  meta: "elchuker · Stanton"      },
  { init: "Xo", color: "steel"  as AvV, name: "Xoliii",    meta: "xolii56 · Pyro"          },
  { init: "kz", color: "accent" as AvV, name: "kuzuribot", meta: "kuzuribot · Stanton"     },
];

const FRIENDS_OFFLINE = [
  "DarkKnight","StarRider99","VoidGhost","NebulaByte",
  "AxionPilot","PlanetLord","ZeroRisk","GhostX",
  "RedViper","CryptoRacer","NightKrawler","StarCrash",
];

const PARTY_AVAILABLE = [
  { init: "eC", color: "olive"  as AvV, name: "elchuker",  loc: "Stanton · Hurston"   },
  { init: "Xo", color: "steel"  as AvV, name: "Xoliii",    loc: "Pyro · Ruin Station" },
  { init: "kz", color: "accent" as AvV, name: "kuzuribot", loc: "Stanton · MicroTech" },
];

// ── SVG icons ─────────────────────────────────────────────────────────────

function HexIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 3L22 9V15L12 21L2 15V9L12 3Z" stroke="currentColor" strokeWidth="1.3" fill="none"/>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.2" fill="none"/>
    </svg>
  );
}

function HouseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M3 9L12 3L21 9V20H3V9Z" stroke="currentColor" strokeWidth="1.3" fill="none"/>
      <path d="M9 20V14H15V20" stroke="currentColor" strokeWidth="1.2" fill="none"/>
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L15 9H22L17 14L19 21L12 17L5 21L7 14L2 9H9L12 2Z" stroke="currentColor" strokeWidth="1.3" fill="none"/>
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="6" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.3" fill="none"/>
      <path d="M7 6V5C7 3.9 7.9 3 9 3H15C16.1 3 17 3.9 17 5V6" stroke="currentColor" strokeWidth="1.3"/>
      <line x1="2" y1="11" x2="22" y2="11" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.3" fill="none"/>
      <line x1="12" y1="8" x2="12" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <circle cx="12" cy="16" r="0.8" fill="currentColor"/>
    </svg>
  );
}

// ── Panel: Loadouts ───────────────────────────────────────────────────────

function LoadoutsPanel({ onClose }: { onClose: () => void }) {
  return (
    <>
      <SPHead title="Loadouts guardados" sub="8 NAVES CON CONFIGURACIÓN" onClose={onClose} />
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgba(245,158,11,0.3)_transparent]">
        <Sec>
          <SLabel>Naves con loadout guardado</SLabel>
          {LOADOUTS.map((l) => (
            <Row key={l.ship}>
              <IBox cls={`${avCls[l.cv === "accent" ? "accent" : l.cv === "olive" ? "olive" : l.cv === "steel" ? "steel" : l.cv === "khaki" ? "khaki" : l.cv === "rust" ? "rust" : "muted"]}`}>
                <HexIcon />
              </IBox>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base text-zinc-100 tracking-wide mb-0.5">{l.ship}</div>
                <div className="text-xs text-zinc-400">{l.maker} · {l.role} · {l.crew} tripulante{l.crew !== 1 ? "s" : ""}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Chip v={l.cv}>{l.tag}</Chip>
                <ABtn v="accent">Ver</ABtn>
              </div>
            </Row>
          ))}
        </Sec>
      </div>
    </>
  );
}

// ── Panel: Organización ────────────────────────────────────────────────────

function OrgPanel({ orgName, onClose }: { orgName: string; onClose: () => void }) {
  return (
    <>
      <SPHead title="Organización" sub="48 MIEMBROS · RANGO 3" onClose={onClose} />
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgba(245,158,11,0.3)_transparent]">
        <Sec>
          {/* Org logo block */}
          <div className="flex items-center gap-4 p-4 bg-zinc-800/50 border border-zinc-700/50 rounded-xl mb-4">
            <div className="w-[52px] h-[52px] rounded-lg bg-zinc-800 border border-zinc-600/50 flex items-center justify-center flex-shrink-0">
              <Shield size={24} className="text-slate-300" />
            </div>
            <div>
              <div className="font-bold text-xl text-zinc-100 tracking-wide">{orgName}</div>
              <div className="text-xs text-zinc-400 mt-0.5">Oficial de campo · Rango 3</div>
            </div>
          </div>

          <SubLabel className="mt-0">Miembros en línea · 3</SubLabel>
          {ORG_ONLINE.map((m) => (
            <Row key={m.name}>
              <AvCircle init={m.init} color={m.color} />
              <OnlinePip on={true} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base text-zinc-100 tracking-wide mb-0.5">{m.name}</div>
                <div className="text-xs text-zinc-400">{m.rank}</div>
              </div>
              <div className="flex gap-1.5">
                <ABtn v="olive">+ Party</ABtn>
                <ABtn>+ Amigo</ABtn>
              </div>
            </Row>
          ))}

          <SubLabel>Desconectados · 45</SubLabel>
          {ORG_OFFLINE.map((m) => (
            <Row key={m.name}>
              <AvCircle init={m.init} color="muted" />
              <OnlinePip on={false} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base text-zinc-400 tracking-wide mb-0.5">{m.name}</div>
                <div className="text-xs text-zinc-500">{m.last}</div>
              </div>
              <div className="flex gap-1.5">
                <ABtn>+ Amigo</ABtn>
              </div>
            </Row>
          ))}
        </Sec>
      </div>
    </>
  );
}

// ── Panel: Work Orders ─────────────────────────────────────────────────────

function WorkPanel({ onClose }: { onClose: () => void }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <>
      <SPHead title="Work Orders" sub="3 ACTIVAS · 1 PENDIENTE" onClose={onClose} />
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgba(245,158,11,0.3)_transparent]">
        <Sec>
          <SLabel>Refinado en progreso</SLabel>

          {WORK_ORDERS.map((wo) => {
            const open = expanded.has(wo.id);
            return (
              <div key={wo.id} className="border-b border-zinc-800/30 last:border-b-0">
                <div
                  className="flex items-center gap-3.5 py-3 cursor-pointer select-none group"
                  onClick={() => toggle(wo.id)}
                >
                  <IBox cls={avCls[wo.cv === "accent" ? "accent" : wo.cv === "olive" ? "olive" : wo.cv === "steel" ? "steel" : wo.cv === "khaki" ? "khaki" : wo.cv === "rust" ? "rust" : "muted"]}>
                    <StarIcon />
                  </IBox>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-base text-zinc-100 tracking-wide mb-0.5 group-hover:text-amber-400 transition-colors">{wo.name}</div>
                    <div className="text-xs text-zinc-400">{wo.loc}</div>
                    <ProgBar pct={wo.pct} color={wo.barColor} />
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Chip v={wo.cv}>{wo.pct}%</Chip>
                    <span className="font-mono text-[11px] text-zinc-600">{wo.code}</span>
                    <ChevronDown
                      size={12}
                      className={`text-zinc-600 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                    />
                  </div>
                </div>
                {open && (
                  <div className="bg-zinc-800/40 border border-zinc-700/30 rounded-lg p-3.5 mb-3 grid grid-cols-2 gap-x-5 gap-y-2">
                    {Object.entries(wo.details).map(([k, v]) => (
                      <div key={k} className="flex flex-col gap-0.5">
                        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">{k}</span>
                        <span className="text-[13px] text-zinc-200 font-medium">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <SLabel className="mt-5">Pendiente de aceptar</SLabel>
          {WORK_PENDING.map((wo) => {
            const open = expanded.has(wo.id);
            return (
              <div key={wo.id} className="border-b border-zinc-800/30 last:border-b-0">
                <div
                  className="flex items-center gap-3.5 py-3 cursor-pointer select-none group"
                  onClick={() => toggle(wo.id)}
                >
                  <IBox cls={avCls.rust}>
                    <AlertIcon />
                  </IBox>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-base text-zinc-100 tracking-wide mb-0.5 group-hover:text-amber-400 transition-colors">{wo.name}</div>
                    <div className="text-xs text-zinc-400">{wo.meta}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Chip v="rust">Pendiente</Chip>
                    <ChevronDown
                      size={12}
                      className={`text-zinc-600 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                    />
                  </div>
                </div>
                {open && (
                  <div className="bg-zinc-800/40 border border-zinc-700/30 rounded-lg p-3.5 mb-3 grid grid-cols-2 gap-x-5 gap-y-2">
                    {Object.entries(wo.details).map(([k, v]) => (
                      <div key={k} className="flex flex-col gap-0.5">
                        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">{k}</span>
                        <span className="text-[13px] text-zinc-200 font-medium">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </Sec>
      </div>
    </>
  );
}

// ── Panel: Wishlist ───────────────────────────────────────────────────────

function WishlistPanel({ onClose }: { onClose: () => void }) {
  return (
    <>
      <SPHead title="Wishlist" sub="3 NAVES · 4 COMPONENTES" onClose={onClose} />
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgba(245,158,11,0.3)_transparent]">
        <Sec>
          <SubLabel className="mt-0">Naves</SubLabel>
          {WISHLIST_SHIPS.map((s) => (
            <Row key={s.name}>
              <IBox cls={avCls[s.cv === "accent" ? "accent" : s.cv === "olive" ? "olive" : s.cv === "steel" ? "steel" : "muted"]}>
                <HexIcon />
              </IBox>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base text-zinc-100 tracking-wide mb-0.5">{s.name}</div>
                <div className="text-xs text-zinc-400">{s.maker} · {s.role} · {s.price}</div>
              </div>
              <ABtn v="danger">✕ Quitar</ABtn>
            </Row>
          ))}

          <SubLabel className="mt-5">Componentes</SubLabel>
          {WISHLIST_COMPS.map((c) => (
            <Row key={c.name}>
              <IBox cls={avCls.khaki}>
                <HouseIcon />
              </IBox>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base text-zinc-100 tracking-wide mb-0.5">{c.name}</div>
                <div className="text-xs text-zinc-400">{c.type} · {c.size} · {c.price}</div>
              </div>
              <ABtn v="danger">✕ Quitar</ABtn>
            </Row>
          ))}
        </Sec>
      </div>
    </>
  );
}

// ── Panel: Amigos ─────────────────────────────────────────────────────────

function AmigosPanel({ onClose }: { onClose: () => void }) {
  return (
    <>
      <SPHead title="Amigos" sub="12 AMIGOS · 3 EN LÍNEA" onClose={onClose} />
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgba(245,158,11,0.3)_transparent]">
        <Sec>
          <DashedBtn>
            <UserPlus size={14} />
            AÑADIR AMIGO POR DISCORD
          </DashedBtn>

          <SubLabel className="mt-5">Solicitudes pendientes · 2</SubLabel>
          {FRIENDS_PENDING.map((f) => (
            <Row key={f.name}>
              <AvCircle init={f.init} color={f.color} />
              <div className="w-2.5 h-2.5 rounded-full border-2 border-zinc-900 bg-orange-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base text-zinc-100 tracking-wide mb-0.5">{f.name}</div>
                <div className="text-xs text-zinc-400">{f.time}</div>
              </div>
              <div className="flex gap-1.5">
                <ABtn v="olive">Aceptar</ABtn>
                <ABtn v="danger">Declinar</ABtn>
              </div>
            </Row>
          ))}

          <SubLabel>En línea · 3</SubLabel>
          {FRIENDS_ONLINE.map((f) => (
            <Row key={f.name}>
              <AvCircle init={f.init} color={f.color} />
              <OnlinePip on={true} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base text-zinc-100 tracking-wide mb-0.5">{f.name}</div>
                <div className="text-xs text-zinc-400">{f.meta}</div>
              </div>
              <div className="flex gap-1.5">
                <ABtn v="olive">+ Party</ABtn>
                <ABtn v="danger">Eliminar</ABtn>
              </div>
            </Row>
          ))}

          <SubLabel>Desconectados · {FRIENDS_OFFLINE.length}</SubLabel>
          {FRIENDS_OFFLINE.map((name, i) => (
            <Row key={name}>
              <AvCircle init={name.slice(0, 2).toUpperCase()} color="muted" />
              <OnlinePip on={false} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base text-zinc-400 tracking-wide">{name}</div>
              </div>
              <ABtn v="danger">Eliminar</ABtn>
            </Row>
          ))}
        </Sec>
      </div>
    </>
  );
}

// ── Panel: Party ──────────────────────────────────────────────────────────

function PartyPanel({ onClose }: { onClose: () => void }) {
  return (
    <>
      <SPHead title="Party" sub="ESTADO DE PARTY" onClose={onClose} />
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgba(245,158,11,0.3)_transparent]">
        <Sec>
          {/* Status banner */}
          <div className="flex items-center gap-3 px-4 py-3.5 rounded-lg border border-orange-700/50 bg-orange-600/5 mb-4">
            <div className="w-3 h-3 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(234,88,12,0.5)] flex-shrink-0" />
            <div>
              <div className="font-mono text-[13px] text-orange-400">SIN PARTY ACTIVA</div>
              <div className="text-xs text-zinc-500 mt-0.5">No estás en ninguna party en este momento</div>
            </div>
          </div>

          <DashedBtn solid>
            <Users size={14} />
            CREAR PARTY
          </DashedBtn>

          <SubLabel className="mt-5">Amigos disponibles para invitar</SubLabel>
          {PARTY_AVAILABLE.map((f) => (
            <Row key={f.name}>
              <AvCircle init={f.init} color={f.color} />
              <OnlinePip on={true} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base text-zinc-100 tracking-wide mb-0.5">{f.name}</div>
                <div className="text-xs text-zinc-400">{f.loc}</div>
              </div>
              <ABtn v="olive">Invitar</ABtn>
            </Row>
          ))}
        </Sec>
      </div>
    </>
  );
}

// ── Module card ───────────────────────────────────────────────────────────

function ModCard({
  id, active, onClick, icon, name, meta, chips,
}: {
  id: string; active: boolean; onClick: () => void;
  icon: React.ReactNode; name: string; meta: string;
  chips: React.ReactNode;
}) {
  return (
    <button
      id={id}
      onClick={onClick}
      className={`text-left bg-zinc-800/50 border rounded-xl p-4 cursor-pointer flex items-center gap-3.5 transition-all duration-150 min-h-[82px] ${
        active
          ? "border-amber-500/60 bg-amber-500/5"
          : "border-zinc-700/50 hover:bg-zinc-800 hover:border-zinc-600/70"
      }`}
    >
      <div>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-base text-zinc-100 tracking-wide mb-0.5">{name}</div>
        <div className="text-xs text-zinc-400">{meta}</div>
      </div>
      <div className="flex flex-col gap-1.5 items-end flex-shrink-0">{chips}</div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, profile, loading, signOut, refreshProfile } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  // Panel state
  const [leftPanel,  setLeftPanel]  = useState<LeftPanelId | null>(null);
  const [rightPanel, setRightPanel] = useState<RightPanelId | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Edit state
  const [editMode,     setEditMode]     = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [displayName,  setDisplayName]  = useState("");
  const [country,      setCountry]      = useState("");
  const [orgName,      setOrgName]      = useState<string | null>(null);

  // Auth redirect
  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  // Init profile data
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setCountry(profile.country ?? "");
    }
  }, [profile]);

  // Fetch org name from organizations table
  useEffect(() => {
    if (!profile?.org_id) { setOrgName(null); return; }
    supabase
      .from("organizations")
      .select("name")
      .eq("id", profile.org_id)
      .single()
      .then(({ data }) => setOrgName(data?.name ?? null));
  }, [profile?.org_id]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1600);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  function cancelEdit() {
    setDisplayName(profile?.display_name ?? "");
    setCountry(profile?.country ?? "");
    setEditMode(false);
  }

  function openLeft(id: LeftPanelId) {
    setLeftPanel((prev) => (prev === id ? null : id));
  }

  function openRight(id: RightPanelId) {
    setRightPanel((prev) => (prev === id ? null : id));
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    await supabase.from("profiles").update({
      display_name: displayName || null,
      country:      country || null,
      updated_at:   new Date().toISOString(),
    }).eq("id", user.id);
    await refreshProfile();
    setSaving(false);
    setEditMode(false);
  }

  if (loading || !user) {
    return (
      <main className="relative min-h-screen text-zinc-100 flex items-center justify-center">
        <PageVideoBackground src="/videos/comparador.mp4" />
        <div className="relative z-10 text-zinc-500 font-mono text-sm animate-pulse">CARGANDO PERFIL...</div>
      </main>
    );
  }

  const heroName    = profile?.display_name ?? user.email?.split("@")[0] ?? "Commander";
  const initials    = heroName.slice(0, 2).toUpperCase();
  const avatarUrl   = profile?.avatar_url ?? null;

  // Panel width animation helper
  function panelStyle(open: boolean): React.CSSProperties {
    return {
      width:         open ? "620px" : "0px",
      opacity:       open ? 1 : 0,
      pointerEvents: open ? "auto" : "none",
      transition:    "width 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.32s ease",
      overflow:      "hidden",
      flexShrink:    0,
    };
  }

  // Center border-radius based on open panels
  const bothOpen  = leftPanel  !== null && rightPanel !== null;
  const onlyLeft  = leftPanel  !== null && rightPanel === null;
  const onlyRight = rightPanel !== null && leftPanel  === null;
  const centerRadius = bothOpen
    ? "rounded-none"
    : onlyLeft  ? "rounded-r-2xl rounded-l-none"
    : onlyRight ? "rounded-l-2xl rounded-r-none"
    : "rounded-2xl";

  const dotBg: React.CSSProperties = {
    backgroundImage: "radial-gradient(rgba(245,158,11,0.05) 1px, transparent 1px)",
    backgroundSize:  "28px 28px",
  };

  return (
    <main className="relative h-screen overflow-hidden text-zinc-100 flex flex-col">
      <PageVideoBackground src="/videos/comparador.mp4" />

      {/* Dot grid background (above the video, below content) */}
      <div className="fixed inset-0 pointer-events-none z-[1]" style={dotBg} />

      <Header subtitle="Perfil" />

      <div className="flex flex-1 min-h-0 relative z-10">
        {/* Sidebar */}
        <aside className="w-12 sm:w-14 flex-shrink-0 bg-zinc-950/90 border-r border-zinc-800/50 flex flex-col items-center py-3 gap-1 z-20 overflow-y-auto">
          {SIDEBAR_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              title={item.label}
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded flex items-center justify-center transition-all duration-150 ${
                item.key === "profile"
                  ? "bg-amber-500/15 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.3)]"
                  : "hover:bg-zinc-800/40"
              }`}
            >
              <Image
                src={item.icon}
                alt={item.label}
                width={22}
                height={22}
                className={`transition-opacity ${item.key === "profile" ? "opacity-100" : "opacity-40 hover:opacity-70"}`}
              />
            </Link>
          ))}
        </aside>

        {/* Stage: center always fixed, panels absolutely positioned on each side */}
        <div className="flex-1 relative flex items-center justify-center overflow-y-hidden">

          {/* ── LEFT PANELS — anchored to center's left edge ── */}
          {!isMobile && (
          <div style={{
            position:  "absolute",
            right:     "calc(50% + 440px)",
            top:       "50%",
            transform: "translateY(-50%)",
            height:    "82vh",
            display:   "flex",
            alignItems:"stretch",
          }}>
            {(["loadouts", "org", "work"] as LeftPanelId[]).map((id) => (
              <div
                key={id}
                style={{
                  ...panelStyle(leftPanel === id),
                  borderRadius:   "16px 0 0 16px",
                  background:     "rgba(12,14,10,0.40)",
                  backdropFilter: "blur(16px)",
                  border:         "1px solid rgba(180,170,120,0.15)",
                  borderRight:    "none",
                  display:        "flex",
                  flexDirection:  "column",
                }}
              >
                <div className="h-[3px] bg-gradient-to-l from-amber-600 to-transparent flex-shrink-0" />
                {leftPanel === "loadouts" && id === "loadouts" && <LoadoutsPanel onClose={() => setLeftPanel(null)} />}
                {leftPanel === "org"      && id === "org"      && <OrgPanel orgName={orgName} onClose={() => setLeftPanel(null)} />}
                {leftPanel === "work"     && id === "work"     && <WorkPanel onClose={() => setLeftPanel(null)} />}
              </div>
            ))}
          </div>
          )}

          {/* ── CENTER — always centered ── */}
          <div
            style={{
              width:          "min(880px, 100%)",
              height:         "82vh",
              flexShrink:     0,
              background:     "rgba(12,14,10,0.40)",
              backdropFilter: "blur(16px)",
              border:         "1px solid rgba(180,170,120,0.15)",
              overflow:       "hidden",
              display:        "flex",
              flexDirection:  "column",
              transition:     "border-radius 0.4s cubic-bezier(0.4,0,0.2,1)",
              zIndex:         10,
            }}
            className={centerRadius}
          >
              {/* Center accent line */}
              <div className="h-[3px] bg-gradient-to-r from-amber-600 to-lime-600 flex-shrink-0" />

              {/* Hero */}
              <div className="bg-zinc-900/50 px-7 py-6 border-b border-zinc-800/30 flex items-start gap-5 flex-shrink-0 backdrop-blur-sm">
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className="w-[78px] h-[78px] rounded-full border-2 border-amber-600 bg-zinc-800 flex items-center justify-center font-bold text-[26px] text-amber-500 overflow-hidden">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      initials
                    )}
                  </div>
                  <div className="w-3 h-3 rounded-full bg-lime-400 border-[3px] border-zinc-900 absolute bottom-0.5 right-0.5" />
                </div>

                {/* Name & badges */}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[30px] text-zinc-100 tracking-wide leading-none">{heroName}</div>
                  <div className="flex items-center gap-1.5 mt-1.5 font-mono text-xs text-lime-400">
                    <div className="w-1.5 h-1.5 rounded-full bg-lime-400" />
                    EN LÍNEA
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full border border-slate-600/30 bg-slate-500/10 text-slate-300">
                      <Shield size={10} />
                      {orgName}
                    </span>

                    <span className="inline-flex items-center text-xs font-medium px-3 py-1 rounded-full border border-zinc-700/50 text-zinc-500 font-mono">
                      #{profile?.user_number ?? "—"}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 ml-auto flex-shrink-0">
                  <button className="relative w-10 h-10 rounded-lg border border-zinc-600/70 bg-transparent flex items-center justify-center cursor-pointer text-zinc-400 transition-all hover:bg-zinc-800 hover:text-zinc-100">
                    <MessageSquare size={16} />
                    <div className="w-2 h-2 rounded-full bg-amber-500 border-2 border-zinc-900 absolute top-[7px] right-[7px]" />
                  </button>
                  <button className="w-10 h-10 rounded-lg border border-zinc-600/70 bg-transparent flex items-center justify-center cursor-pointer text-zinc-400 transition-all hover:bg-zinc-800 hover:text-zinc-100">
                    <Activity size={16} />
                  </button>
                  <button
                    onClick={() => setEditMode(true)}
                    className={`h-10 px-5 rounded-lg border font-bold text-sm tracking-wide cursor-pointer transition-all ${
                      editMode
                        ? "bg-amber-600 border-amber-600 text-white"
                        : "border-amber-600 bg-transparent text-amber-500 hover:bg-amber-500/10"
                    }`}
                  >
                    {editMode ? "EDITANDO…" : "EDITAR PERFIL"}
                  </button>
                </div>
              </div>

              {/* Center scrollable body */}
              <div
                className="flex-1 overflow-y-auto overflow-x-hidden"
                style={{
                  scrollbarWidth: "thin",
                  scrollbarColor: "rgba(245,158,11,0.3) transparent",
                }}
              >
                {isMobile && (leftPanel || rightPanel) ? (
                  <>
                    <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-800/40 flex-shrink-0 bg-zinc-900/30">
                      <button
                        onClick={() => { setLeftPanel(null); setRightPanel(null); }}
                        className="flex items-center gap-2 text-sm text-zinc-300 hover:text-zinc-100 transition-colors"
                      >
                        <ChevronDown size={16} className="-rotate-90" />
                        Volver al perfil
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(245,158,11,0.3) transparent" }}>
                      {leftPanel === "loadouts" && <LoadoutsPanel onClose={() => setLeftPanel(null)} />}
                      {leftPanel === "org"      && <OrgPanel orgName={orgName} onClose={() => setLeftPanel(null)} />}
                      {leftPanel === "work"     && <WorkPanel onClose={() => setLeftPanel(null)} />}
                      {rightPanel === "wishlist" && <WishlistPanel onClose={() => setRightPanel(null)} />}
                      {rightPanel === "amigos"   && <AmigosPanel   onClose={() => setRightPanel(null)} />}
                      {rightPanel === "party"    && <PartyPanel    onClose={() => setRightPanel(null)} />}
                    </div>
                  </>
                ) : (
                <>
                {/* Profile data section */}
                <div className="px-7 py-5 border-b border-zinc-800/30">
                  {!editMode && (
                    <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-500 mb-3.5">
                      <Lock size={11} />
                      BLOQUEADO — PULSA "EDITAR PERFIL" PARA MODIFICAR
                    </div>
                  )}

                  <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-zinc-500 mb-3.5">
                    Datos del perfil
                  </div>

                  {editMode ? (
                    <>
                      <div className="grid grid-cols-2 gap-x-10 gap-y-0">
                        <div>
                          <div className="flex justify-between items-center py-2.5 border-b border-zinc-800/30">
                            <span className="text-sm text-zinc-400">Display name</span>
                            <input
                              value={displayName}
                              onChange={(e) => setDisplayName(e.target.value)}
                              className="w-[155px] bg-zinc-800 border border-zinc-600/70 rounded-md px-3 py-1.5 text-[13px] text-zinc-100 focus:border-amber-500 focus:outline-none"
                            />
                          </div>
                          <div className="flex justify-between items-center py-2.5">
                            <span className="text-sm text-zinc-400">Organización</span>
                            <span className="text-sm font-medium text-zinc-200">{orgName ?? "—"}</span>
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between items-center py-2.5 border-b border-zinc-800/30">
                            <span className="text-sm text-zinc-400">RSI Handle</span>
                            <span className="text-sm text-yellow-500 cursor-pointer">{profile?.username ?? "—"} ↗</span>
                          </div>
                          <div className="flex justify-between items-center py-2.5">
                            <span className="text-sm text-zinc-400">Country</span>
                            <input
                              value={country}
                              onChange={(e) => setCountry(e.target.value)}
                              placeholder="País"
                              className="w-[155px] bg-zinc-800 border border-zinc-600/70 rounded-md px-3 py-1.5 text-[13px] text-zinc-100 placeholder-zinc-600 focus:border-amber-500 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2.5 mt-4">
                        <button
                          onClick={cancelEdit}
                          className="h-9 px-4 rounded-lg border border-zinc-600/50 bg-transparent text-zinc-400 text-sm cursor-pointer transition-all hover:bg-zinc-800"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleSave}
                          disabled={saving}
                          className="h-9 px-5 rounded-lg border-none bg-amber-600 text-white font-bold text-sm cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          {saving ? "GUARDANDO..." : "GUARDAR"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="grid grid-cols-2 gap-x-10">
                      <div>
                        <div className="flex justify-between items-center py-2.5 border-b border-zinc-800/30">
                          <span className="text-sm text-zinc-400">Display name</span>
                          <span className="text-sm font-medium text-zinc-100">{heroName}</span>
                        </div>
                        <div className="flex justify-between items-center py-2.5">
                          <span className="text-sm text-zinc-400">Organización</span>
                          <span className="text-sm font-medium text-zinc-200">{orgName ?? "—"}</span>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between items-center py-2.5 border-b border-zinc-800/30">
                          <span className="text-sm text-zinc-400">RSI Handle</span>
                          <span className="text-sm text-yellow-500 cursor-pointer">{profile?.username ?? "—"} ↗</span>
                        </div>
                        <div className="flex justify-between items-center py-2.5">
                          <span className="text-sm text-zinc-400">Country</span>
                          <span className={`text-sm font-medium ${country ? "text-zinc-100" : "text-zinc-600"}`}>{country || "—"}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Module grid */}
                <div className="px-7 py-5">
                  <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-zinc-600 mb-3.5">
                    Módulos
                  </div>
                  <div className="grid grid-cols-2 grid-rows-3 gap-2.5">
                    <ModCard
                      id="mLoadouts"
                      active={leftPanel === "loadouts"}
                      onClick={() => openLeft("loadouts")}
                      icon={<IBox cls="bg-lime-500/10 text-lime-400"><Briefcase size={22} /></IBox>}
                      name="Loadouts guardados"
                      meta="8 naves configuradas"
                      chips={<Chip v="olive">8</Chip>}
                    />
                    <ModCard
                      id="mWishlist"
                      active={rightPanel === "wishlist"}
                      onClick={() => openRight("wishlist")}
                      icon={<IBox cls="bg-yellow-500/10 text-yellow-400"><Star size={22} /></IBox>}
                      name="Wishlist"
                      meta="3 naves · 4 componentes"
                      chips={<Chip v="khaki">7 items</Chip>}
                    />
                    <ModCard
                      id="mOrg"
                      active={leftPanel === "org"}
                      onClick={() => openLeft("org")}
                      icon={<IBox cls="bg-slate-500/10 text-slate-300"><Shield size={22} /></IBox>}
                      name="Organización"
                      meta="48 miembros · Rango 3"
                      chips={<Chip v="steel">R3</Chip>}
                    />
                    <ModCard
                      id="mAmigos"
                      active={rightPanel === "amigos"}
                      onClick={() => openRight("amigos")}
                      icon={<IBox cls="bg-lime-500/10 text-lime-400"><Users size={22} /></IBox>}
                      name="Amigos"
                      meta="12 amigos · 3 en línea"
                      chips={<><Chip v="olive">3 online</Chip><Chip v="rust">2 solicitudes</Chip></>}
                    />
                    <ModCard
                      id="mWork"
                      active={leftPanel === "work"}
                      onClick={() => openLeft("work")}
                      icon={<IBox cls="bg-amber-500/10 text-amber-400"><Package size={22} /></IBox>}
                      name="Work Orders"
                      meta="3 activas · 1 pendiente"
                      chips={<Chip v="accent">3 activas</Chip>}
                    />
                    <ModCard
                      id="mParty"
                      active={rightPanel === "party"}
                      onClick={() => openRight("party")}
                      icon={<IBox cls="bg-slate-500/10 text-slate-300"><Activity size={22} /></IBox>}
                      name="Party"
                      meta="Sin party activa"
                      chips={<Chip v="ghost">—</Chip>}
                    />
                  </div>
                </div>

                {/* Sign out */}
                <div className="px-7 pb-6 flex justify-end">
                  <button
                    onClick={signOut}
                    className="text-xs font-mono text-zinc-600 hover:text-zinc-400 transition-colors tracking-widest uppercase"
                  >
                    Cerrar sesión
                  </button>
                </div>
                </>
                )}
              </div>
            </div>

          {/* ── RIGHT PANELS — anchored to center's right edge ── */}
          {!isMobile && (
          <div style={{
            position:  "absolute",
            left:      "calc(50% + 440px)",
            top:       "50%",
            transform: "translateY(-50%)",
            height:    "82vh",
            display:   "flex",
            alignItems:"stretch",
          }}>
            {(["wishlist", "amigos", "party"] as RightPanelId[]).map((id) => (
              <div
                key={id}
                style={{
                  ...panelStyle(rightPanel === id),
                  borderRadius:   "0 16px 16px 0",
                  background:     "rgba(12,14,10,0.40)",
                  backdropFilter: "blur(16px)",
                  border:         "1px solid rgba(180,170,120,0.15)",
                  borderLeft:     "none",
                  display:        "flex",
                  flexDirection:  "column",
                }}
              >
                <div className="h-[3px] bg-gradient-to-r from-amber-600 to-transparent flex-shrink-0" />
                {rightPanel === "wishlist" && id === "wishlist" && <WishlistPanel onClose={() => setRightPanel(null)} />}
                {rightPanel === "amigos"   && id === "amigos"   && <AmigosPanel   onClose={() => setRightPanel(null)} />}
                {rightPanel === "party"    && id === "party"    && <PartyPanel    onClose={() => setRightPanel(null)} />}
              </div>
            ))}
          </div>
          )}

        </div>
      </div>
    </main>
  );
}
