/**
 * Centralized navigation configuration for SC LABS.
 * Add or remove modules here — every page header updates automatically.
 */

export interface NavModule {
  key: string;
  label: string;
  href: string;
  /** Optional: match additional pathnames beyond the href (e.g. /ships/[id]) */
  matchPaths?: string[];
}

/**
 * Main navigation modules displayed in the header.
 * Order here = order in the nav bar.
 */
export const NAV_MODULES: NavModule[] = [
  { key: "dps",        label: "DPS Calculator",  href: "/dps" },
  { key: "ships",      label: "Ships",           href: "/ships",      matchPaths: ["/ships/"] },
  { key: "compare",    label: "Comparator",      href: "/compare" },
  { key: "components", label: "Components",       href: "/components" },
  { key: "mining",     label: "Mining",           href: "/mining" },
  { key: "crafting",   label: "Crafting",         href: "/crafting" },
  { key: "hangar",     label: "Hangar",           href: "/hangar" },
];

/**
 * Sidebar items used by pages with the icon sidebar.
 * Centralized here to avoid duplication across pages.
 */
export interface SidebarItem {
  key: string;
  href: string;
  label: string;
  icon: string;
}

export const SIDEBAR_ITEMS: SidebarItem[] = [
  { key: "dps",            href: "/dps",                        label: "DPS Calculator",   icon: "/icons/DPS_calculator.png" },
  { key: "ships",          href: "/components?tab=ships",       label: "Ships",            icon: "/icons/Ships.png" },
  { key: "weapons",        href: "/components?tab=weapons",     label: "Weapons",          icon: "/icons/weapons.png" },
  { key: "missiles",       href: "/components?tab=missiles",    label: "Missiles",         icon: "/icons/missile.png" },
  { key: "emps",           href: "/components?tab=emps",        label: "EMP Generators",   icon: "/icons/emp.png" },
  { key: "shields",        href: "/components?tab=shields",     label: "Shields",          icon: "/icons/shilds.png" },
  { key: "power_plants",   href: "/components?tab=power_plants",label: "Power Plants",     icon: "/icons/power_plants.png" },
  { key: "coolers",        href: "/components?tab=coolers",     label: "Coolers",          icon: "/icons/coolers.png" },
  { key: "quantum_drives", href: "/components?tab=quantum_drives", label: "Quantum Drives", icon: "/icons/Quantum_drives.png" },
  { key: "qed",            href: "/components?tab=qed",         label: "QED Generators",   icon: "/icons/interdict_pulse.png" },
  { key: "mining",         href: "/mining",                     label: "Mining Tools",     icon: "/icons/mining_lasers.png" },
  { key: "turrets",        href: "/components?tab=turrets",     label: "Turrets",          icon: "/icons/weapons.png" },
];
