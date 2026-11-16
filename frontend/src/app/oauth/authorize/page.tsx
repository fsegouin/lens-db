import { redirect } from "next/navigation";
import AuthorizeApp from "@/components/AuthorizeApp";
import { SCOPES, authorizeQuery, callbackUrl, parseAuthorizeRequest } from "@/lib/oauth";
import { utmSource } from "@/lib/safe-next";
import { getCurrentUser } from "@/lib/user-auth";

// The answer depends on who is signed in and on a one-off request, so it is
// rendered per request and never cached or indexed.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Connect an app",
  robots: { index: false, follow: false },
};

/**
 * Where an app sends a member to ask for access to their kit (lib/oauth.ts).
 *
 * Someone who is not signed in is sent to sign in, or to create an account
 * when the app says they are new (screen_hint=signup), and comes back here
 * afterwards, by way of the verification email if need be. A utm_source on
 * the address follows them through, so sign-ups an app sends can be counted.
 */
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = Object.fromEntries(
    Object.entries(await searchParams).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );

  const outcome = parseAuthorizeRequest(params);
  if (!outcome.ok) {
    if (outcome.redirect !== null) redirect(outcome.redirect);
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-sm space-y-4">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            This app cannot be connected
          </h1>
          <p role="alert" className="text-sm text-muted-foreground">
            {outcome.message}
          </p>
          <p className="text-sm text-muted-foreground">
            Close this window and start again from the app. If it keeps
            happening, the app may need an update.
          </p>
        </div>
      </div>
    );
  }

  const { request } = outcome;
  const query = authorizeQuery(request);
  const campaign = utmSource(new URLSearchParams({ utm_source: params.utm_source ?? "" }));
  if (campaign) query.set("utm_source", campaign);
  const here = `/oauth/authorize?${query}`;

  const user = await getCurrentUser();
  if (!user) {
    const page = params.screen_hint === "signup" ? "/register" : "/login";
    const onward = new URLSearchParams({ next: here });
    if (campaign) onward.set("utm_source", campaign);
    redirect(`${page}?${onward}`);
  }

  const scopes = request.scope.split(" ").map((scope) => SCOPES[scope]);
  return (
    <AuthorizeApp
      clientId={request.client.id}
      appName={request.client.name}
      grants={scopes.flatMap((scope) => scope.grants)}
      withheld={scopes.map((scope) => scope.withheld)}
      displayName={user.displayName}
      request={Object.fromEntries(authorizeQuery(request))}
      refuseUrl={callbackUrl(request.redirectUri, { error: "access_denied", state: request.state })}
      signInHref={`/login?${new URLSearchParams({ next: here })}`}
    />
  );
}
