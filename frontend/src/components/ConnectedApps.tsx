"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import type { ConnectedApp } from "@/lib/oauth-store";

const DAY = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * The apps a member has let into their kit, each with the one thing to do
 * about it: take the access back. Disconnecting ends the app's token at once;
 * the kit itself is untouched.
 */
export default function ConnectedApps({ initialApps }: { initialApps: ConnectedApp[] }) {
  const [apps, setApps] = useState(initialApps);
  const [busy, setBusy] = useState<string | null>(null);

  async function disconnect(app: ConnectedApp) {
    setBusy(app.clientId);
    try {
      const res = await fetch(`/api/account/apps?${new URLSearchParams({ client: app.clientId })}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(String(res.status));
      setApps((current) => current.filter((a) => a.clientId !== app.clientId));
      trackEvent("app_disconnected", { app: app.clientId });
      toast.success(`${app.name} is disconnected`);
    } catch {
      toast.error("That did not save. Try again.");
    } finally {
      setBusy(null);
    }
  }

  if (apps.length === 0) return null;

  return (
    <section className="mt-12 max-w-xl">
      <h2 className="mb-3 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
        Connected apps
      </h2>
      <ul className="space-y-3">
        {apps.map((app) => (
          <li key={app.clientId} className="flex items-start justify-between gap-4 text-sm">
            <span>
              <span className="font-medium">{app.name}</span>
              <span className="block text-muted-foreground">
                Can see your kit and add or remove items. Connected{" "}
                {DAY.format(new Date(app.connectedAt))}
                {app.lastUsedAt ? `, last used ${DAY.format(new Date(app.lastUsedAt))}` : ""}.
              </span>
            </span>
            <Button
              variant="outline"
              size="sm"
              className="-mt-1 shrink-0"
              disabled={busy === app.clientId}
              onClick={() => disconnect(app)}
            >
              Disconnect
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
