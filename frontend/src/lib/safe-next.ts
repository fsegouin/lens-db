/**
 * Where to send someone once they have signed in, registered or verified
 * their address: the `next` parameter the account pages pass between
 * themselves, and the verification email carries.
 *
 * It only ever names a path on this site. Anything that a browser could read
 * as another host is dropped, so a crafted link cannot use the sign-in page
 * to bounce someone elsewhere.
 */
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw || raw.length > 2000) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  // Browsers treat a backslash as a slash and drop tabs and newlines, either
  // of which can turn a path into "//host".
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return null;
  return raw;
}

/** Whether the way back leads to an app waiting to be connected (app/oauth/authorize). */
export function returnsToApp(next: string | null): boolean {
  return next?.startsWith("/oauth/authorize?") ?? false;
}

/** "?next=..." for a link to another account page, or "" when there is nowhere to return to. */
export function nextQuery(next: string | null): string {
  return next ? `?${new URLSearchParams({ next })}` : "";
}

/** The sign-in page with its message, and the way back when there is one. */
export function signInPath(message: Record<string, string>, next: string | null): string {
  return `/login?${new URLSearchParams({ ...message, ...(next ? { next } : {}) })}`;
}

/**
 * The campaign someone arrived under, for the membership funnel events: a
 * utm_source on the page itself, or on the page they are on their way back
 * to. An app that sends people here to connect puts its name there.
 */
export function utmSource(params: URLSearchParams): string {
  const direct = params.get("utm_source");
  const next = safeNextPath(params.get("next"));
  const carried = next ? new URL(next, "http://site.invalid").searchParams.get("utm_source") : null;
  // "||": an empty utm_source on the page must not hide the one carried back.
  const source = direct || carried || "";
  return /^[A-Za-z0-9_.-]{1,40}$/.test(source) ? source : "";
}
