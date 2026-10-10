import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth/server";
import { castPollVote, getPoll, pollError } from "@/lib/poll";
import { clientKey, fail, rateLimited, readJson, tooManyRequests } from "../market/helpers";

export const dynamic = "force-dynamic";

const COOKIE = "rs_voter";

/** Quién vota: la cuenta, si hay sesión; si no, un identificador aleatorio de la cookie. */
async function voter(request: NextRequest): Promise<{ key: string | null; fresh: string | null }> {
  const user = await currentUser();
  if (user) return { key: `u:${user.id}`, fresh: null };
  const existing = request.cookies.get(COOKIE)?.value;
  if (existing && /^[0-9a-f-]{36}$/.test(existing)) return { key: `c:${existing}`, fresh: null };
  return { key: null, fresh: crypto.randomUUID() };
}

/** Huella de la IP con sal: se compara, pero no se puede deshacer ni se guarda la IP. */
async function ipHash(request: NextRequest): Promise<string> {
  const data = new TextEncoder().encode(`${clientKey(request)}|${process.env.SESSION_SECRET ?? "local"}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest).slice(0, 8), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function GET(request: NextRequest) {
  try {
    const { key } = await voter(request);
    return NextResponse.json(await getPoll(key), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (rateLimited(request, "poll", 12, 60_000)) return tooManyRequests();
    const body = await readJson<{ optionId?: string }>(request, 2_000);
    const { key, fresh } = await voter(request);
    const voterKey = key ?? `c:${fresh}`;
    const failure = pollError(await castPollVote(voterKey, String(body.optionId ?? ""), await ipHash(request)));
    if (failure) throw failure;
    const response = NextResponse.json(await getPoll(voterKey), { headers: { "Cache-Control": "no-store" } });
    if (fresh) {
      response.cookies.set(COOKIE, fresh, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 365 * 86400 });
    }
    return response;
  } catch (error) {
    return fail(error);
  }
}
