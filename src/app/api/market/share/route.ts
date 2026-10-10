import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth/server";
import { recordShare, shareCountOf } from "@/lib/shares";
import { fail, clientKey, rateLimited, readJson, tooManyRequests } from "../helpers";

export const dynamic = "force-dynamic";

/** Puntos de compartido de un anuncio (público, sin datos de nadie). */
export async function GET(request: NextRequest) {
  try {
    const unitId = request.nextUrl.searchParams.get("unit") ?? "";
    const shares = await shareCountOf(unitId);
    return NextResponse.json({ shares }, { headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60" } });
  } catch (error) {
    return fail(error);
  }
}

/** Alguien copia el enlace de un anuncio para compartirlo: suma un punto si no es su dueño (ver `lib/shares.ts`). */
export async function POST(request: NextRequest) {
  try {
    if (rateLimited(request, "share", 20, 60_000)) return tooManyRequests();
    const body = await readJson<{ unitId?: string; token?: string }>(request, 4_000);
    const user = await currentUser();
    const result = await recordShare({
      unitId: String(body.unitId ?? ""),
      ip: clientKey(request),
      userAgent: request.headers.get("user-agent"),
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
      token: typeof body.token === "string" ? body.token : null,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return fail(error);
  }
}
