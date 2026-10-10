import { NextResponse, type NextRequest } from "next/server";
import { MarketError } from "@/lib/market/service";
import { StripeNotConfigured } from "@/lib/market/stripe";

/** Convierte un error del mercado en una respuesta JSON sin filtrar detalles internos. */
export function fail(error: unknown): NextResponse {
  if (error instanceof MarketError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof StripeNotConfigured) {
    return NextResponse.json({ error: "El cobro con Stripe aún no está configurado." }, { status: 503 });
  }
  console.error("[market]", error instanceof Error ? error.message : error);
  return NextResponse.json({ error: "Error interno del mercado." }, { status: 500 });
}

/** Tamaño máximo del cuerpo de las rutas que reciben un anuncio (fotos incluidas): 2 MB. */
export const MAX_BODY_BYTES = 2_000_000;

/**
 * Lee el JSON de la petición con tope de tamaño, ANTES de interpretarlo: sin él, un cuerpo de
 * decenas de megas se cargaría entero en memoria antes de que la validación lo rechace.
 */
export async function readJson<T>(request: NextRequest, maxBytes = MAX_BODY_BYTES): Promise<T> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new MarketError("La petición es demasiado grande.", 413);
  const text = await request.text();
  if (text.length > maxBytes) throw new MarketError("La petición es demasiado grande.", 413);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new MarketError("Cuerpo no válido.", 400);
  }
}

/* Limitador por IP en memoria del arranque del Worker. No sustituye a una regla de limitación de
 * Cloudflare (cada arranque lleva su cuenta), pero frena ráfagas de un mismo origen. */
const windows = new Map<string, { start: number; count: number }>();

export function clientKey(request: NextRequest): string {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

/** `true` si esta IP ya ha gastado su cupo de `name` en la ventana. */
export function rateLimited(request: NextRequest, name: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const key = `${name}:${clientKey(request)}`;
  const entry = windows.get(key);
  if (!entry || now - entry.start >= windowMs) {
    if (windows.size > 5000) for (const [k, v] of windows) if (now - v.start >= windowMs) windows.delete(k);
    windows.set(key, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}

export const tooManyRequests = () =>
  NextResponse.json({ error: "Demasiadas peticiones. Espera un minuto y vuelve a intentarlo." }, { status: 429, headers: { "Retry-After": "60" } });

/** Solo para pruebas. */
export function resetRateLimits(): void {
  windows.clear();
}
