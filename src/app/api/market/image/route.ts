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
    // `v` cambia con cada compra y con cada edición: la URL con versión es inmutable, así que se guarda en la
    // caché del borde de Cloudflare y las visitas siguientes ni tocan el Worker ni la base de datos.
    const versioned = request.nextUrl.searchParams.has("v");
    const edge = versioned ? (globalThis as { caches?: { default?: Cache } }).caches?.default : undefined;
    const hit = edge ? await edge.match(request).catch(() => undefined) : undefined;
    if (hit) return hit;
    const image = await getUnitImage(unit, face);
    if (!image) return NextResponse.json({ error: "Sin imagen." }, { status: 404 });
    const response = new NextResponse(image.bytes as BodyInit, {
      headers: {
        "Content-Type": image.mime,
        "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
    if (edge) await edge.put(request, response.clone()).catch(() => undefined);
    return response;
  } catch (error) {
    return fail(error);
  }
}
