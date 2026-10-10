import { NextResponse, type NextRequest } from "next/server";
import { assertAdminRequest, requireAdmin } from "@/lib/admin/auth";
import * as admin from "@/lib/admin/service";
import { fail, readJson } from "../market/helpers";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

/** Lecturas del panel. Solo administradores: se comprueba en CADA petición, nunca se fía de la interfaz. */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const view = request.nextUrl.searchParams.get("view") ?? "overview";
    const data =
      view === "overview"
        ? await admin.adminOverview()
        : view === "units"
          ? await admin.adminUnitsList()
          : view === "purchases"
            ? await admin.adminPurchasesList()
            : view === "accounts"
              ? { accounts: await admin.adminAccountsList(), bans: await admin.adminBansList() }
              : view === "poll"
                ? await admin.adminPollView()
                : view === "log"
                  ? await admin.adminLogList()
                  : null;
    if (data === null) return NextResponse.json({ error: "Vista desconocida." }, { status: 400, headers: noStore });
    return NextResponse.json(data, { headers: noStore });
  } catch (error) {
    return fail(error);
  }
}

type Body = {
  action?: string;
  unitId?: string;
  reason?: string;
  purchaseId?: string;
  key?: string;
  releaseUnits?: boolean;
  name?: unknown;
  url?: unknown;
  description?: unknown;
  removePhoto?: unknown;
  id?: string;
  active?: boolean;
  days?: number;
};

/** Acciones del panel. Además de ser administrador, exigen la cabecera propia y el mismo origen (CSRF). */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin();
    assertAdminRequest(request);
    const body = await readJson<Body>(request, 20_000);
    const who = user.email;
    const text = (value: unknown) => String(value ?? "");
    switch (body.action) {
      case "release":
        await admin.releaseUnit(who, text(body.unitId), text(body.reason));
        break;
      case "edit-unit":
        await admin.editUnitContent(who, text(body.unitId), { name: body.name, url: body.url, description: body.description, removePhoto: body.removePhoto });
        break;
      case "unlock":
        await admin.unlockUnit(who, text(body.unitId));
        break;
      case "refund":
        return NextResponse.json({ ok: true, ...(await admin.refundPurchase(who, text(body.purchaseId), text(body.reason))) }, { headers: noStore });
      case "ban":
        return NextResponse.json({ ok: true, ...(await admin.banAccount(who, text(body.key), text(body.reason), body.releaseUnits === true)) }, { headers: noStore });
      case "unban":
        await admin.unbanAccount(who, text(body.key));
        break;
      case "poll-add":
        await admin.addPollCity(who, body.name);
        break;
      case "poll-toggle":
        await admin.setPollCityActive(who, text(body.id), body.active === true);
        break;
      case "poll-reset":
        await admin.resetPoll(who);
        break;
      case "purge-drafts":
        return NextResponse.json({ ok: true, removed: await admin.purgeDrafts(who, Number(body.days) || 4) }, { headers: noStore });
      default:
        return NextResponse.json({ error: "Acción desconocida." }, { status: 400, headers: noStore });
    }
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (error) {
    return fail(error);
  }
}
