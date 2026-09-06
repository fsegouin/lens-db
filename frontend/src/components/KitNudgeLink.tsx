"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { useUser } from "@/components/user-context";
import { kitSignInHref } from "@/components/KitButton";
import { trackEvent, type EventName } from "@/lib/analytics";

/**
 * A text link that puts this lens or body in the reader's kit, or sends them
 * to sign in first and brings them back here afterwards.
 *
 * The rail already carries the button. This is for the two places on the
 * page where the question "do you own one?" comes up in prose: the empty
 * owners list and the moment after someone rates it.
 */
export default function KitNudgeLink({
  entityType,
  entityId,
  source,
  event = "signup_prompt_click",
  label = "I own this",
  className = "underline underline-offset-2 hover:text-foreground",
}: {
  entityType: "lens" | "camera";
  entityId: number;
  source: string;
  event?: Extract<EventName, "signup_prompt_click" | "rating_kit_nudge_click">;
  label?: string;
  className?: string;
}) {
  const { user, loading } = useUser();
  const pathname = usePathname();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (done) return <span className="text-muted-foreground">In your kit.</span>;

  if (!loading && !user) {
    return (
      <Link
        href={kitSignInHref(pathname)}
        className={className}
        onClick={() =>
          trackEvent(event, { source, entityType, signedIn: false })
        }
      >
        {label}
      </Link>
    );
  }

  async function add() {
    if (busy || loading) return;
    setBusy(true);
    trackEvent(event, { source, entityType, signedIn: true });
    try {
      const res = await fetch("/api/kit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId }),
      });
      if (res.status === 429) {
        toast.error("Too many kit changes just now. Give it a minute.");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      trackEvent("kit_add", { entityType });
      setDone(true);
      toast.success("Added to your kit");
    } catch {
      toast.error("That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={add}
      disabled={busy || loading}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {label}
    </button>
  );
}
