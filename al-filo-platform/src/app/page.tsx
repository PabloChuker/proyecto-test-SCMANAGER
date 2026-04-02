import LoadoutBuilder from "@/components/ships/LoadoutBuilder";

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white">
      {/* Forzamos la carga de una nave por defecto si no hay ID */}
      <LoadoutBuilder />
    </main>
  );
}