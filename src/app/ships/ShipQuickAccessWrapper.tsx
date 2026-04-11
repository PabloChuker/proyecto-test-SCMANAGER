"use client";

import { usePathname } from "next/navigation";
import ShipQuickAccess from "@/components/ships/ShipQuickAccess";

/**
 * Wraps ShipQuickAccess to extract the current ship reference from the URL.
 * Lives in the /ships layout so the sidebar persists across list ↔ detail navigation.
 */
export function ShipQuickAccessWrapper() {
  const pathname = usePathname();

  // Extract ship reference from /ships/AEGS_Gladius → "AEGS_Gladius"
  const match = pathname.match(/^\/ships\/([^/]+)$/);
  const currentShipRef = match ? decodeURIComponent(match[1]) : undefined;

  return <ShipQuickAccess currentShipRef={currentShipRef} />;
}
