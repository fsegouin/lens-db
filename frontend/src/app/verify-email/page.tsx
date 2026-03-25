"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleVerify() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        router.push("/login?verified=true");
      } else {
        const data = await res.json();
        setError(data.error || "Verification failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  // Token present: show confirmation button
  if (token) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Verify your email
          </h1>
          <p className="text-sm text-muted-foreground">
            Click the button below to verify your email address and activate your
            account.
          </p>
          {error && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </p>
          )}
          <button
            onClick={handleVerify}
            disabled={loading}
            className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {loading ? "Verifying..." : "Verify my email"}
          </button>
        </div>
      </div>
    );
  }

  // No token: post-registration "check your email" message
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Check your email
        </h1>
        <p className="text-sm text-muted-foreground">
          We sent a verification link to your email address. Click the link to
          verify your account and start contributing.
        </p>
        <p className="text-sm text-muted-foreground">
          The link expires in 24 hours. If you don&apos;t see the email, check your
          spam folder.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Go to sign in
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
