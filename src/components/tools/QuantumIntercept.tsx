"use client";
import { useRef, useEffect, useState, useCallback, useMemo } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface POI {
  id: string;
  name: string;
  type: "star" | "planet" | "moon" | "station" | "jumppoint";
  group: string;
  x: number;
  y: number;
  z?: number;         // km from system plane (non-zero mainly for jump points)
  commrange?: number; // km — comm array / station broadcast radius
  color?: string;
}

interface DrivePreset {
  label: string;
  vmax: number;
  a1: number;
  a2: number;
}

interface SystemConfig {
  id: string;
  name: string;
  mapRadius: number;
  orbitRings: { r: number; color: string }[];
  pois: POI[];
}

// ─── Stanton POIs — snareplan.dolus.eu 4.7LIVE ────────────────────────────────

const STANTON_POIS: POI[] = [
  { id: "stantonstar", name: "Stanton", type: "star", group: "star", x: 0, y: 0, color: "#fbbf24" },

  // Jump points
  { id: "jp_stan_magnus", name: "Stanton–Magnus Jump Point", type: "jumppoint", group: "jumppoints", x: -62_284_283, y:  23_467_603, z:  20_198_397 },
  { id: "gw_stan_magnus", name: "Nyx Gateway",               type: "station",   group: "jumppoints", x: -62_284_324, y:  23_467_576, z:  20_198_379, commrange: 150 },
  { id: "jp_stan_pyro",   name: "Stanton–Pyro Jump Point",   type: "jumppoint", group: "jumppoints", x:   3_310_492, y: -27_979_408, z:  -2_676_322 },
  { id: "gw_stan_pyro",   name: "Pyro Gateway",              type: "station",   group: "jumppoints", x:   3_310_496, y: -27_979_395, z:  -2_676_325, commrange: 150 },
  { id: "jp_stan_terra",  name: "Stanton–Terra Jump Point",  type: "jumppoint", group: "jumppoints", x:  51_118_222, y:  -5_269_981, z:  -4_339_552 },
  { id: "gw_stan_terra",  name: "Terra Gateway",             type: "station",   group: "jumppoints", x:  51_118_210, y:  -5_270_029, z:  -4_339_550, commrange: 150 },

  // Hurston
  { id: "stanton1",      name: "Hurston",          type: "planet",  group: "stanton1", x:  12_850_457, y:           0, color: "#c2783a", commrange: 20_250 },
  { id: "stanton1a",     name: "Arial",            type: "moon",    group: "stanton1", x:  12_892_673, y:     -31_476, commrange: 20_250 },
  { id: "stanton1b",     name: "Aberdeen",         type: "moon",    group: "stanton1", x:  12_905_758, y:      40_956, commrange: 20_250 },
  { id: "stanton1c",     name: "Magda",            type: "moon",    group: "stanton1", x:  12_792_686, y:     -74_465, commrange: 20_250 },
  { id: "stanton1d",     name: "Ita",              type: "moon",    group: "stanton1", x:  12_830_195, y:     114_914, commrange: 20_250 },
  { id: "everus_harbor", name: "Everus Harbor",    type: "station", group: "stanton1", x:  12_850_457, y:           0, commrange: 150 },

  // Crusader
  { id: "stanton2",  name: "Crusader",         type: "planet",  group: "stanton2", x: -18_962_176, y:  -2_664_960, color: "#7ec8e3", commrange: 20_250 },
  { id: "stanton2a", name: "Cellin",           type: "moon",    group: "stanton2", x: -18_987_611, y:  -2_709_010, commrange: 20_250 },
  { id: "stanton2b", name: "Daymar",           type: "moon",    group: "stanton2", x: -18_930_540, y:  -2_610_159, commrange: 20_250 },
  { id: "stanton2c", name: "Yela",             type: "moon",    group: "stanton2", x: -19_022_917, y:  -2_613_996, commrange: 20_250 },
  { id: "seraphim",  name: "Seraphim Station", type: "station", group: "stanton2", x: -18_962_176, y:  -2_664_960, commrange: 150 },

  // ArcCorp
  { id: "stanton3",  name: "ArcCorp",       type: "planet",  group: "stanton3", x:  18_587_665, y: -22_151_917, color: "#818cf8", commrange: 20_250 },
  { id: "stanton3a", name: "Lyria",         type: "moon",    group: "stanton3", x:  18_703_607, y: -22_121_650, commrange: 20_250 },
  { id: "stanton3b", name: "Wala",          type: "moon",    group: "stanton3", x:  18_379_649, y: -22_000_467, commrange: 20_250 },
  { id: "baijini",   name: "Baijini Point", type: "station", group: "stanton3", x:  18_587_665, y: -22_151_917, commrange: 150 },

  // microTech
  { id: "stanton4",     name: "microTech",    type: "planet",  group: "stanton4", x:  22_462_085, y:  37_185_745, color: "#bae6fd", commrange: 20_250 },
  { id: "stanton4a",    name: "Calliope",     type: "moon",    group: "stanton4", x:  22_525_801, y:  37_202_649, commrange: 20_250 },
  { id: "stanton4b",    name: "Clio",         type: "moon",    group: "stanton4", x:  22_447_442, y:  37_280_470, commrange: 20_250 },
  { id: "stanton4c",    name: "Euterpe",      type: "moon",    group: "stanton4", x:  22_436_061, y:  37_290_366, commrange: 20_250 },
  { id: "port_tressler",name: "Port Tressler",type: "station", group: "stanton4", x:  22_462_085, y:  37_185_745, commrange: 150 },

  // Lagrange R&R stations (CRU L2/L3 unnamed — no R&R in 4.7LIVE)
  { id: "rr_hur_l1", name: "HUR-L1 Green Glade",        type: "station", group: "lagrange", x:  11_561_413, y:          -263, commrange: 150 },
  { id: "rr_hur_l2", name: "HUR-L2 Faithful Dream",     type: "station", group: "lagrange", x:  14_139_636, y:        -1_967, commrange: 150 },
  { id: "rr_hur_l3", name: "HUR-L3 Thundering Express", type: "station", group: "lagrange", x: -12_844_744, y:        -1_554, commrange: 150 },
  { id: "rr_hur_l4", name: "HUR-L4 Melodic Fields",     type: "station", group: "lagrange", x:   6_427_628, y:    11_124_767, commrange: 150 },
  { id: "rr_hur_l5", name: "HUR-L5 High Course",        type: "station", group: "lagrange", x:   6_425_723, y:   -11_128_362, commrange: 150 },
  { id: "rr_cru_l1", name: "CRU-L1 Ambitious Dream",    type: "station", group: "lagrange", x: -17_068_754, y:    -2_399_482, commrange: 150 },
  { id: "cru_l2",    name: "CRU L2",                    type: "station", group: "lagrange", x: -20_858_376, y:    -2_931_474 },
  { id: "cru_l3",    name: "CRU L3",                    type: "station", group: "lagrange", x:  18_962_165, y:     2_664_965 },
  { id: "rr_cru_l4", name: "CRU-L4 Shallow Fields",     type: "station", group: "lagrange", x:  -7_173_768, y:   -17_750_056, commrange: 150 },
  { id: "rr_cru_l5", name: "CRU-L5 Beautiful Glen",     type: "station", group: "lagrange", x: -11_785_012, y:    15_091_236, commrange: 150 },
  { id: "rr_arc_l1", name: "ARC-L1 Wide Forest",        type: "station", group: "lagrange", x:  16_729_220, y:   -19_942_048, commrange: 150 },
  { id: "rr_arc_l2", name: "ARC-L2 Lively Pathway",     type: "station", group: "lagrange", x:  20_451_006, y:   -24_368_054, commrange: 150 },
  { id: "rr_arc_l3", name: "ARC-L3 Modern Express",     type: "station", group: "lagrange", x: -25_045_525, y:    14_463_255, commrange: 150 },
  { id: "rr_arc_l4", name: "ARC-L4 Faint Glen",         type: "station", group: "lagrange", x:  28_476_140, y:     5_018_904, commrange: 150 },
  { id: "rr_arc_l5", name: "ARC-L5 Yellow Core",        type: "station", group: "lagrange", x:  -9_895_752, y:   -27_175_157, commrange: 150 },
  { id: "rr_mic_l1", name: "MIC-L1 Shallow Frontier",   type: "station", group: "lagrange", x:  20_215_827, y:    33_467_070, commrange: 150 },
  { id: "rr_mic_l2", name: "MIC-L2 Long Forest",        type: "station", group: "lagrange", x:  24_713_775, y:    40_912_934, commrange: 150 },
  { id: "rr_mic_l3", name: "MIC-L3 Endless Odyssey",    type: "station", group: "lagrange", x: -22_452_218, y:   -37_179_923, commrange: 150 },
  { id: "rr_mic_l4", name: "MIC-L4 Red Crossroads",     type: "station", group: "lagrange", x: -20_968_721, y:    38_056_058, commrange: 150 },
  { id: "rr_mic_l5", name: "MIC-L5 Modern Icarus",      type: "station", group: "lagrange", x:  43_448_560, y:      -857_708, commrange: 150 },
];

// ─── Pyro POIs — snareplan.dolus.eu 4.7LIVE ───────────────────────────────────

const PYRO_POIS: POI[] = [
  { id: "pyrostar", name: "Pyro", type: "star", group: "star", x: 0, y: 0, color: "#ff6b35" },

  // Jump points
  { id: "jp_pyro_nyx",  name: "Pyro–Nyx Jump Point",     type: "jumppoint", group: "jumppoints", x:  32_994_002, y: -38_151_692 },
  { id: "gw_pyro_nyx",  name: "Nyx Gateway",             type: "station",   group: "jumppoints", x:  32_993_982, y: -38_151_730 },
  { id: "jp_pyro_stan", name: "Pyro–Stanton Jump Point", type: "jumppoint", group: "jumppoints", x: -37_609_204, y:  37_435_781 },
  { id: "gw_pyro_stan", name: "Stanton Gateway",         type: "station",   group: "jumppoints", x: -37_609_223, y:  37_435_744 },

  // Pyro I
  { id: "pyro1",    name: "Pyro I",  type: "planet",  group: "pyro1", x:  1_720_027, y:  -8_091_981, color: "#cc3300" },
  { id: "p1_l1",    name: "PYR1 L1", type: "station", group: "pyro1", x:  1_674_988, y:  -7_254_639 },
  { id: "p1_l2",    name: "PYR1 L2", type: "station", group: "pyro1", x:  1_892_034, y:  -8_901_176 },
  { id: "p1_l3",    name: "PYR1 L3", type: "station", group: "pyro1", x: -1_533_856, y:   8_431_466 },
  { id: "p1_l4",    name: "PYR1 L4", type: "station", group: "pyro1", x:  7_867_868, y:  -2_556_421 },
  { id: "p1_l5",    name: "PYR1 L5", type: "station", group: "pyro1", x: -6_147_857, y:  -5_535_561 },

  // Monox (Pyro II)
  { id: "pyro2",    name: "Monox",    type: "planet",  group: "pyro2", x:  9_198_417, y:  5_310_746, color: "#d4622a" },
  { id: "p2_l1",    name: "PYR2 L1", type: "station", group: "pyro2", x:  8_192_319, y:  4_923_383 },
  { id: "p2_l2",    name: "PYR2 L2", type: "station", group: "pyro2", x: 10_118_286, y:  5_841_799 },
  { id: "p2_l3",    name: "PYR2 L3", type: "station", group: "pyro2", x:-10_460_084, y: -1_844_403 },
  { id: "checkmate",name: "Checkmate",type: "station", group: "pyro2", x:  1_833_362, y: 10_434_543 },
  { id: "p2_l5",    name: "PYR2 L5", type: "station", group: "pyro2", x:  8_136_519, y: -6_827_319 },

  // Bloom (Pyro III)
  { id: "pyro3",    name: "Bloom",                  type: "planet",  group: "pyro3", x: -8_900_812, y: -15_417_126, color: "#4a7a3b" },
  { id: "orbituary",name: "Orbituary",              type: "station", group: "pyro3", x: -8_900_433, y: -15_417_845 },
  { id: "starlight",name: "Starlight Service",      type: "station", group: "pyro3", x: -7_756_636, y: -14_008_864 },
  { id: "p3_l2",    name: "PYR3 L2",               type: "station", group: "pyro3", x: -9_791_149, y: -16_958_834 },
  { id: "patch_city",name: "Patch City",            type: "station", group: "pyro3", x: 11_445_283, y:  13_622_341 },
  { id: "p3_l4",    name: "PYR3 L4",               type: "station", group: "pyro3", x:  8_901_105, y: -15_417_097 },
  { id: "p3_l5",    name: "PYR3 L5",               type: "station", group: "pyro3", x:-11_443_003, y:  13_637_233 },

  // Pyro IV
  { id: "pyro4", name: "Pyro IV", type: "planet", group: "pyro4", x: 42_614_452, y: -7_273_027, color: "#cc4400" },

  // Pyro V
  { id: "pyro5",     name: "Pyro V",               type: "planet",  group: "pyro5", x: 42_285_288, y:  -7_454_573, color: "#7a8899" },
  { id: "pyro5a",    name: "Ignis",                type: "moon",    group: "pyro5", x: 42_296_899, y:  -7_508_634 },
  { id: "pyro5b",    name: "Vatra",                type: "moon",    group: "pyro5", x: 42_216_747, y:  -7_426_185 },
  { id: "pyro5c",    name: "Adir",                 type: "moon",    group: "pyro5", x: 42_263_800, y:  -7_355_658 },
  { id: "pyro5d",    name: "Fairo",                type: "moon",    group: "pyro5", x: 42_403_147, y:  -7_498_534 },
  { id: "pyro5e",    name: "Fuego",                type: "moon",    group: "pyro5", x: 42_364_518, y:  -7_328_410 },
  { id: "pyro5f",    name: "Vuur",                 type: "moon",    group: "pyro5", x: 42_164_444, y:  -7_582_532 },
  { id: "p5_l1",    name: "PYR5 L1",              type: "station", group: "pyro5", x: 38_056_546, y:  -6_710_238 },
  { id: "gaslight",  name: "Gaslight",             type: "station", group: "pyro5", x: 46_494_449, y:  -8_190_926 },
  { id: "p5_l3",    name: "PYR5 L3",              type: "station", group: "pyro5", x:-37_184_864, y:  21_468_613 },
  { id: "rods_fuel", name: "Rod's Fuel 'N Supplies",type: "station", group: "pyro5", x: 14_664_316, y:  40_338_625 },
  { id: "rats_nest", name: "Rat's Nest",           type: "station", group: "pyro5", x:  3_732_646, y: -42_766_914 },

  // Terminus (Pyro VI)
  { id: "pyro6",      name: "Terminus",           type: "planet",  group: "pyro6", x: -52_336_520, y: -43_918_228, color: "#4a5568" },
  { id: "ruin_sta",   name: "Ruin Station",       type: "station", group: "pyro6", x: -52_336_520, y: -43_918_228 },
  { id: "p6_l1",     name: "PYR6 L1",            type: "station", group: "pyro6", x: -49_942_386, y: -43_414_685 },
  { id: "p6_l2",     name: "PYR6 L2",            type: "station", group: "pyro6", x: -54_297_047, y: -45_561_095 },
  { id: "endgame",    name: "Endgame",            type: "station", group: "pyro6", x:  48_296_755, y:  48_291_979 },
  { id: "dudley",     name: "Dudley & Daughters", type: "station", group: "pyro6", x:  23_342_576, y: -64_225_960 },
  { id: "megumi",     name: "Megumi Refueling",   type: "station", group: "pyro6", x: -59_145_571, y:  34_145_523 },
];

// ─── Nyx POIs — snareplan.dolus.eu 4.7LIVE ────────────────────────────────────

const NYX_POIS: POI[] = [
  { id: "nyxstar", name: "Nyx", type: "star", group: "star", x: 0, y: 0, color: "#e0802a" },

  // Jump points
  { id: "jp_nyx_castra", name: "Nyx–Castra Jump Point", type: "jumppoint", group: "jumppoints", x: -13_499_936, y: -23_382_715 },
  { id: "gw_nyx_castra", name: "Stanton Gateway",       type: "station",   group: "jumppoints", x: -13_499_932, y: -23_382_702 },
  { id: "jp_nyx_pyro",   name: "Nyx–Pyro Jump Point",   type: "jumppoint", group: "jumppoints", x: -12_000_044, y:  20_784_584 },
  { id: "gw_nyx_pyro",   name: "Pyro Gateway",          type: "station",   group: "jumppoints", x: -12_000_045, y:  20_784_581 },

  // Planets
  { id: "nyx1", name: "Nyx I",   type: "planet", group: "nyx1", x:   6_495_194, y:  -3_749_995, color: "#6b7a8d" },
  { id: "nyx2", name: "Nyx II",  type: "planet", group: "nyx2", x:  -3_591_211, y:   9_866_771, color: "#5a6e7f" },
  { id: "nyx3", name: "Nyx III (Delamar)", type: "planet", group: "nyx3", x: -29_109_694, y: -24_425_931, color: "#4a5e6f" },

  // Delamar (Nyx III) — Levsky (offset visual ~1.5Mkm para separarlo del planeta en el mapa)
  { id: "levsky", name: "Levsky", type: "station", group: "nyx3", x: -27_609_694, y: -24_425_931 },

  // QV Breaker Stations (~48 Mkm ring, 20 stations at 18° intervals)
  { id: "brk_204", name: "QV Breaker BRK-204", type: "station", group: "breakers", x:  47_999_735, y:           0 },
  { id: "brk_320", name: "QV Breaker BRK-320", type: "station", group: "breakers", x:  45_104_452, y:  16_416_678 },
  { id: "brk_546", name: "QV Breaker BRK-546", type: "station", group: "breakers", x:  36_770_077, y:  30_853_759 },
  { id: "brk_127", name: "QV Breaker BRK-127", type: "station", group: "breakers", x:  23_999_784, y:  41_568_849 },
  { id: "brk_425", name: "QV Breaker BRK-425", type: "station", group: "breakers", x:   8_334_906, y:  47_269_658 },
  { id: "brk_608", name: "QV Breaker BRK-608", type: "station", group: "breakers", x:  -8_335_073, y:  47_270_545 },
  { id: "brk_267", name: "QV Breaker BRK-267", type: "station", group: "breakers", x: -23_999_881, y:  41_569_008 },
  { id: "brk_235", name: "QV Breaker BRK-235", type: "station", group: "breakers", x: -36_769_993, y:  30_853_673 },
  { id: "brk_304", name: "QV Breaker BRK-304", type: "station", group: "breakers", x: -45_104_683, y:  16_416_742 },
  { id: "brk_521", name: "QV Breaker BRK-521", type: "station", group: "breakers", x: -47_998_823, y:          -4 },
  { id: "brk_985", name: "QV Breaker BRK-985", type: "station", group: "breakers", x: -45_105_031, y: -16_416_889 },
  { id: "brk_542", name: "QV Breaker BRK-542", type: "station", group: "breakers", x: -41_568_976, y: -23_999_872 },
  { id: "brk_184", name: "QV Breaker BRK-184", type: "station", group: "breakers", x: -36_770_032, y: -30_853_717 },
  { id: "brk_970", name: "QV Breaker BRK-970", type: "station", group: "breakers", x: -30_853_448, y: -36_769_754 },
  { id: "brk_879", name: "QV Breaker BRK-879", type: "station", group: "breakers", x: -23_999_451, y: -41_568_279 },
  { id: "brk_563", name: "QV Breaker BRK-563", type: "station", group: "breakers", x:  -8_335_070, y: -47_270_545 },
  { id: "brk_782", name: "QV Breaker BRK-782", type: "station", group: "breakers", x:   8_335_085, y: -47_270_493 },
  { id: "brk_711", name: "QV Breaker BRK-711", type: "station", group: "breakers", x:  23_999_946, y: -41_569_086 },
  { id: "brk_284", name: "QV Breaker BRK-284", type: "station", group: "breakers", x:  36_769_765, y: -30_853_415 },
  { id: "brk_437", name: "QV Breaker BRK-437", type: "station", group: "breakers", x:  45_104_220, y: -16_416_605 },
];

// ─── Systems ──────────────────────────────────────────────────────────────────

const SYSTEMS: SystemConfig[] = [
  {
    id: "stanton",
    name: "Stanton",
    mapRadius: 68_000_000,
    orbitRings: [
      { r: 12_850_000, color: "rgba(200,120,60,0.40)" },
      { r: 19_133_000, color: "rgba(120,160,220,0.35)" },
      { r: 28_917_000, color: "rgba(140,140,220,0.30)" },
      { r: 43_446_000, color: "rgba(140,210,240,0.28)" },
    ],
    pois: STANTON_POIS,
  },
  {
    id: "pyro",
    name: "Pyro",
    mapRadius: 72_000_000,
    orbitRings: [
      { r:  8_273_000, color: "rgba(255,100,30,0.42)" },
      { r: 10_621_000, color: "rgba(255,90,25,0.36)" },
      { r: 17_802_000, color: "rgba(230,80,25,0.30)" },
      { r: 43_200_000, color: "rgba(210,65,20,0.25)" },
      { r: 68_020_000, color: "rgba(190,55,20,0.20)" },
    ],
    pois: PYRO_POIS,
  },
  {
    id: "nyx",
    name: "Nyx",
    mapRadius: 52_000_000,
    orbitRings: [
      { r:  7_500_000, color: "rgba(110,140,180,0.40)" },
      { r: 10_500_000, color: "rgba(100,130,170,0.35)" },
      { r: 38_000_000, color: "rgba(85,110,150,0.30)" },
      { r: 48_000_000, color: "rgba(75,100,140,0.35)" },
    ],
    pois: NYX_POIS,
  },
];

// ─── Drive presets ────────────────────────────────────────────────────────────

const DRIVE_PRESETS: DrivePreset[] = [
  { label: "Civilian",  vmax:  65_000, a1: 250, a2: 1_200 },
  { label: "Military",  vmax: 198_000, a1: 610, a2: 3_575 },
  { label: "Stealth",   vmax: 149_000, a1: 420, a2: 2_800 },
];

// ─── Physics (Erec @Erec, Alpha 3.12) ─────────────────────────────────────────

function calcTravelTime(a1: number, a2: number, vmax: number, d: number): number {
  if (d <= 0) return 0;
  const dc = d - (4 * vmax ** 2 * (2 * a1 + a2)) / (3 * (a1 + a2) ** 2);
  if (dc >= 0) {
    return (4 * vmax) / (a1 + a2) + d / vmax - (4 * vmax * (2 * a1 + a2)) / (3 * (a1 + a2) ** 2);
  }
  const z = (3 * (a2 - a1) ** 2 * (a1 + a2) ** 2 * d) / (8 * a1 ** 3 * vmax ** 2) - 1;
  const factor = (4 * a1 * vmax) / (a2 ** 2 - a1 ** 2);
  if (z > 1) {
    return factor * (2 * Math.cosh(Math.log(z - Math.sqrt(z ** 2 - 1)) / 3) - 1);
  }
  return factor * (2 * Math.cos(Math.acos(Math.max(-1, Math.min(1, z))) / 3) - 1);
}

function dist3D(a: POI, b: POI): number {
  const dz = (b.z ?? 0) - (a.z ?? 0);
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + dz ** 2);
}

function fmtTime(s: number): string {
  if (!isFinite(s) || s <= 0) return "—";
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

function fmtDist(km: number): string {
  if (km >= 1_000_000) return `${(km / 1_000_000).toFixed(2)} Mkm`;
  if (km >= 1_000)     return `${(km / 1_000).toFixed(1)} kkm`;
  return `${km.toFixed(0)} km`;
}

function cardinalDir(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  return dirs[Math.round(deg / 45) % 8];
}

// ─── Group labels ─────────────────────────────────────────────────────────────

const GROUP_LABELS: Record<string, Record<string, string>> = {
  stanton: {
    jumppoints: "Jump Points",
    stanton1: "Hurston System",
    stanton2: "Crusader System",
    stanton3: "ArcCorp System",
    stanton4: "microTech System",
    lagrange: "Lagrange Stations",
  },
  pyro: {
    jumppoints: "Jump Points",
    pyro1: "Pyro I",
    pyro2: "Monox (Pyro II)",
    pyro3: "Bloom (Pyro III)",
    pyro4: "Pyro IV",
    pyro5: "Pyro V",
    pyro6: "Terminus (Pyro VI)",
  },
  nyx: {
    jumppoints: "Jump Points",
    nyx1: "Nyx I",
    nyx2: "Nyx II",
    nyx3: "Nyx III",
    breakers: "QV Breaker Stations",
  },
};

const PLANET_RADIUS: Record<string, number> = {
  stantonstar: 14, pyrostar: 14, nyxstar: 12,
  stanton1: 7, stanton2: 9, stanton3: 6, stanton4: 6,
  pyro1: 5, pyro2: 5, pyro3: 6, pyro4: 5, pyro5: 7, pyro6: 6,
  nyx1: 5, nyx2: 5, nyx3: 5,
};

// ─── SearchSelect ─────────────────────────────────────────────────────────────

interface SearchSelectProps {
  value: string;
  onChange: (id: string) => void;
  options: POI[];
  groupLabels: Record<string, string>;
  disabledId: string;
  placeholder: string;
}

function poiPrefix(type: POI["type"]) {
  if (type === "jumppoint") return "◇ ";
  if (type === "station")   return "  ";
  if (type === "moon")      return " ";
  return "";
}

function SearchSelect({ value, onChange, options, groupLabels, disabledId, placeholder }: SearchSelectProps) {
  const [query, setQuery]   = useState("");
  const [open,  setOpen]    = useState(false);
  const containerRef        = useRef<HTMLDivElement>(null);
  const inputRef            = useRef<HTMLInputElement>(null);

  const selected = options.find((p) => p.id === value);

  const filtered = options.filter(
    (p) => p.id !== disabledId && p.name.toLowerCase().includes(query.toLowerCase())
  );
  const groupKeys = [...new Set(filtered.map((p) => p.group))];
  const byGroup   = (gk: string) => filtered.filter((p) => p.group === gk);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className="relative">
      <div
        onClick={() => setOpen(true)}
        className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 flex items-center gap-1 cursor-pointer focus-within:border-cyan-600 transition-colors"
      >
        {open ? (
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); setQuery(""); } }}
            placeholder="Buscar..."
            className="flex-1 bg-transparent outline-none text-sm text-zinc-100 placeholder-zinc-500"
          />
        ) : (
          <span className={`flex-1 text-sm truncate ${selected ? "text-zinc-100" : "text-zinc-500"}`}>
            {selected ? `${poiPrefix(selected.type)}${selected.name}` : placeholder}
          </span>
        )}
        {value && !open && (
          <button
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            className="text-zinc-500 hover:text-zinc-300 text-xs ml-1"
          >✕</button>
        )}
        {!open && <span className="text-zinc-600 text-xs ml-1">▾</span>}
      </div>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-zinc-900 border border-zinc-700 rounded shadow-xl max-h-60 overflow-y-auto">
          {groupKeys.length === 0 ? (
            <div className="px-3 py-2 text-zinc-500 text-xs">Sin resultados</div>
          ) : (
            groupKeys.map((gk) => (
              <div key={gk}>
                <div className="px-3 py-1 text-xs text-zinc-500 uppercase tracking-wider bg-zinc-950/80 sticky top-0">
                  {groupLabels[gk] ?? gk}
                </div>
                {byGroup(gk).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelect(p.id)}
                    className={`w-full text-left px-3 py-1.5 text-sm transition-colors hover:bg-zinc-800 ${
                      p.id === value ? "text-cyan-300 bg-zinc-800/50" : "text-zinc-200"
                    }`}
                  >
                    {poiPrefix(p.type)}{p.name}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function QuantumIntercept() {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [systemId,     setSystemId]     = useState("stanton");
  const [originId,     setOriginId]     = useState("");
  const [destId,       setDestId]       = useState("");
  const [interceptPct, setInterceptPct] = useState(50);
  const [driveIdx,     setDriveIdx]     = useState(1);
  const [hoveredPoi,   setHoveredPoi]   = useState<string | null>(null);
  const [zoom,         setZoom]         = useState(0);
  const [pan,          setPan]          = useState({ x: 0, y: 0 });
  const [showComlinks, setShowComlinks] = useState(false);

  const isDragging  = useRef(false);
  const dragStart   = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const bgImageRef  = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new window.Image();
    img.src = "/bg/starfield.jpg";
    img.onload = () => { bgImageRef.current = img; draw(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const system = SYSTEMS.find((s) => s.id === systemId) ?? SYSTEMS[0];
  const POIS   = system.pois;

  const origin = POIS.find((p) => p.id === originId) ?? null;
  const dest   = POIS.find((p) => p.id === destId)   ?? null;

  const totalDist     = origin && dest ? dist3D(origin, dest) : 0;
  const interceptDist = totalDist * (interceptPct / 100);

  const drive         = DRIVE_PRESETS[driveIdx];
  const totalTime     = origin && dest ? calcTravelTime(drive.a1, drive.a2, drive.vmax, totalDist) : 0;
  const interceptTime = origin && dest ? calcTravelTime(drive.a1, drive.a2, drive.vmax, interceptDist) : 0;

  const interceptPos = origin && dest ? {
    x: origin.x + (dest.x - origin.x) * (interceptPct / 100),
    y: origin.y + (dest.y - origin.y) * (interceptPct / 100),
    z: (origin.z ?? 0) + ((dest.z ?? 0) - (origin.z ?? 0)) * (interceptPct / 100),
  } : null;

  const nearestToIntercept = useMemo(() => {
    if (!interceptPos || !origin || !dest) return null;
    let nearest: POI | null = null;
    let minD = Infinity;
    POIS.forEach((poi) => {
      if (poi.type === "star" || poi.id === originId || poi.id === destId) return;
      const dz = (poi.z ?? 0) - interceptPos.z;
      const d = Math.sqrt((poi.x - interceptPos.x) ** 2 + (poi.y - interceptPos.y) ** 2 + dz ** 2);
      if (d < minD) { minD = d; nearest = poi; }
    });
    return nearest ? { poi: nearest, dist: minD } : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interceptPos?.x, interceptPos?.y, originId, destId, systemId]);

  const bearingDeg = useMemo(() => {
    if (!nearestToIntercept || !interceptPos) return null;
    const dx = interceptPos.x - nearestToIntercept.poi.x;
    const dy = interceptPos.y - nearestToIntercept.poi.y;
    const a  = Math.atan2(dx, dy) * (180 / Math.PI);
    return Math.round(((a % 360) + 360) % 360);
  }, [nearestToIntercept, interceptPos]);

  // ── Canvas drawing ──────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas    = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const W = container.clientWidth;
    const H = container.clientHeight;
    canvas.width  = W;
    canvas.height = H;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const autoZoom = (Math.min(W, H) * 0.88) / (system.mapRadius * 2);
    const z  = zoom || autoZoom;
    const cx = W / 2 + pan.x;
    const cy = H / 2 + pan.y;

    const toScreen = (wx: number, wy: number) => ({
      sx: cx + wx * z,
      sy: cy - wy * z,
    });

    if (bgImageRef.current) {
      ctx.drawImage(bgImageRef.current, 0, 0, W, H);
      ctx.fillStyle = "rgba(0,0,0,0.38)";
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = "#09090b";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      for (let i = 0; i < 220; i++) {
        const sx = ((i * 137.508 * W) % W + W) % W;
        const sy = ((i * 97.312  * H) % H + H) % H;
        ctx.fillRect(sx, sy, i % 5 === 0 ? 1.5 : 1, i % 5 === 0 ? 1.5 : 1);
      }
    }

    // Orbital rings
    system.orbitRings.forEach(({ r, color }) => {
      const { sx, sy } = toScreen(0, 0);
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur  = 6;
      ctx.beginPath();
      ctx.arc(sx, sy, r * z, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth   = 1.5;
      ctx.stroke();
      ctx.restore();
    });

    // Comlink ranges
    if (showComlinks) {
      POIS.forEach((poi) => {
        if (!poi.commrange) return;
        const { sx, sy } = toScreen(poi.x, poi.y);
        const pixelRadius = poi.commrange * z;
        if (pixelRadius < 4) return;
        ctx.save();
        ctx.beginPath();
        ctx.arc(sx, sy, pixelRadius, 0, Math.PI * 2);
        const isLarge = poi.commrange > 1_000;
        ctx.strokeStyle = isLarge ? "rgba(99,200,255,0.20)" : "rgba(160,220,255,0.30)";
        ctx.lineWidth   = isLarge ? 1 : 0.8;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.restore();
        ctx.setLineDash([]);
        if (pixelRadius > 30) {
          ctx.font      = "9px monospace";
          ctx.fillStyle = isLarge ? "rgba(99,200,255,0.40)" : "rgba(160,220,255,0.50)";
          ctx.textAlign = "center";
          ctx.fillText(`${poi.commrange >= 1_000 ? (poi.commrange/1_000).toFixed(0)+"k" : poi.commrange} km`, sx, sy - pixelRadius - 3);
        }
      });
    }

    // Route line
    if (origin && dest) {
      const { sx: ox, sy: oy } = toScreen(origin.x, origin.y);
      const { sx: dx, sy: dy } = toScreen(dest.x, dest.y);
      ctx.save();
      ctx.shadowColor = "#06b6d4";
      ctx.shadowBlur  = 10;
      ctx.beginPath();
      ctx.moveTo(ox, oy); ctx.lineTo(dx, dy);
      ctx.strokeStyle = "#06b6d4";
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.restore();
      ctx.setLineDash([]);
    }

    // Intercept marker
    if (interceptPos) {
      const { sx: ix, sy: iy } = toScreen(interceptPos.x, interceptPos.y);
      const r = 8;
      ctx.save();
      ctx.shadowColor = "#f59e0b";
      ctx.shadowBlur  = 18;
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(ix - r * 1.8, iy); ctx.lineTo(ix + r * 1.8, iy);
      ctx.moveTo(ix, iy - r * 1.8); ctx.lineTo(ix, iy + r * 1.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ix, iy, r, 0, Math.PI * 2);
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth   = 2;
      ctx.stroke();
      ctx.restore();
      ctx.font      = "bold 11px monospace";
      ctx.fillStyle = "#fbbf24";
      ctx.textAlign = "left";
      ctx.fillText("INTERCEPT", ix + r + 4, iy - 4);
      ctx.font      = "10px monospace";
      ctx.fillStyle = "rgba(251,191,36,0.7)";
      ctx.fillText(`${interceptPct}%`, ix + r + 4, iy + 8);
    }

    // Positioning guide: line from nearest marker to intercept
    if (nearestToIntercept && interceptPos) {
      const { sx: nx, sy: ny } = toScreen(nearestToIntercept.poi.x, nearestToIntercept.poi.y);
      const { sx: ix2, sy: iy2 } = toScreen(interceptPos.x, interceptPos.y);

      ctx.save();
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(nx, ny); ctx.lineTo(ix2, iy2);
      ctx.stroke();
      ctx.restore();
      ctx.setLineDash([]);

      ctx.save();
      ctx.shadowColor = "#22c55e";
      ctx.shadowBlur  = 14;
      ctx.beginPath();
      ctx.arc(nx, ny, 9, 0, Math.PI * 2);
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth   = 1.5;
      ctx.stroke();
      ctx.restore();

      const mx2 = (nx + ix2) / 2;
      const my2 = (ny + iy2) / 2;
      ctx.font      = "9px monospace";
      ctx.fillStyle = "#4ade80";
      ctx.textAlign = "center";
      ctx.fillText(fmtDist(nearestToIntercept.dist), mx2, my2 - 5);
    }

    // POIs
    POIS.forEach((poi) => {
      const { sx, sy } = toScreen(poi.x, poi.y);
      const isHovered  = hoveredPoi === poi.id;
      const isSelected = poi.id === originId || poi.id === destId;

      if (poi.type === "star") {
        const starColor = poi.color ?? "#fbbf24";
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, 20);
        grad.addColorStop(0,   "#fffde7");
        grad.addColorStop(0.4, starColor);
        grad.addColorStop(1,   "transparent");
        ctx.save();
        ctx.shadowColor = starColor;
        ctx.shadowBlur  = 30;
        ctx.beginPath();
        ctx.arc(sx, sy, 14, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
        ctx.font      = "11px monospace";
        ctx.fillStyle = `${starColor}99`;
        ctx.textAlign = "center";
        ctx.fillText(poi.name, sx, sy + 24);
        return;
      }

      if (poi.type === "jumppoint") {
        const h = 6 + (isHovered || isSelected ? 2 : 0);
        ctx.save();
        if (isSelected) { ctx.shadowColor = "#a78bfa"; ctx.shadowBlur = 14; }
        else if (isHovered) { ctx.shadowColor = "#c4b5fd"; ctx.shadowBlur = 8; }
        ctx.beginPath();
        ctx.moveTo(sx,     sy - h);
        ctx.lineTo(sx + h, sy    );
        ctx.lineTo(sx,     sy + h);
        ctx.lineTo(sx - h, sy    );
        ctx.closePath();
        ctx.fillStyle   = isSelected ? "#a78bfa" : isHovered ? "#c4b5fd" : "#6d28d9";
        ctx.fill();
        ctx.strokeStyle = isSelected ? "#ede9fe" : "#a78bfa";
        ctx.lineWidth   = 1;
        ctx.stroke();
        ctx.restore();
        if (isHovered || isSelected) {
          ctx.font      = "10px monospace";
          ctx.fillStyle = isSelected ? "#c4b5fd" : "#a1a1aa";
          ctx.textAlign = "left";
          ctx.fillText(poi.name, sx + h + 5, sy + 4);
        }
        return;
      }

      if (poi.type === "station") {
        const h = 3 + (isHovered || isSelected ? 2 : 0);
        ctx.save();
        if (isSelected) { ctx.shadowColor = "#22d3ee"; ctx.shadowBlur = 8; }
        ctx.fillStyle = isSelected ? "#22d3ee" : isHovered ? "#d4d4d8" : "#52525b";
        ctx.fillRect(sx - h, sy - h, h * 2, h * 2);
        ctx.restore();
        if (isHovered || isSelected) {
          ctx.font      = "10px monospace";
          ctx.fillStyle = isSelected ? "#22d3ee" : "#a1a1aa";
          ctx.textAlign = "left";
          ctx.fillText(poi.name, sx + h + 4, sy + 4);
        }
        return;
      }

      if (poi.type === "moon") {
        const r = 3 + (isHovered || isSelected ? 1.5 : 0);
        ctx.save();
        if (isSelected) { ctx.shadowColor = "#22d3ee"; ctx.shadowBlur = 8; }
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? "#22d3ee" : isHovered ? "#d4d4d8" : (poi.color ?? "#71717a");
        ctx.fill();
        ctx.restore();
        if (isHovered || isSelected) {
          ctx.font      = "10px monospace";
          ctx.fillStyle = isSelected ? "#22d3ee" : "#a1a1aa";
          ctx.textAlign = "left";
          ctx.fillText(poi.name, sx + 6, sy + 4);
        }
        return;
      }

      // Planet
      const r  = PLANET_RADIUS[poi.id] ?? 6;
      const rr = r + (isHovered || isSelected ? 2 : 0);
      ctx.save();
      ctx.shadowColor = isSelected ? "#22d3ee" : (poi.color ?? "#888");
      ctx.shadowBlur  = isSelected ? 20 : 12;
      ctx.beginPath();
      ctx.arc(sx, sy, rr, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? "#22d3ee" : (poi.color ?? "#71717a");
      ctx.fill();
      if (isSelected) {
        ctx.strokeStyle = "#67e8f9";
        ctx.lineWidth   = 1.5;
        ctx.stroke();
      }
      ctx.restore();
      ctx.font      = "bold 11px monospace";
      ctx.fillStyle = isSelected ? "#22d3ee" : (poi.color ?? "#a1a1aa");
      ctx.textAlign = "center";
      ctx.fillText(poi.name, sx, sy + rr + 13);
    });
  }, [system, POIS, origin, dest, interceptPct, interceptPos, nearestToIntercept, hoveredPoi, originId, destId, zoom, pan, showComlinks]);

  useEffect(() => { draw(); }, [draw]);

  useEffect(() => {
    const obs = new ResizeObserver(() => draw());
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [draw]);

  // ── Mouse handlers ──────────────────────────────────────────────────────────

  const getPoi = useCallback((mx: number, my: number): string | null => {
    const canvas    = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return null;

    const W = container.clientWidth;
    const H = container.clientHeight;
    const autoZoom = (Math.min(W, H) * 0.88) / (system.mapRadius * 2);
    const z  = zoom || autoZoom;
    const cx = W / 2 + pan.x;
    const cy = H / 2 + pan.y;
    const rect  = canvas.getBoundingClientRect();
    const canvX = mx - rect.left;
    const canvY = my - rect.top;

    let nearest: string | null = null;
    let minD = 18;

    POIS.forEach((poi) => {
      const sx = cx + poi.x * z;
      const sy = cy - poi.y * z;
      const d  = Math.sqrt((canvX - sx) ** 2 + (canvY - sy) ** 2);
      if (d < minD) { minD = d; nearest = poi.id; }
    });
    return nearest;
  }, [POIS, system, zoom, pan]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    setHoveredPoi(getPoi(e.clientX, e.clientY));
    if (isDragging.current) {
      const dx = e.clientX - dragStart.current.mx;
      const dy = e.clientY - dragStart.current.my;
      setPan({ x: dragStart.current.px + dx, y: dragStart.current.py + dy });
    }
  }, [getPoi]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    dragStart.current  = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  }, [pan]);

  const onMouseUp   = useCallback(() => { isDragging.current = false; }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const W = container.clientWidth;
    const H = container.clientHeight;
    const autoZoom = (Math.min(W, H) * 0.88) / (system.mapRadius * 2);
    const cur    = zoom || autoZoom;
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom(Math.max(autoZoom * 0.4, Math.min(cur * factor, autoZoom * 50)));
  }, [zoom, system]);

  const resetView = () => { setZoom(0); setPan({ x: 0, y: 0 }); };

  const switchSystem = (id: string) => {
    setSystemId(id);
    setOriginId("");
    setDestId("");
    setZoom(0);
    setPan({ x: 0, y: 0 });
  };

  // ── Dropdown groups ─────────────────────────────────────────────────────────

  const groupLabels = GROUP_LABELS[systemId] ?? {};
  const SELECTABLE  = POIS.filter((p) => p.type !== "star");
  const groupKeys   = [...new Set(SELECTABLE.map((p) => p.group))];
  const byGroup     = (gk: string) => SELECTABLE.filter((p) => p.group === gk);

  const poiTypeLabel = (type: POI["type"]) => {
    if (type === "jumppoint") return "Punto de salto";
    if (type === "station")   return "Estación";
    if (type === "moon")      return "Luna";
    return "Planeta";
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full">
      {/* ── Left panel ──────────────────────────────────────────────────────── */}
      <div className="w-80 min-w-[280px] flex flex-col border-r border-zinc-800 bg-zinc-950/90 overflow-y-auto">

        {/* System selector */}
        <div className="px-4 py-3 border-b border-zinc-800/60">
          <p className="text-xs tracking-[0.15em] uppercase text-zinc-500 mb-2">Sistema</p>
          <div className="flex gap-1">
            {SYSTEMS.map((s) => (
              <button
                key={s.id}
                onClick={() => switchSystem(s.id)}
                className={`flex-1 py-1.5 text-xs tracking-wider uppercase rounded transition-all duration-150 ${
                  systemId === s.id
                    ? "bg-cyan-900/60 border border-cyan-600 text-cyan-300"
                    : "bg-zinc-900 border border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
          {systemId === "stanton" && (
            <button
              onClick={() => setShowComlinks((v) => !v)}
              className={`mt-2 w-full py-1 text-xs rounded border transition-all duration-150 ${
                showComlinks
                  ? "bg-sky-900/50 border-sky-600 text-sky-300"
                  : "bg-zinc-900 border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
              }`}
            >
              {showComlinks ? "◉" : "○"} Comlink Ranges
            </button>
          )}
        </div>

        <div className="flex flex-col gap-5 p-4">

          {/* Route */}
          <section>
            <label className="block text-xs tracking-[0.15em] uppercase text-zinc-500 mb-2">
              Ruta
            </label>
            <div className="flex flex-col gap-2">
              <div>
                <span className="text-xs text-zinc-500 uppercase tracking-wider mb-1 block">Origen</span>
                <SearchSelect
                  value={originId}
                  onChange={setOriginId}
                  options={SELECTABLE}
                  groupLabels={groupLabels}
                  disabledId={destId}
                  placeholder="— Selecciona origen —"
                />
              </div>

              <div className="flex items-center gap-2 px-1">
                <div className="flex-1 h-px bg-zinc-800" />
                <span className="text-zinc-600 text-sm">→</span>
                <div className="flex-1 h-px bg-zinc-800" />
              </div>

              <div>
                <span className="text-xs text-zinc-500 uppercase tracking-wider mb-1 block">Destino</span>
                <SearchSelect
                  value={destId}
                  onChange={setDestId}
                  options={SELECTABLE}
                  groupLabels={groupLabels}
                  disabledId={originId}
                  placeholder="— Selecciona destino —"
                />
              </div>
            </div>
          </section>

          {/* Drive class */}
          <section>
            <label className="block text-xs tracking-[0.15em] uppercase text-zinc-500 mb-2">
              Drive class
            </label>
            <div className="flex gap-1">
              {DRIVE_PRESETS.map((d, i) => (
                <button
                  key={d.label}
                  onClick={() => setDriveIdx(i)}
                  className={`flex-1 py-1.5 text-xs tracking-wider uppercase rounded transition-all duration-150 ${
                    driveIdx === i
                      ? "bg-cyan-900/60 border border-cyan-600 text-cyan-300"
                      : "bg-zinc-900 border border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500 mt-1.5">
              v<sub>max</sub> {(drive.vmax / 1000).toFixed(0)}k km/s · a₁ {drive.a1} · a₂ {drive.a2}
            </p>
          </section>

          {/* Intercept position */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs tracking-[0.15em] uppercase text-zinc-500">
                Posición de intercepción
              </label>
              <span className="text-base font-mono text-amber-400">{interceptPct}%</span>
            </div>
            <input
              type="range" min={1} max={99} value={interceptPct}
              onChange={(e) => setInterceptPct(Number(e.target.value))}
              className="w-full accent-amber-500"
              disabled={!origin || !dest}
            />
            <div className="flex justify-between text-xs text-zinc-600 mt-1">
              <span>Origen</span>
              <span>Destino</span>
            </div>
          </section>

          {/* Intel panel */}
          <section className="border border-zinc-800 rounded bg-zinc-900/40 p-3">
            <p className="text-xs tracking-[0.15em] uppercase text-zinc-500 mb-3">Intel</p>
            {!origin || !dest ? (
              <p className="text-sm text-zinc-600 italic">
                Selecciona origen y destino para calcular.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <Row label="Ruta"          value={fmtDist(totalDist)} />
                <Row label="Tiempo QT"     value={fmtTime(totalTime)}  accent="cyan" />
                <div className="border-t border-zinc-800 my-1" />
                <Row label="Hasta intercepción" value={fmtDist(interceptDist)} />
                <Row label="ETA objetivo"  value={fmtTime(interceptTime)} accent="amber" />
                <div className="border-t border-zinc-800 my-1" />
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
                  Coordenadas
                </p>
                {interceptPos && (
                  <>
                    <Row label="X" value={`${(interceptPos.x / 1_000_000).toFixed(4)} Mkm`} mono />
                    <Row label="Y" value={`${(interceptPos.y / 1_000_000).toFixed(4)} Mkm`} mono />
                    <Row label="Z" value={`${((interceptPos.z ?? 0) / 1_000_000).toFixed(4)} Mkm`} mono />
                  </>
                )}
              </div>
            )}
          </section>

          {/* ── Short route warning ───────────────────────────────────────── */}
          {origin && dest && totalDist > 0 && totalDist < 500 && (
            <section className={`border rounded p-3 ${totalDist < 50 ? "border-red-800/60 bg-red-950/20" : "border-amber-800/60 bg-amber-950/20"}`}>
              <p className={`text-xs font-bold mb-1 ${totalDist < 50 ? "text-red-400" : "text-amber-400"}`}>
                {totalDist < 50 ? "⛔ Intercepción imposible" : "⚠ Ruta muy corta"}
              </p>
              <p className="text-xs text-zinc-400 leading-snug">
                {totalDist < 50
                  ? `Distancia total ${fmtDist(totalDist)} — el objetivo llega antes de poder preparar el snare.`
                  : `Distancia total ${fmtDist(totalDist)} — margen muy ajustado, posicionamiento crítico.`}
              </p>
            </section>
          )}

          {/* ── Positioning guide ─────────────────────────────────────────── */}
          {origin && dest && (
            <section className="border border-green-900/50 rounded bg-green-950/20 p-3">
              <p className="text-xs tracking-[0.15em] uppercase text-green-500/80 mb-3">
                🎯 Cómo posicionarte
              </p>

              {/* ── Método A: marcador cercano ── */}
              {nearestToIntercept && bearingDeg !== null && (() => {
                const tooFar   = nearestToIntercept.dist > 20_000;
                const longWay  = nearestToIntercept.dist > 5_000;
                const badge    = tooFar  ? { label: "Muy lejos · usa Método B", cls: "text-red-400 border-red-900/50 bg-red-950/20" }
                               : longWay ? { label: "Distancia larga",           cls: "text-amber-400 border-amber-900/50 bg-amber-950/20" }
                               :           { label: "Recomendado",               cls: "text-green-400 border-green-900/50 bg-green-950/20" };
                return (
                  <div className={`border rounded p-2.5 mb-3 ${tooFar ? "opacity-50" : ""}`}>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Método A · Marcador cercano</span>
                      <span className={`text-[10px] border rounded px-1.5 py-0.5 ${badge.cls}`}>{badge.label}</span>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      <div className="flex gap-2">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-green-900/60 border border-green-700 text-green-400 text-[10px] font-bold flex items-center justify-center">1</span>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">QT al marcador más cercano</p>
                          <p className="text-sm text-green-400 font-mono font-bold mt-0.5">{nearestToIntercept.poi.name}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-green-900/60 border border-green-700 text-green-400 text-[10px] font-bold flex items-center justify-center">2</span>
                        <div className="w-full">
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Navega hasta el intercept · línea verde</p>
                          <div className="grid grid-cols-2 gap-1">
                            <div className="bg-zinc-900/60 border border-zinc-800 rounded px-2 py-1 text-center">
                              <p className="text-[10px] text-zinc-600 uppercase">Distancia</p>
                              <p className={`text-sm font-mono font-bold mt-0.5 ${tooFar ? "text-red-400" : longWay ? "text-amber-400" : "text-zinc-100"}`}>
                                {fmtDist(nearestToIntercept.dist)}
                              </p>
                            </div>
                            <div className="bg-zinc-900/60 border border-zinc-800 rounded px-2 py-1 text-center">
                              <p className="text-[10px] text-zinc-600 uppercase">Dirección</p>
                              <p className="text-sm text-zinc-100 font-mono font-bold mt-0.5">
                                {bearingDeg}° <span className="text-zinc-500 text-[10px]">{cardinalDir(bearingDeg)}</span>
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-green-900/60 border border-green-700 text-green-400 text-[10px] font-bold flex items-center justify-center">3</span>
                        <p className="text-xs text-zinc-300 leading-snug">
                          Activa el snare · objetivo llega en{" "}
                          <span className="text-amber-400 font-mono font-bold">{fmtTime(interceptTime)}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ── Método B: QT directo ── */}
              {(() => {
                const tooFar = nearestToIntercept && nearestToIntercept.dist > 20_000;
                const isRecommended = tooFar || !nearestToIntercept;
                return (
                  <div className={`border rounded p-2.5 ${isRecommended ? "border-cyan-800/60 bg-cyan-950/20" : "border-zinc-800 bg-zinc-900/20"}`}>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Método B · QT directo</span>
                      {isRecommended
                        ? <span className="text-[10px] border rounded px-1.5 py-0.5 text-cyan-400 border-cyan-800/60 bg-cyan-950/30">Recomendado</span>
                        : <span className="text-[10px] text-zinc-600">Alternativa</span>
                      }
                    </div>
                    <div className="flex flex-col gap-2.5">
                      <div className="flex gap-2">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-cyan-900/60 border border-cyan-700 text-cyan-400 text-[10px] font-bold flex items-center justify-center">1</span>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Posicionate cerca del origen</p>
                          <p className="text-sm text-cyan-300 font-mono font-bold mt-0.5">{origin.name}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-cyan-900/60 border border-cyan-700 text-cyan-400 text-[10px] font-bold flex items-center justify-center">2</span>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Bloquea QT hacia el destino</p>
                          <p className="text-sm text-cyan-300 font-mono font-bold mt-0.5">{dest.name}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-cyan-900/60 border border-cyan-700 text-cyan-400 text-[10px] font-bold flex items-center justify-center">3</span>
                        <div className="w-full">
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Inicia QT y corta el drive al llegar a</p>
                          <div className="grid grid-cols-2 gap-1">
                            <div className="bg-zinc-900/60 border border-zinc-800 rounded px-2 py-1 text-center">
                              <p className="text-[10px] text-zinc-600 uppercase">Distancia</p>
                              <p className="text-sm text-cyan-300 font-mono font-bold mt-0.5">{fmtDist(interceptDist)}</p>
                            </div>
                            <div className="bg-zinc-900/60 border border-zinc-800 rounded px-2 py-1 text-center">
                              <p className="text-[10px] text-zinc-600 uppercase">Cortar a los</p>
                              <p className="text-sm text-cyan-300 font-mono font-bold mt-0.5">{fmtTime(interceptTime)}</p>
                            </div>
                          </div>
                          <p className="text-[10px] text-zinc-600 mt-1">El HUD muestra km recorridos en tiempo real</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-cyan-900/60 border border-cyan-700 text-cyan-400 text-[10px] font-bold flex items-center justify-center">4</span>
                        <p className="text-xs text-zinc-300 leading-snug">
                          Activa el snare · objetivo llega en{" "}
                          <span className="text-amber-400 font-mono font-bold">{fmtTime(interceptTime)}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

            </section>
          )}

          <p className="text-[10px] text-zinc-600 leading-relaxed">
            SC LABS · 4.7 LIVE
          </p>
        </div>
      </div>

      {/* ── Star map canvas ──────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      >
        <canvas ref={canvasRef} className="absolute inset-0" />

        {hoveredPoi && POIS.find((p) => p.id === hoveredPoi)?.type !== "star" && (
          <div className="absolute top-3 left-3 bg-zinc-900/90 border border-zinc-700 rounded px-2 py-1 pointer-events-none">
            <p className="text-sm text-zinc-200 font-mono">
              {POIS.find((p) => p.id === hoveredPoi)?.name}
            </p>
            <p className="text-xs text-zinc-500 capitalize">
              {poiTypeLabel(POIS.find((p) => p.id === hoveredPoi)?.type ?? "station")}
            </p>
          </div>
        )}

        <div className="absolute bottom-3 right-3 flex gap-1.5">
          <button
            onClick={resetView}
            className="bg-zinc-900/80 border border-zinc-700 text-zinc-400 hover:text-zinc-200 text-xs px-2 py-1 rounded"
          >
            Reset view
          </button>
        </div>

        <div className="absolute bottom-3 left-3 flex items-center gap-3 text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-[#c2783a] inline-block" /> Planeta
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-zinc-500 inline-block" /> Luna
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-zinc-600 inline-block" /> Estación
          </span>
          <span className="flex items-center gap-1 text-violet-400">
            <span className="inline-block" style={{ fontSize: 10 }}>◇</span> Jump Point
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-px bg-cyan-500 inline-block" /> Ruta QT
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Intercept
          </span>
        </div>

        <div className="absolute top-3 right-3 text-xs text-zinc-600">
          Scroll para zoom · Drag para mover
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Row({
  label, value, accent, mono,
}: {
  label: string; value: string; accent?: "cyan" | "amber"; mono?: boolean;
}) {
  const valueClass =
    accent === "cyan"  ? "text-cyan-400"  :
    accent === "amber" ? "text-amber-400" :
    mono               ? "text-zinc-300 font-mono" : "text-zinc-200";
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
      <span className={`text-sm font-mono ${valueClass}`}>{value}</span>
    </div>
  );
}
