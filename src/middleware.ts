import { NextResponse } from "next/server";

/**
 * Security header baseline (Phase 0). CSP will be tightened (nonces) when the
 * app grows per ARCHITECTURE.md §27; these defaults are safe for RSC-only pages.
 */
export function middleware(): NextResponse {
  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (!process.env.NODE_ENV || process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }
  // Belt-and-braces noindex outside production (robots.ts already handles it).
  if (process.env.NODE_ENV !== "production") {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
