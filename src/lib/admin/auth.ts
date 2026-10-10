import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/auth/server";
import type { SessionUser } from "@/lib/auth/session";
import { MarketError } from "@/lib/market/service";

/**
 * Quién es administrador: las cuentas de Google cuyo correo está en `ADMIN_EMAILS` (lista separada por
 * comas, secreto del Worker). El correo viene de Google ya verificado y firmado en la sesión: no hay
 * contraseña de administrador que adivinar ni usuario que crear.
 */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export const isAdminEmail = (email: string | null | undefined): boolean => Boolean(email) && adminEmails().includes(email!.trim().toLowerCase());

/** El usuario conectado, si es administrador. Distingue «no has entrado» (401) de «no tienes permiso» (403). */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new MarketError("Entra con Google para acceder al panel.", 401);
  if (!isAdminEmail(user.email)) throw new MarketError("Esta cuenta no tiene acceso al panel.", 403);
  return user;
}

/**
 * Protección contra peticiones de otras webs (CSRF) en las acciones del panel: hace falta la cabecera
 * propia (obliga al navegador a una comprobación previa CORS que otro origen no pasa) y que, si hay
 * `Origin`, sea el de la propia web.
 */
export function assertAdminRequest(request: NextRequest): void {
  if (request.headers.get("x-admin-request") !== "1") throw new MarketError("Petición no válida.", 403);
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin && origin !== process.env.APP_ORIGIN?.replace(/\/$/, "")) {
    throw new MarketError("Origen no permitido.", 403);
  }
}
