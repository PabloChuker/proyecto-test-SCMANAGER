// localStorage con guards — en iframes sandboxed de origen opaco (p. ej. los
// embeds /embed/* corriendo como plugins de Umbra) CUALQUIER acceso a
// window.localStorage lanza SecurityError. Un acceso sin guard dentro de un
// timer/efecto puede tumbar el frame entero (Chrome mata el subframe tras la
// tormenta de excepciones). En esos contextos estas funciones degradan a
// no-op: la feature funciona en memoria, sin persistencia.

export function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // sin storage disponible
  }
}

export function storageRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // sin storage disponible
  }
}
