import { NextResponse } from "next/server";
import { authConfigured } from "@/lib/auth/google";
import { isAdminEmail } from "@/lib/admin/auth";
import { currentUser } from "@/lib/auth/server";
import { getMarketStore } from "@/lib/market/service";

export const dynamic = "force-dynamic";

/** Quién es el usuario de la sesión (para la barra superior). Sin sesión: `user: null`. */
/** Cuentas ya anotadas por esta instancia: la alta se hace una vez, no en cada carga de página. */
const noted = new Set<string>();

export async function GET() {
  const user = await currentUser();
  // Quien ya tenía la sesión abierta antes de que existiera la lista de cuentas se anota aquí. Se espera
  // la escritura (en un Worker una promesa suelta se corta al responder) y un fallo no afecta a la respuesta.
  if (user && !noted.has(user.id)) {
    try {
      await (await getMarketStore()).recordLogin({ id: user.id, email: user.email, name: user.name });
      noted.add(user.id);
    } catch {
      /* se reintenta en la próxima consulta */
    }
  }
  return NextResponse.json(
    { user: user ? { name: user.name, email: user.email, picture: user.picture } : null, enabled: authConfigured(), admin: isAdminEmail(user?.email) },
    { headers: { "cache-control": "no-store" } },
  );
}
