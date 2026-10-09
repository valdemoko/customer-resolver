import { cookies } from "next/headers";
import { readSessionToken, SESSION_COOKIE, type SessionUser } from "./session";

/** Usuario de la sesión actual (o `null`). Solo en servidor. */
export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return readSessionToken(store.get(SESSION_COOKIE)?.value);
}
