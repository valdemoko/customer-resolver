import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth/server";
import { editUnit } from "@/lib/market/service";
import { fail, rateLimited, readJson, tooManyRequests } from "../helpers";

export const dynamic = "force-dynamic";

/** Edita el anuncio de un espacio ya comprado (sin cobrar). Solo su dueño actual. */
export async function PUT(request: NextRequest) {
  try {
    if (rateLimited(request, "edit", 30, 60_000)) return tooManyRequests();
    const body = await readJson<{ unitId?: string; content?: unknown; token?: string }>(request);
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
