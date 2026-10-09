/**
 * Enlaces privados de edición de quien compró sin cuenta: se guardan en este navegador
 * (`unitId → { token, since }`). `since` es la fecha de la compra: si otra persona
 * compra después, el token deja de valer y deja de ofrecerse «Editar».
 */
const KEY = "resolveo.edit.v1";

export type EditTokens = Record<string, { token: string; since: string | null }>;

export function readEditTokens(): EditTokens {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as EditTokens) : {};
  } catch {
    return {};
  }
}

export function saveEditToken(unitId: string, token: string, since: string | null): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...readEditTokens(), [unitId]: { token, since } }));
  } catch {
    /* sin almacenamiento: el enlace privado sigue sirviendo */
  }
}

/** El token de un espacio si sigue vigente para la compra actual (`since`), o `null`. */
export function tokenFor(tokens: EditTokens, unitId: string, since: string | undefined): string | null {
  const entry = tokens[unitId];
  if (!entry) return null;
  if (entry.since && since && entry.since !== since) return null;
  return entry.token;
}
