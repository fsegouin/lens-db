import Link from "next/link";

export default function VerifyEmailPage() {
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
