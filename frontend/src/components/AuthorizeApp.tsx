"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/user-context";
import { trackEvent } from "@/lib/analytics";

type Props = {
  clientId: string;
  appName: string;
  /** What the app will be able to do, one line each. */
  grants: string[];
  /** What stays out of its reach, one sentence per scope. */
  withheld: string[];
  displayName: string;
  /** The authorization request, sent back as it was asked when the member agrees. */
  request: Record<string, string>;
  /** The app's own address, carrying the refusal. */
  refuseUrl: string;
  /** Sign-in that leads back to this screen, for another account. */
  signInHref: string;
};

/**
 * The consent screen: one question, asked of the account that is signed in.
 * Either answer ends on the app's own address, so the app always hears back.
 */
export default function AuthorizeApp({
  clientId,
  appName,
  grants,
  withheld,
  displayName,
  request,
  refuseUrl,
  signInHref,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { refresh: refreshUser } = useUser();

  async function allow() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (res.status === 401) {
        // The session ended while this screen was open.
        router.push(signInHref);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not connect the app");
        setBusy(false);
        return;
      }
      trackEvent("app_connected", { app: clientId });
      // Stays busy: the browser is leaving for the app.
      window.location.assign(data.redirect);
    } catch {
      setError("Network error");
      setBusy(false);
    }
  }

  function refuse() {
    setBusy(true);
    trackEvent("app_connection_refused", { app: clientId });
    window.location.assign(refuseUrl);
  }

  async function switchAccount() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      await refreshUser();
      router.push(signInHref);
    } catch {
      setError("Network error");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Connect {appName}
        </h1>
        <p className="text-sm text-muted-foreground">
          {appName} is asking to use your Lens DB account,{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{displayName}</span>.
        </p>

        <div className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {appName} will be able to
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
            {grants.map((grant) => (
              <li key={grant}>{grant}</li>
            ))}
          </ul>
          {withheld.map((sentence) => (
            <p key={sentence} className="text-sm text-muted-foreground">
              {sentence}
            </p>
          ))}
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="space-y-2">
          <button
            type="button"
            onClick={allow}
            disabled={busy}
            className="w-full rounded-lg border border-transparent bg-zinc-900 px-4 py-2 text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Allow
          </button>
          <button
            type="button"
            onClick={refuse}
            disabled={busy}
            className="w-full rounded-lg border border-zinc-300 px-4 py-2 text-zinc-900 transition-colors hover:border-zinc-400 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:border-zinc-600"
          >
            Cancel
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          You can disconnect {appName} at any time from your kit page.
        </p>
        <p className="text-sm text-muted-foreground">
          Not {displayName}?
          <button
            type="button"
            onClick={switchAccount}
            disabled={busy}
            className="-mx-1 block rounded-sm px-1 py-0.5 font-medium text-zinc-900 hover:underline disabled:opacity-50 dark:text-zinc-100"
          >
            Use another account
          </button>
        </p>
      </div>
    </div>
  );
}
