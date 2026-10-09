import { NextResponse } from "next/server";
import { authConfigured } from "@/lib/auth/google";
import { currentUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** Quién es el usuario de la sesión (para la barra superior). Sin sesión: `user: null`. */
export async function GET() {
  const user = await currentUser();
  return NextResponse.json(
    { user: user ? { name: user.name, email: user.email, picture: user.picture } : null, enabled: authConfigured() },
    { headers: { "cache-control": "no-store" } },
  );
}
