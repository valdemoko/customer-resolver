/**
 * Sesión sin estado: una cookie firmada con HMAC-SHA256 (WebCrypto, funciona en
 * Node y en Cloudflare Workers). No guarda contraseñas: la identidad la da Google.
 * La clave sale de `SESSION_SECRET` (un secreto del Worker, nunca del repositorio).
 */

export const SESSION_COOKIE = "rs_session";
export const SESSION_DAYS = 30;

export type SessionUser = {
  /** Identificador estable de Google (`sub`). */
  id: string;
  email: string;
  name: string;
  picture: string;
};

type Payload = SessionUser & { exp: number };

const encoder = new TextEncoder();

function secret(): string {
  const value = process.env.SESSION_SECRET?.trim();
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV !== "production") return "desarrollo-local-no-usar-en-produccion-0000";
  throw new Error("Falta SESSION_SECRET (mínimo 32 caracteres).");
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signValue(value: string): Promise<string> {
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(), encoder.encode(value));
  return `${value}.${toBase64Url(new Uint8Array(signature))}`;
}

/** Devuelve el valor firmado si la firma es válida; si no, `null`. */
export async function verifySigned(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const value = token.slice(0, dot);
  let signature: Uint8Array;
  try {
    signature = fromBase64Url(token.slice(dot + 1));
  } catch {
    return null;
  }
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(), signature as BufferSource, encoder.encode(value));
  return ok ? value : null;
}

export async function createSessionToken(user: SessionUser, now = Date.now()): Promise<string> {
  const payload: Payload = { ...user, exp: Math.floor(now / 1000) + SESSION_DAYS * 86400 };
  return signValue(toBase64Url(encoder.encode(JSON.stringify(payload))));
}

export async function readSessionToken(token: string | undefined, now = Date.now()): Promise<SessionUser | null> {
  const value = await verifySigned(token);
  if (!value) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(value))) as Partial<Payload>;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < now) return null;
    if (!payload.id || !payload.email) return null;
    return { id: String(payload.id), email: String(payload.email), name: String(payload.name ?? ""), picture: String(payload.picture ?? "") };
  } catch {
    return null;
  }
}

export const cookieOptions = (maxAgeSeconds: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: maxAgeSeconds,
});
