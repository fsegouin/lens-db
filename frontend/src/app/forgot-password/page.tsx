"use client";

import { useState } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        trackEvent("password_reset_requested", { source: "forgot_page" });
        setSent(true);
      } else if (res.status === 429) {
        setError("Too many requests. Wait a few minutes and try again.");
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Could not send a reset link");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Check your email
          </h1>
          <p className="text-sm text-muted-foreground">
            If that address has an account, a link to choose a new password is on
            its way. It expires in one hour.
          </p>
          <Link
            href="/login"
            className="inline-block text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-100"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Forgot your password
        </h1>
        <p className="text-sm text-muted-foreground">
          Enter the address you signed up with and we will send a link to choose
          a new one.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
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
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {loading ? "Sending..." : "Send reset link"}
        </button>
        <p className="text-center text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-zinc-900 hover:underline dark:text-zinc-100">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
