import { NextRequest, NextResponse } from "next/server";
import { getClientIP } from "@/lib/api-utils";
import { bearerToken } from "@/lib/oauth";
import { revokeToken } from "@/lib/oauth-store";
import { tooManyRequests } from "@/lib/partner-auth";
import { createRateLimit } from "@/lib/rate-limit";

const revokeLimiter = createRateLimit("oauth-revoke", 20, "60 s");

/**
 * POST /api/oauth/revoke: an app hands its token back when the member signs
 * out of it. Answers 200 whether or not the token existed (RFC 7009), so the
 * app can forget it either way and nothing is learned by guessing.
 */
export async function POST(request: NextRequest) {
  const { success, reset } = await revokeLimiter.limit(`oauth-revoke:${getClientIP(request)}`);
  if (!success) return tooManyRequests(reset);

  const done = () => NextResponse.json({}, { headers: { "Cache-Control": "no-store" } });
  let presented: FormDataEntryValue | null;
  try {
    presented = (await request.formData()).get("token");
  } catch {
    return done();
  }
  const token = typeof presented === "string" ? bearerToken(`Bearer ${presented}`) : null;
  if (!token) return done();

  try {
    await revokeToken(token);
  } catch (error) {
    // A 5xx tells the app to keep its copy and try again at next sign-out.
    console.error("POST /api/oauth/revoke error:", error);
    return NextResponse.json({ error: "The token could not be revoked" }, { status: 500 });
  }
  return done();
}
