import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy that runs on all API mutation requests.
 *
 * - Validates the Origin header to prevent CSRF attacks on state-changing
 *   endpoints (POST, PUT, PATCH, DELETE).
 */
export function proxy(request: NextRequest) {
  // Only check mutating requests to API routes
  if (
    request.nextUrl.pathname.startsWith("/api/") &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(request.method)
  ) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");

    // In production, require a matching Origin header
    if (origin && host) {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        return NextResponse.json(
          { error: "Forbidden" },
          { status: 403 }
        );
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
