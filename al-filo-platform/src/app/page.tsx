import { Suspense } from 'react';
import LoadoutBuilder from '../components/ships/LoadoutBuilder';

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white">
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-zinc-500 font-mono text-sm animate-pulse">
            LOADING SYSTEM...
          </div>
        </div>
      }>
        <LoadoutBuilder />
      </Suspense>
    </main>
  );
}