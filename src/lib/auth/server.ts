import { cookies } from "next/headers";
import { readSessionToken, SESSION_COOKIE, type SessionUser } from "./session";

/** Usuario de la sesión actual (o `null`). Solo en servidor. */
export async function currentUser(): Promise<SessionUser | null> {
  try {
    const store = await cookies();
    return await readSessionToken(store.get(SESSION_COOKIE)?.value);
  } catch {
    // Una cookie ilegible o un secreto sin configurar nunca debe tumbar la petición: sin sesión.
    return null;
  }
}
