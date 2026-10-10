import { getMarketStore } from "@/lib/market/service";

/**
 * Visitantes únicos SIN cookies ni rastreo: cada visita se resume en una huella con sal
 * (sha256 de conexión + navegador + secreto del servidor, 16 caracteres) que no permite recuperar
 * la IP y que solo sirve para saber «es la misma conexión y navegador que otro día». No se cuentan
 * robots, ni el navegador de pruebas, ni a los administradores. Es una ESTIMACIÓN: dos personas
 * detrás de la misma conexión y navegador cuentan una; una persona con dos dispositivos, dos.
 */

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python-requests|node-fetch|undici|axios|facebookexternalhit|preview|scrapy|httpclient|java\//i;

/** ¿Parece un robot o una herramienta automática? Sin cabecera de navegador, también. */
export function isBot(userAgent: string | null | undefined): boolean {
  return !userAgent || userAgent.length < 20 || BOT.test(userAgent);
}

/** Día `AAAA-MM-DD` en hora de Madrid (los «de hoy» del panel son los del reloj de aquí). */
export function madridDay(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export async function visitorHash(ip: string, userAgent: string, secret = process.env.SESSION_SECRET ?? "local"): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ip}|${userAgent}|${secret}`));
  return Array.from(new Uint8Array(digest).slice(0, 8), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Anota una visita (si no es un robot). Devuelve `true` si se anotó. */
export async function recordVisit(input: { ip: string; userAgent: string | null; now?: Date }): Promise<boolean> {
  if (isBot(input.userAgent)) return false;
  const store = await getMarketStore();
  await store.recordVisit(madridDay(input.now), await visitorHash(input.ip, input.userAgent!));
  return true;
}
