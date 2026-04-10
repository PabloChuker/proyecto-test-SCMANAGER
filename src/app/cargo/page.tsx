import type { Metadata } from "next";
import { CargoPage } from "@/components/cargo/CargoPage";

export const metadata: Metadata = {
  title: "Cargo Grid Visualizer — SC LABS",
  description: "3D visualization of Star Citizen ship cargo grids. Paint SCU cells by cargo type.",
};

export default function CargoGridPage() {
  return <CargoPage />;
}
