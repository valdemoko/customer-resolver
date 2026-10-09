import { NextResponse, type NextRequest } from "next/server";
import { getUnitView } from "@/lib/market/service";
import { fail } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id") ?? "";
    return NextResponse.json(await getUnitView(id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return fail(error);
  }
}
