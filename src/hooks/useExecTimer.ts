import { useState, useEffect, useCallback } from "react";
import { storageGet, storageSet, storageRemove } from "@/lib/safe-storage";

const REFERENCE_TIMESTAMP = 1760636604402;
const CYCLE_MS = 185 * 60 * 1000;
const GREEN_MS = 65 * 60 * 1000;
const RED_MS = 120 * 60 * 1000;
const STORAGE_KEY = "sc-exec-offset";

export type ExecPhase = "GREEN" | "RED";

export interface ExecTimerState {
  phase: ExecPhase;
  remaining: number;
  cycleProgress: number;
  phaseProgress: number;
  offsetMs: number;
  mounted: boolean;
}

function computeState(offsetMs: number): ExecTimerState {
  const now = Date.now();
  const elapsed =
    ((now + offsetMs - REFERENCE_TIMESTAMP) % CYCLE_MS + CYCLE_MS) % CYCLE_MS;
  const phase: ExecPhase = elapsed < GREEN_MS ? "GREEN" : "RED";
  const phaseElapsed = phase === "GREEN" ? elapsed : elapsed - GREEN_MS;
  const phaseDuration = phase === "GREEN" ? GREEN_MS : RED_MS;
  return {
    phase,
    remaining: phaseDuration - phaseElapsed,
    cycleProgress: elapsed / CYCLE_MS,
    phaseProgress: phaseElapsed / phaseDuration,
    offsetMs,
    mounted: false,
  };
}

export function useExecTimer() {
  const [offsetMs, setOffsetMs] = useState(0);
  const [state, setState] = useState<ExecTimerState>(() => computeState(0));
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = parseInt(storageGet(STORAGE_KEY) ?? "0", 10);
    setOffsetMs(isNaN(stored) ? 0 : stored);
    setMounted(true);
  }, []);

  useEffect(() => {
    const update = () => setState(computeState(offsetMs));
    update();
    const intervalId = setInterval(update, 1000);
    return () => clearInterval(intervalId);
  }, [offsetMs]);

  const adjustOffset = useCallback((deltaMs: number) => {
    setOffsetMs((prev) => {
      const next = prev + deltaMs;
      storageSet(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  const resetOffset = useCallback(() => {
    setOffsetMs(0);
    storageRemove(STORAGE_KEY);
  }, []);

  return { ...state, mounted, adjustOffset, resetOffset };
}
