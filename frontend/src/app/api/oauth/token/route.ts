import { NextRequest, NextResponse } from "next/server";
import { getClientIP } from "@/lib/api-utils";
import { findClient } from "@/lib/oauth";
import { redeemAuthorizationCode } from "@/lib/oauth-store";
import { tooManyRequests } from "@/lib/partner-auth";
import { createRateLimit } from "@/lib/rate-limit";

const tokenLimiter = createRateLimit("oauth-token", 20, "60 s");

const NO_STORE = { "Cache-Control": "no-store" };

/** An error in the shape RFC 6749 gives a token endpoint, which OAuth libraries read. */
function oauthError(error: string, description: string, status = 400) {
  return NextResponse.json(
    { error, error_description: description },
    { status, headers: NO_STORE },
  );
}

/**
 * POST /api/oauth/token: exchanges an authorization code for an access token.
 * The app proves it is the one that started the flow with its PKCE verifier;
 * there is no client secret to present.
 */
export async function POST(request: NextRequest) {
  const { success, reset } = await tokenLimiter.limit(`oauth-token:${getClientIP(request)}`);
  if (!success) return tooManyRequests(reset);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return oauthError("invalid_request", "The body must be application/x-www-form-urlencoded");
  }
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };

  if (field("grant_type") !== "authorization_code") {
    return oauthError("unsupported_grant_type", "grant_type must be authorization_code");
  }
  const clientId = field("client_id");
  if (!findClient(clientId)) {
    return oauthError("invalid_client", "Unknown client_id", 401);
  }
  const code = field("code");
  const redirectUri = field("redirect_uri");
  const codeVerifier = field("code_verifier");
  if (!code || !redirectUri || !codeVerifier) {
    return oauthError("invalid_request", "code, redirect_uri and code_verifier are required");
  }

  try {
    const grant = await redeemAuthorizationCode({ code, clientId, redirectUri, codeVerifier });
    if (!grant) {
      return oauthError(
        "invalid_grant",
        "The code is unknown, expired or already used, or does not match this request",
      );
    }
    return NextResponse.json(
      { access_token: grant.accessToken, token_type: "Bearer", scope: grant.scope },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("POST /api/oauth/token error:", error);
    return oauthError("server_error", "The token could not be issued", 500);
  }
}
