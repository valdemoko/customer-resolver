import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth/server";
import { claimFree } from "@/lib/market/service";
import { fail } from "../helpers";

export const dynamic = "force-dynamic";

/** Reclama un espacio gratis. Requiere sesión (cuenta de Google) y respeta el máximo por cuenta. */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { unitId?: string; content?: unknown };
    const user = await currentUser();
    const unit = await claimFree({
      unitId: String(body.unitId ?? ""),
      content: body.content,
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
    });
    return NextResponse.json({ unit });
  } catch (error) {
    return fail(error);
  }
}
