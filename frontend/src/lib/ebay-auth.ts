let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * The request currently fetching a token, so callers that arrive together
 * wait on one instead of each starting their own.
 *
 * Caching only the resolved token was enough while the pipeline ingested one
 * entity at a time: the first call had populated the cache before the second
 * ran. Now a batch starts several workers at once, and on a cold instance or
 * an expired token every one of them would miss the cache in the same tick
 * and fire its own client_credentials request.
 */
let inFlight: Promise<string> | null = null;

export async function getEbayAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }
  if (inFlight) return inFlight;

  // Cleared in a finally rather than on success alone, so a failed fetch does
  // not leave every later caller awaiting a promise that already rejected.
  inFlight = fetchAccessToken().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function fetchAccessToken(): Promise<string> {
  const clientId = process.env.EBAY_APP_ID;
  const clientSecret = process.env.EBAY_CERT_ID;

  if (!clientId || !clientSecret) {
    throw new Error("EBAY_APP_ID and EBAY_CERT_ID are required");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
  });

  if (!res.ok) {
    throw new Error(`eBay OAuth failed: ${res.status}`);
  }

  const data: { access_token: string; expires_in: number; token_type: string } = await res.json();

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  };

  return data.access_token;
}
