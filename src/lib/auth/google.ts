import type { SessionUser } from "./session";

/**
 * Inicio de sesión con Google (OAuth 2.0 / OpenID Connect, flujo de código).
 * `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` son secretos del Worker. La URI de
 * redirección registrada en Google Cloud es `${APP_ORIGIN}/api/auth/callback/google`.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export class AuthNotConfigured extends Error {
  override name = "AuthNotConfigured";
}

function credentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new AuthNotConfigured("El acceso con Google no está configurado.");
  return { clientId, clientSecret };
}

export function authConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export function appOrigin(): string {
  const origin = process.env.APP_ORIGIN?.trim().replace(/\/$/, "");
  if (!origin) throw new AuthNotConfigured("Falta APP_ORIGIN.");
  return origin;
}

export const redirectUri = () => `${appOrigin()}/api/auth/callback/google`;

/** Solo rutas internas simples: evita que `next` convierta el login en una redirección abierta. */
export function safeNext(value: string | null | undefined): string {
  return value && /^\/(?!\/)[A-Za-z0-9/_\-?=&%:.]*$/.test(value) ? value : "/cuenta";
}

export function authorizationUrl(state: string): string {
  const { clientId } = credentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `${AUTH_URL}?${params}`;
}

type IdClaims = { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string; aud?: string; iss?: string; exp?: number };

function decodeClaims(idToken: string): IdClaims {
  const part = idToken.split(".")[1];
  if (!part) throw new Error("id_token inválido");
  const padded = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)))) as IdClaims;
}

/**
 * Cambia el código por el perfil. El id_token llega directamente de Google por TLS,
 * así que se confía en él tras comprobar emisor, audiencia y caducidad.
 */
export async function exchangeCode(code: string, fetcher: typeof fetch = fetch): Promise<SessionUser> {
  const { clientId, clientSecret } = credentials();
  const response = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri(), grant_type: "authorization_code" }),
  });
  if (!response.ok) throw new Error(`Google rechazó el código (${response.status})`);
  const data = (await response.json()) as { id_token?: string };
  if (!data.id_token) throw new Error("Google no devolvió id_token");
  const claims = decodeClaims(data.id_token);
  if (claims.aud !== clientId) throw new Error("Audiencia inesperada");
  if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") throw new Error("Emisor inesperado");
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error("id_token caducado");
  if (!claims.sub || !claims.email || claims.email_verified === false) throw new Error("Cuenta de Google sin correo verificado");
  return { id: claims.sub, email: claims.email, name: claims.name ?? claims.email, picture: claims.picture ?? "" };
}
