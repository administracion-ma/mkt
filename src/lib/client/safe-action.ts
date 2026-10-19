"use client";

const STALE_DEPLOY_PATTERNS = ["was not found on the server", "Failed to find Server Action"];

// Envuelve la llamada a una server action desde un botón/select: si falla, la
// página NO se cae (antes cualquier error tumbaba todo con "This page
// couldn't load"). Si el error es por una pestaña abierta de un deploy
// anterior, recarga sola; si es otra cosa, avisa y deja la página como está.
export async function runSafely(fn: () => Promise<unknown>, onError?: (message: string) => void): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (STALE_DEPLOY_PATTERNS.some((p) => message.includes(p))) {
      window.location.reload();
      return false;
    }
    console.error(err);
    if (onError) onError(message);
    else window.alert(`No se pudo completar la acción: ${message}`);
    return false;
  }
}
