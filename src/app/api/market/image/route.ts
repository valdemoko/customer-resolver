import { NextResponse, type NextRequest } from "next/server";
import { getUnitImage } from "@/lib/market/service";
import { fail } from "../helpers";

export const dynamic = "force-dynamic";

/** Una imagen de una unidad comprada: `?unit=b:way/1&face=f2` (o `logo`, `all`, `roof`). */
export async function GET(request: NextRequest) {
  try {
    const unit = request.nextUrl.searchParams.get("unit") ?? "";
    const face = request.nextUrl.searchParams.get("face") ?? "";
    if (!/^(logo|all|roof|f\d{1,2})$/.test(face)) return NextResponse.json({ error: "Cara no válida." }, { status: 400 });
    const image = await getUnitImage(unit, face);
    if (!image) return NextResponse.json({ error: "Sin imagen." }, { status: 404 });
    // `v` cambia con cada compra: la URL con versión puede cachearse mucho tiempo.
    const cache = request.nextUrl.searchParams.has("v") ? "public, max-age=31536000, immutable" : "no-store";
    return new NextResponse(image.bytes as BodyInit, {
      headers: { "Content-Type": image.mime, "Cache-Control": cache, "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    return fail(error);
  }
}
