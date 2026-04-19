import { useState, useEffect, useCallback } from "react";

const KEY_PREFIX = "sc-cz-timer-";

export function useCountdownTimer(timerId: string, durationMs: number) {
  const storageKey = KEY_PREFIX + timerId;
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(durationMs);
  const [isRunning, setIsRunning] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) setStartedAt(parseInt(stored, 10));
  }, [storageKey]);

  useEffect(() => {
    const tick = () => {
      if (!startedAt) {
        setRemaining(durationMs);
        setIsRunning(false);
        setIsReady(false);
        return;
      }
      const rem = durationMs - (Date.now() - startedAt);
      if (rem <= 0) {
        setRemaining(0);
        setIsRunning(false);
        setIsReady(true);
      } else {
        setRemaining(rem);
        setIsRunning(true);
        setIsReady(false);
      }
    };
    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [startedAt, durationMs]);

  const start = useCallback(() => {
    const now = Date.now();
    setStartedAt(now);
    localStorage.setItem(storageKey, String(now));
  }, [storageKey]);

  const reset = useCallback(() => {
    setStartedAt(null);
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  return { remaining, isRunning, isReady, start, reset };
}
