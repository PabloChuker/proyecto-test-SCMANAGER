import Header from "@/app/assets/header/Header";
import QuantumIntercept from "@/components/tools/QuantumIntercept";

export const metadata = {
  title: "Quantum Intercept — SC Labs",
  description: "Plan quantum interception points across the Stanton system.",
};

export default function QuantumInterceptPage() {
  return (
    <main className="h-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      <Header subtitle="Quantum Intercept" />
      <div className="flex-1 min-h-0">
        <QuantumIntercept />
      </div>
    </main>
  );
}
