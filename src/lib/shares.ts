import { isAdminEmail } from "@/lib/admin/auth";
import { verifySigned } from "@/lib/auth/session";
import { getMarketStore, MarketError } from "@/lib/market/service";
import { belongsTo } from "@/lib/market/store";
import { isKnownUnit } from "@/lib/market/units";
import { isBot, madridDay, visitorHash } from "@/lib/visits";

/**
 * Puntos de compartido. Cada vez que alguien que NO es el dueño de un anuncio copia su enlace para
 * mandarlo, el anuncio suma un punto. Para que el ranking sea creíble:
 *
 *  · una persona (conexión + navegador, sin cookies) suma como máximo un punto por anuncio y día;
 *  · el dueño no suma a su propio anuncio (ni por su cuenta, ni con su enlace privado de edición);
 *  · los administradores y los robots no suman;
 *  · solo puntúan los espacios que ya tienen anunciante.
 *
 * Es una ESTIMACIÓN de difusión: copiar el enlace no prueba que se haya enviado, pero sí que alguien
 * quiso compartirlo, y el límite por persona y día quita el incentivo a inflarlo.
 */

export type ShareResult = { counted: boolean; shares: number };

export async function shareCountOf(unitId: string): Promise<number> {
  if (!isKnownUnit(unitId)) throw new MarketError("Unidad desconocida.", 404);
  return (await getMarketStore()).shareCount(unitId);
}

export async function recordShare(input: {
  unitId: string;
  ip: string;
  userAgent: string | null;
  userId?: string | null;
  userEmail?: string | null;
  /** Enlace privado de edición (compradores sin cuenta): quien lo tiene es el dueño. */
  token?: string | null;
  now?: Date;
}): Promise<ShareResult> {
  if (!isKnownUnit(input.unitId)) throw new MarketError("Unidad desconocida.", 404);
  const store = await getMarketStore();
  const owner = await store.ownership(input.unitId);
  const current = () => store.shareCount(input.unitId);
  if (!owner) return { counted: false, shares: await current() }; // sin anunciante no hay anuncio que puntuar
  const byAccount = Boolean(input.userId) && belongsTo(owner, input.userId!, input.userEmail);
  const byToken = Boolean(input.token) && owner.sessionId !== "" && (await verifySigned(input.token ?? undefined)) === `edit:${owner.sessionId}`;
  if (byAccount || byToken || isAdminEmail(input.userEmail) || isBot(input.userAgent)) {
    return { counted: false, shares: await current() };
  }
  const fresh = await store.recordShare(input.unitId, madridDay(input.now), await visitorHash(input.ip, input.userAgent ?? ""));
  return { counted: fresh, shares: await current() };
}
