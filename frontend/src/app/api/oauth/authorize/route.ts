import { NextRequest, NextResponse } from "next/server";
import { callbackUrl, parseAuthorizeRequest } from "@/lib/oauth";
import { createAuthorizationCode } from "@/lib/oauth-store";
import { rateLimitedResponse } from "@/lib/api-utils";
import { createRateLimit } from "@/lib/rate-limit";
import { requireUserAPI } from "@/lib/user-auth";

const SESSION_COOKIE = "user_session";

const authorizeLimiter = createRateLimit("oauth-authorize", 20, "60 s");

/**
 * POST /api/oauth/authorize: the signed-in member pressed Allow on the consent
 * screen. The request is read again from scratch rather than trusted from the
 * page, and the answer is the address to send the browser to, code attached.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUserAPI(request.cookies.get(SESSION_COOKIE)?.value);
  if (auth instanceof NextResponse) return auth;

  const { success } = await authorizeLimiter.limit(`user:${auth.user.id}`);
  if (!success) return rateLimitedResponse();

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const params = Object.fromEntries(
    Object.entries(body).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );

  const outcome = parseAuthorizeRequest(params);
  if (!outcome.ok) {
    return NextResponse.json(
      { error: outcome.redirect === null ? outcome.message : "This connection request is not valid" },
      { status: 400 },
    );
  }

  try {
    const code = await createAuthorizationCode(auth.user.id, outcome.request);
    return NextResponse.json({
      redirect: callbackUrl(outcome.request.redirectUri, { code, state: outcome.request.state }),
    });
  } catch (error) {
    console.error("POST /api/oauth/authorize error:", error);
    return NextResponse.json({ error: "Could not connect the app" }, { status: 500 });
  }
}
