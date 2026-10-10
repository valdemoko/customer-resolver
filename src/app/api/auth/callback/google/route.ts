import { NextResponse, type NextRequest } from "next/server";
import { appOrigin, exchangeCode, safeNext } from "@/lib/auth/google";
import { isBanned } from "@/lib/market/service";
import { cookieOptions, createSessionToken, SESSION_COOKIE, SESSION_DAYS, verifySigned } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Vuelta de Google: comprueba `state`, intercambia el código y abre la sesión. */
export async function GET(request: NextRequest) {
  const origin = appOrigin();
  const back = (path: string) => NextResponse.redirect(`${origin}${path}`);
  const params = request.nextUrl.searchParams;
  const saved = await verifySigned(request.cookies.get("rs_oauth")?.value);
  const [state, encodedNext] = (saved ?? "").split("|");
  const next = safeNext(encodedNext ? decodeURIComponent(encodedNext) : null);
  const failure = (reason: string) => {
    const response = back(`/cuenta?error=${reason}`);
    response.cookies.delete("rs_oauth");
    return response;
  };
  if (params.get("error")) return failure("cancelado");
  const code = params.get("code");
  if (!code || !state || params.get("state") !== state) return failure("estado");
  try {
    const user = await exchangeCode(code);
    if (await isBanned(user.email, user.id)) return failure("suspendida");
    const response = back(next);
    response.cookies.set(SESSION_COOKIE, await createSessionToken(user), cookieOptions(SESSION_DAYS * 86400));
    response.cookies.delete("rs_oauth");
    return response;
  } catch (error) {
    console.error("[auth]", error instanceof Error ? error.message : error);
    return failure("google");
  }
}
