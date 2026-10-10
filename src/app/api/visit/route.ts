import { NextResponse, type NextRequest } from "next/server";
import { isAdminEmail } from "@/lib/admin/auth";
import { currentUser } from "@/lib/auth/server";
import { recordVisit } from "@/lib/visits";
import { clientKey, rateLimited } from "../market/helpers";

export const dynamic = "force-dynamic";

/**
 * Cuenta una visita (una vez por pestaña y sesión, la envía `VisitBeacon`). Sin cookies. Nunca falla de cara
 * a la persona que visita: si algo va mal, simplemente no se cuenta.
 */
export async function POST(request: NextRequest) {
  try {
    if (!rateLimited(request, "visit", 20, 60_000)) {
      const user = await currentUser();
      if (!isAdminEmail(user?.email)) {
        await recordVisit({ ip: clientKey(request), userAgent: request.headers.get("user-agent") });
      }
    }
  } catch (error) {
    console.error("[visit]", error instanceof Error ? error.message : error);
  }
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
