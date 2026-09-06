"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { useUser } from "@/components/user-context";
import { trackEvent } from "@/lib/analytics";

/** Where a visitor goes to sign in and come straight back to this page. */
export function kitSignInHref(pathname: string): string {
  return `/login?next=${encodeURIComponent(pathname)}&reason=kit`;
}

/**
 * Adds one lens or camera to the signed-in person's kit.
 *
 * The membership state is fetched here rather than rendered by the server on
 * purpose. Entity pages are cached for a week and shared by every visitor, so
 * reading the session cookie during their render would make them dynamic
 * again, which is what made every lens page a fresh database hit before.
 *
 * A visitor who is not signed in sees the same button. It is the one thing on
 * the page that gives them a reason to have an account, and hiding it from
 * exactly the people it is meant to recruit is why nobody had one.
 */
export default function KitButton({
  entityType,
  entityId,
}: {
  entityType: "lens" | "camera";
  entityId: number;
}) {
  const { user, loading: userLoading } = useUser();
  const pathname = usePathname();
  const [state, setState] = useState<"loading" | "anonymous" | "in" | "out">(
    "loading",
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      setState("anonymous");
      return;
    }
    let cancelled = false;
    fetch(`/api/kit?entityType=${entityType}&entityId=${entityId}`)
      .then((r) => (r.status === 401 ? null : r.json()))
      .then((data) => {
        if (cancelled) return;
        setState(data == null ? "anonymous" : data.inKit ? "in" : "out");
      })
      .catch(() => {
        if (!cancelled) setState("anonymous");
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId, user, userLoading]);

  if (state === "loading") {
    return (
      <Button variant="outline" size="sm" disabled>
        I own this
      </Button>
    );
  }

  if (state === "anonymous") {
    return (
      <Link
        href={kitSignInHref(pathname)}
        className={buttonVariants({ variant: "outline", size: "sm" })}
        onClick={() =>
          trackEvent("signup_prompt_click", { source: "kit_button", entityType })
        }
      >
        I own this
      </Link>
    );
  }

  const inKit = state === "in";

  async function toggle() {
    setBusy(true);
    const next = !inKit;
    try {
      const res = next
        ? await fetch("/api/kit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entityType, entityId }),
          })
        : await fetch(`/api/kit?entityType=${entityType}&entityId=${entityId}`, {
            method: "DELETE",
          });
      // Retrying is exactly what keeps this failing: every attempt refills the
      // sliding window, so a rate-limited click has to be told to wait rather
      // than sent round the "try again" loop that caused it.
      if (res.status === 429) {
        toast.error("Too many kit changes just now. Give it a minute.");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setState(next ? "in" : "out");
      trackEvent(next ? "kit_add" : "kit_remove", { entityType });
      toast.success(next ? "Added to your kit" : "Removed from your kit");
    } catch {
      toast.error("That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant={inKit ? "secondary" : "outline"}
      size="sm"
      onClick={toggle}
      disabled={busy}
      aria-pressed={inKit}
    >
      {inKit ? "In your kit" : "I own this"}
    </Button>
  );
}
