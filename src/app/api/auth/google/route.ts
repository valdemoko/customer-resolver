import { NextResponse, type NextRequest } from "next/server";
import { authConfigured, authorizationUrl, safeNext } from "@/lib/auth/google";
import { cookieOptions, signValue } from "@/lib/auth/session";
import { rateLimited, tooManyRequests } from "../../market/helpers";

export const dynamic = "force-dynamic";

/** Empieza el acceso con Google: guarda `state` y la ruta de vuelta en una cookie firmada y redirige. */
export async function GET(request: NextRequest) {
  if (rateLimited(request, "login", 20, 60_000)) return tooManyRequests();
  if (!authConfigured()) return NextResponse.json({ error: "El acceso con Google aún no está configurado." }, { status: 503 });
  const state = crypto.randomUUID();
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const response = NextResponse.redirect(authorizationUrl(state));
  response.cookies.set("rs_oauth", await signValue(`${state}|${encodeURIComponent(next)}`), cookieOptions(600));
  return response;
}
