"use client";

import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

/** The home page's one invitation to have an account, counted. */
export default function StartKitLink({ source }: { source: string }) {
  return (
    <Link
      href="/kit"
      className="inline-flex items-center rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
      onClick={() => trackEvent("signup_prompt_click", { source })}
    >
      Start your kit
    </Link>
  );
}
