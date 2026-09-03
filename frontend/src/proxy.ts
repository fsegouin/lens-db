import { NextRequest, NextResponse } from "next/server";

/**
 * The public developer surface: the versioned read API, the bulk dump, the
 * MCP endpoint and the page documenting them.
 *
 * Built and kept in the tree, but switched off until we choose to open it.
 * Blocking it here rather than in each route means one switch, no per-route
 * conditionals to forget, and no way to reach it by finding an unguarded path.
 * Set PUBLIC_API_ENABLED=true to open it.
 */
const DEVELOPER_SURFACE = ["/api/v1", "/api/mcp", "/developers"];

export function publicApiEnabled(): boolean {
  return process.env.PUBLIC_API_ENABLED === "true";
}

function isDeveloperSurface(pathname: string): boolean {
  return DEVELOPER_SURFACE.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
}

/**
 * Proxy that runs on matched routes.
 *
 * - Hides the public developer surface unless it is switched on.
 * - Redirects unauthenticated users away from /admin/* routes.
 * - Validates the Origin header to prevent CSRF attacks on state-changing
 *   API endpoints (POST, PUT, PATCH, DELETE).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // A 404 rather than a 403: an endpoint that is not open yet should not
  // announce that it exists.
  if (isDeveloperSurface(pathname) && !publicApiEnabled()) {
    return new NextResponse(null, { status: 404 });
  }

  // Protect /admin routes — check for user_session cookie (role is validated server-side)
  if (pathname.startsWith("/admin")) {
    const session = request.cookies.get("user_session")?.value;
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  // CSRF: validate Origin on mutating API requests
  if (
    pathname.startsWith("/api/") &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(request.method)
  ) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");

    if (origin && host) {
      let originHost: string;
      try {
        originHost = new URL(origin).host;
      } catch {
        // Malformed Origin (e.g. "null" from sandboxed iframes) — reject
        return NextResponse.json(
          { error: "Forbidden" },
          { status: 403 }
        );
      }
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
  matcher: ["/admin/:path*", "/api/:path*", "/developers"],
};
