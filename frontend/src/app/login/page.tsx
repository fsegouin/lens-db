"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useUser } from "@/components/user-context";
import { trackEvent } from "@/lib/analytics";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh: refreshUser } = useUser();
  const verified = searchParams.get("verified") === "true";
  const tokenError = searchParams.get("error");
  const reset = searchParams.get("reset") === "true";
  const reason = searchParams.get("reason");
  const rawNext = searchParams.get("next");
  // Only allow same-origin relative paths to avoid open redirects
  const next =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\")
      ? rawNext
      : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setErrorCode("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        trackEvent("signed_in", { source: "login_page", reason: reason ?? "" });
        await refreshUser();
        router.push(next || "/");
      } else {
        setError(data.error || "Login failed");
        setErrorCode(data.code || "");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    if (resending || !email) return;
    setResending(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        trackEvent("verification_resent", { source: "login_page" });
        setResent(true);
      } else if (res.status === 429) {
        setError("Too many requests. Wait a few minutes and try again.");
        setErrorCode("");
      }
    } catch {
      setError("Network error");
      setErrorCode("");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Sign in
        </h1>
        {reason === "kit" && (
          <p className="text-sm text-muted-foreground">
            Add this to your kit once you are signed in.
          </p>
        )}
        {reset && (
          <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
            Password changed. Sign in with the new one.
          </p>
        )}
        {verified && (
          <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
            Email verified! You can now sign in.
          </p>
        )}
        {tokenError === "invalid-token" && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            Invalid or expired verification link.
          </p>
        )}
        {error && errorCode === "EMAIL_NOT_VERIFIED" ? (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            <p className="font-medium">Email not verified</p>
            <p className="mt-1">
              Check your inbox for a verification link. The link expires in 24 hours.
            </p>
            {resent ? (
              <p className="mt-2 font-medium">A new link is on its way.</p>
            ) : (
              <button
                type="button"
                onClick={resendVerification}
                disabled={resending}
                className="mt-2 font-medium underline underline-offset-2 disabled:opacity-50"
              >
                {resending ? "Sending..." : "Resend the link"}
              </button>
            )}
          </div>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : null}
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoFocus
            className="w-full rounded-lg border border-zinc-300 px-4 py-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <label htmlFor="password" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
            >
              Forgot your password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            className="w-full rounded-lg border border-zinc-300 px-4 py-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-medium text-zinc-900 hover:underline dark:text-zinc-100">
            Create one
          </Link>
        </p>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
