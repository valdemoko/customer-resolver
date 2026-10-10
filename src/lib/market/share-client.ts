/** Llamadas del navegador a los puntos de compartido (`/api/market/share`). */

export async function fetchShareCount(unitId: string): Promise<number | null> {
  try {
    const response = await fetch(`/api/market/share?unit=${encodeURIComponent(unitId)}`);
    if (!response.ok) return null;
    return ((await response.json()) as { shares: number }).shares;
  } catch {
    return null;
  }
}

/** Avisa de que se ha copiado el enlace del anuncio. Devuelve los puntos actuales, o `null` si falla. */
export async function postShare(unitId: string, token?: string | null): Promise<{ counted: boolean; shares: number } | null> {
  try {
    const response = await fetch("/api/market/share", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unitId, ...(token ? { token } : {}) }),
    });
    return response.ok ? ((await response.json()) as { counted: boolean; shares: number }) : null;
  } catch {
    return null;
  }
}
