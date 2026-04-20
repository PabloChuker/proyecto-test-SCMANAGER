import Header from "@/app/assets/header/Header";
import FleetCanvas from "@/components/tools/FleetCanvas";

export const metadata = {
  title: "Fleet Canvas — SC Labs",
  description: "Visualize and arrange your Star Citizen fleet on an infinite canvas with 3D models.",
};

export default function FleetCanvasPage() {
  return (
    <main className="h-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      <Header subtitle="Fleet Canvas" />
      <div className="flex-1 min-h-0">
        <FleetCanvas />
      </div>
    </main>
  );
}
