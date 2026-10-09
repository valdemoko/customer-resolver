import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth/server";
import { editUnit } from "@/lib/market/service";
import { fail } from "../helpers";

export const dynamic = "force-dynamic";

/** Edita el anuncio de un espacio ya comprado (sin cobrar). Solo su dueño actual. */
export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as { unitId?: string; content?: unknown; token?: string };
    const user = await currentUser();
    const unit = await editUnit({
      unitId: String(body.unitId ?? ""),
      content: body.content,
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
      token: typeof body.token === "string" ? body.token : null,
    });
    return NextResponse.json({ unit });
  } catch (error) {
    return fail(error);
  }
}
