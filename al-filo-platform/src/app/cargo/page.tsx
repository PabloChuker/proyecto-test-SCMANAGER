import type { Metadata } from "next";
import { CargoPage } from "@/components/cargo/CargoPage";

export const metadata: Metadata = {
  title: "Cargo Grid Visualizer — SC LABS",
  description: "Visualización 3D de cargo grids de naves Star Citizen. Pinta celdas SCU por tipo de carga.",
};

export default function CargoGridPage() {
  return <CargoPage />;
}
