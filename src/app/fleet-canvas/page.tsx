import Header from "@/app/assets/header/Header";
import FleetCanvasClient from "@/components/tools/FleetCanvasClient";

export const metadata = {
  title: "Fleet Canvas — SC Labs",
  description: "Visualize and arrange your Star Citizen fleet in a shared 3D scene.",
};

export default function FleetCanvasPage() {
  return (
    <main className="h-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      <Header subtitle="Fleet Canvas" />
      <div className="flex-1 min-h-0">
        <FleetCanvasClient />
      </div>
    </main>
  );
}
