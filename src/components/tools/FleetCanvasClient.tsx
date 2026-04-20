"use client";
import dynamic from "next/dynamic";

// ssr: false must live in a Client Component — cannot be used directly in a Server Component page
const FleetCanvas = dynamic(() => import("./FleetCanvas"), { ssr: false });

export default function FleetCanvasClient() {
  return <FleetCanvas />;
}
