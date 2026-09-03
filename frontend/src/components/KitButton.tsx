"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Adds one lens or camera to the signed-in person's kit.
 *
 * The membership state is fetched here rather than rendered by the server on
 * purpose. Entity pages are cached for a week and shared by every visitor, so
 * reading the session cookie during their render would make them dynamic
 * again, which is what made every lens page a fresh database hit before.
 *
 * Until the answer arrives the button is not shown at all, since an "I own
 * this" that flips to "In your kit" a moment later reads as a bug.
 */
export default function KitButton({
  entityType,
  entityId,
}: {
  entityType: "lens" | "camera";
  entityId: number;
}) {
  const [state, setState] = useState<"loading" | "anonymous" | "in" | "out">(
    "loading",
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
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
  }, [entityType, entityId]);

  // Signed out, or still unknown: the rest of the page carries on without it.
  if (state === "loading" || state === "anonymous") return null;

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
