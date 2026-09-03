"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KIT_CONDITIONS, type KitItem, type KitValue } from "@/lib/kit-shared";

function money(n: number): string {
  return `$${n.toLocaleString()}`;
}

/**
 * The owner's view of their own kit: one row per thing, editable in place.
 *
 * Everything a person adds here is theirs, so the figures are stated with
 * their coverage attached. A total that silently skipped the third of the kit
 * with no recorded price would read as authoritative and be wrong.
 */
export default function KitManager({
  initialItems,
  initialValue,
  initialIsPublic,
  handle,
}: {
  initialItems: KitItem[];
  initialValue: KitValue;
  initialIsPublic: boolean;
  handle: string | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [value, setValue] = useState(initialValue);
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [savingId, setSavingId] = useState<number | null>(null);

  async function refresh() {
    const res = await fetch("/api/kit");
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.items);
    setValue(data.value);
  }

  async function patch(id: number, patchBody: Record<string, unknown>) {
    setSavingId(id);
    try {
      const res = await fetch("/api/kit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patchBody }),
      });
      if (!res.ok) throw new Error(String(res.status));
      await refresh();
    } catch {
      toast.error("That did not save.");
    } finally {
      setSavingId(null);
    }
  }

  async function remove(id: number) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/kit?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      setItems((prev) => prev.filter((i) => i.id !== id));
      await refresh();
      toast.success("Removed");
    } catch {
      toast.error("That did not save.");
    } finally {
      setSavingId(null);
    }
  }

  async function togglePublic() {
    const next = !isPublic;
    try {
      const res = await fetch("/api/kit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kitIsPublic: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setIsPublic(next);
      toast.success(next ? "Your kit is now public" : "Your kit is private again");
    } catch {
      toast.error("That did not save.");
    }
  }

  if (items.length === 0) {
    return (
      <div className="mt-8 rounded-lg border border-border p-8 text-center">
        <p className="font-display text-lg font-semibold">Nothing here yet</p>
        <p className="mx-auto mt-2 max-w-md text-muted-foreground">
          Open any lens or camera and press <strong>I own this</strong>. What
          you add shows up here with what it is worth used.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Link href="/lenses" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Browse lenses
          </Link>
          <Link href="/cameras" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Browse cameras
          </Link>
        </div>
      </div>
    );
  }

  const unpriced = value.totalItems - value.pricedItems;
  // Counted like the total, so two of one lens is two items in both places.
  const countOf = (type: "lens" | "camera") =>
    items.filter((i) => i.entityType === type).reduce((n, i) => n + i.quantity, 0);

  return (
    <>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Estimated value
          </p>
          <p className="mt-1 font-mono text-2xl tabular-nums">
            {money(value.estimatedUsd)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {unpriced === 0
              ? `Across all ${value.totalItems} items`
              : `From ${value.pricedItems} of ${value.totalItems} items; ${unpriced} ${
                  unpriced === 1 ? "has" : "have"
                } no recorded price`}
          </p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            What you paid
          </p>
          <p className="mt-1 font-mono text-2xl tabular-nums">
            {value.paidItems > 0 ? money(value.paidUsd) : "Not recorded"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {value.paidItems > 0
              ? `From the ${value.paidItems} you have filled in`
              : "Fill in what you paid to compare against the estimate"}
          </p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Items
          </p>
          <p className="mt-1 font-mono text-2xl tabular-nums">{value.totalItems}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {countOf("lens")} {countOf("lens") === 1 ? "lens" : "lenses"},{" "}
            {countOf("camera")} {countOf("camera") === 1 ? "body" : "bodies"}
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-border p-4">
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {isPublic ? "Your kit is public" : "Your kit is private"}
          </p>
          <p className="text-sm text-muted-foreground">
            {isPublic && handle ? (
              <>
                Anyone with the link can see it at{" "}
                <Link href={`/kit/${handle}`} className="underline underline-offset-2">
                  /kit/{handle}
                </Link>
                . Serial numbers, notes and what you paid are never shown.
              </>
            ) : (
              "Only you can see it. A list of what you own and what it is worth is worth keeping to yourself unless you choose otherwise."
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={togglePublic}>
          {isPublic ? "Make private" : "Publish"}
        </Button>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {["Item", "Qty", "Condition", "Paid", "Worth used", ""].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="border-b border-border bg-muted px-3 py-2 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className={savingId === item.id ? "opacity-50" : ""}>
                <td className="border-b border-border px-3 py-2">
                  <Link
                    href={`/${item.entityType === "lens" ? "lenses" : "cameras"}/${item.slug}`}
                    className="font-medium hover:underline"
                  >
                    {item.name}
                  </Link>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {item.yearIntroduced ?? ""}
                  </span>
                </td>
                <td className="border-b border-border px-3 py-2">
                  <Input
                    type="number"
                    min={1}
                    max={999}
                    defaultValue={item.quantity}
                    aria-label={`Quantity of ${item.name}`}
                    className="h-8 w-16"
                    onBlur={(e) => {
                      const q = parseInt(e.target.value);
                      if (Number.isInteger(q) && q !== item.quantity) {
                        patch(item.id, { quantity: q });
                      }
                    }}
                  />
                </td>
                <td className="border-b border-border px-3 py-2">
                  <select
                    defaultValue={item.condition ?? ""}
                    aria-label={`Condition of ${item.name}`}
                    className="h-8 rounded-md border border-border bg-transparent px-2 text-sm"
                    onChange={(e) =>
                      patch(item.id, { condition: e.target.value || null })
                    }
                  >
                    <option value="">Not stated</option>
                    {KIT_CONDITIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="border-b border-border px-3 py-2">
                  <Input
                    type="number"
                    min={0}
                    placeholder="$"
                    defaultValue={item.acquiredPriceUsd ?? ""}
                    aria-label={`What you paid for ${item.name}`}
                    className="h-8 w-24"
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      const n = raw === "" ? null : parseInt(raw);
                      if (n !== item.acquiredPriceUsd) {
                        patch(item.id, { acquiredPriceUsd: n });
                      }
                    }}
                  />
                </td>
                <td className="border-b border-border px-3 py-2 font-mono tabular-nums">
                  {item.estimatedUsd != null ? money(item.estimatedUsd) : (
                    <span className="text-muted-foreground">Not recorded</span>
                  )}
                </td>
                <td className="border-b border-border px-3 py-2 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(item.id)}
                    aria-label={`Remove ${item.name} from your kit`}
                  >
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        Worth used is the midpoint of the range this site records for each item,
        which comes from completed sales rather than asking prices. It is a
        guide, not a valuation, and it says nothing about the condition of your
        particular copy.
      </p>
    </>
  );
}
