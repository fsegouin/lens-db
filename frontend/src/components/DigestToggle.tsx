"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";

/**
 * The one email a member can ask for: a weekly note of what was added to the
 * catalogue. Off until they tick it.
 */
export default function DigestToggle({ initialOptIn }: { initialOptIn: boolean }) {
  const [optIn, setOptIn] = useState(initialOptIn);
  const [busy, setBusy] = useState(false);

  async function change(next: boolean) {
    setBusy(true);
    try {
      const res = await fetch("/api/account/digest", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optIn: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setOptIn(next);
      trackEvent("digest_opt_in", { optIn: next });
      toast.success(next ? "You will get the weekly note" : "No more weekly notes");
    } catch {
      toast.error("That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm">
      <input
        type="checkbox"
        checked={optIn}
        disabled={busy}
        onChange={(e) => change(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-zinc-300 accent-zinc-900 dark:border-zinc-700 dark:accent-zinc-100"
      />
      <span>
        <span className="font-medium">
          Email me a weekly note of what is new in the catalogue
        </span>
        <span className="block text-muted-foreground">
          Sent on Mondays, only in weeks where something was added. Nothing else
          is ever sent.
        </span>
      </span>
    </label>
  );
}
