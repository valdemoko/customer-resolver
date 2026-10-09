import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/server";
import { getOwnedUnits } from "@/lib/market/service";
import { fail } from "../helpers";

export const dynamic = "force-dynamic";

/** Espacios que posee ahora la cuenta conectada (vacío si no hay sesión). */
export async function GET() {
  try {
    const user = await currentUser();
    const unitIds = user ? await getOwnedUnits(user.id, user.email) : [];
    return NextResponse.json({ unitIds }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return fail(error);
  }
}
