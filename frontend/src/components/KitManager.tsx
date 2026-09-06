"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  KIT_CONDITIONS,
  KIT_CURRENCIES,
  formatMoney,
  type KitItem,
  type KitValue,
} from "@/lib/kit-shared";
import { tableHeadClass } from "@/components/ui/table";

/** Estimates come from sales priced in USD and are never converted. */
function usd(n: number): string {
  return formatMoney(n, "USD");
}

/**
 * One editable row, holding its own field state.
 *
 * The fields are controlled from state seeded once at mount rather than from
 * the item prop. Saving reloads the kit so the totals move, and an uncontrolled
 * input whose defaultValue changes underneath it warns and then quietly stops
 * tracking what was typed.
 */
function KitRow({
  item,
  saving,
  currency,
  onPatch,
  onRemove,
}: {
  item: KitItem;
  saving: boolean;
  currency: string;
  onPatch: (id: number, patch: Record<string, unknown>) => void;
  onRemove: (id: number) => void;
}) {
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [paid, setPaid] = useState(
    item.acquiredPrice == null ? "" : String(item.acquiredPrice),
  );
  const [condition, setCondition] = useState(item.condition ?? "");
  const [acquiredYear, setAcquiredYear] = useState(
    item.acquiredYear == null ? "" : String(item.acquiredYear),
  );

  return (
    <tr className={saving ? "opacity-50" : ""}>
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
          value={quantity}
          aria-label={`Quantity of ${item.name}`}
          className="h-8 w-16"
          onChange={(e) => setQuantity(e.target.value)}
          onBlur={() => {
            const q = parseInt(quantity);
            if (!Number.isInteger(q) || q < 1 || q > 999) {
              setQuantity(String(item.quantity));
              return;
            }
            if (q !== item.quantity) onPatch(item.id, { quantity: q });
          }}
        />
      </td>
      <td className="border-b border-border px-3 py-2">
        <select
          value={condition}
          aria-label={`Condition of ${item.name}`}
          className="h-8 rounded-md border border-border bg-transparent px-2 text-sm"
          onChange={(e) => {
            setCondition(e.target.value);
            onPatch(item.id, { condition: e.target.value || null });
          }}
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
          min={1830}
          max={new Date().getFullYear() + 1}
          placeholder="Year"
          value={acquiredYear}
          aria-label={`Year you got the ${item.name}`}
          className="h-8 w-20"
          // No prefill on focus: an empty box must stay empty, or tabbing
          // through the row would silently record this year as the purchase.
          onChange={(e) => setAcquiredYear(e.target.value)}
          onBlur={() => {
            const raw = acquiredYear.trim();
            if (raw === "") {
              if (item.acquiredYear != null) onPatch(item.id, { acquiredYear: null });
              return;
            }
            const n = parseInt(raw);
            if (!Number.isInteger(n) || n < 1830 || n > new Date().getFullYear() + 1) {
              setAcquiredYear(item.acquiredYear == null ? "" : String(item.acquiredYear));
              return;
            }
            if (n !== item.acquiredYear) onPatch(item.id, { acquiredYear: n });
          }}
        />
      </td>
      <td className="border-b border-border px-3 py-2">
        <Input
          type="number"
          min={0}
          max={1000000}
          placeholder={currency}
          value={paid}
          aria-label={`What you paid for ${item.name}, in ${currency}`}
          className="h-8 w-24"
          onChange={(e) => setPaid(e.target.value)}
          onBlur={() => {
            const raw = paid.trim();
            if (raw === "") {
              if (item.acquiredPrice != null) {
                onPatch(item.id, { acquiredPrice: null });
              }
              return;
            }
            const n = parseInt(raw);
            if (!Number.isInteger(n) || n < 0) {
              setPaid(item.acquiredPrice == null ? "" : String(item.acquiredPrice));
              return;
            }
            if (n !== item.acquiredPrice) {
              onPatch(item.id, { acquiredPrice: n });
            }
          }}
        />
      </td>
      <td className="border-b border-border px-3 py-2 font-mono tabular-nums">
        {item.estimatedUsd != null ? (
          usd(item.estimatedUsd)
        ) : (
          <span className="text-muted-foreground">Not recorded</span>
        )}
      </td>
      <td className="border-b border-border px-3 py-2 text-right">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemove(item.id)}
          aria-label={`Remove ${item.name} from your kit`}
        >
          Remove
        </Button>
      </td>
    </tr>
  );
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
  initialCurrency,
  handle,
}: {
  initialItems: KitItem[];
  initialValue: KitValue;
  initialIsPublic: boolean;
  initialCurrency: string;
  handle: string | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [value, setValue] = useState(initialValue);
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [currency, setCurrency] = useState(initialCurrency);
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

  async function savePrefs(patch: Record<string, unknown>) {
    const res = await fetch("/api/kit", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(String(res.status));
  }

  async function togglePublic() {
    const next = !isPublic;
    try {
      await savePrefs({ kitIsPublic: next });
      setIsPublic(next);
      trackEvent("kit_published", { public: next });
      toast.success(next ? "Your kit is now public" : "Your kit is private again");
    } catch {
      toast.error("That did not save.");
    }
  }

  async function changeCurrency(next: string) {
    const previous = currency;
    setCurrency(next);
    try {
      await savePrefs({ kitCurrency: next });
    } catch {
      setCurrency(previous);
      toast.error("That did not save.");
    }
  }

  if (items.length === 0) {
    return (
      <div className="mt-8 rounded-lg border border-border p-8 text-center">
        <p className="text-lg font-semibold">Nothing here yet</p>
        <p className="mx-auto mt-2 max-w-md text-muted-foreground">
          Open any lens or camera and press <strong>I own this</strong>.
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
            {usd(value.estimatedUsd)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {unpriced === 0
              ? "All items priced"
              : `${value.pricedItems} of ${value.totalItems} items priced`}
          </p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            What you paid
          </p>
          <p className="mt-1 font-mono text-2xl tabular-nums">
            {value.paidItems > 0
              ? formatMoney(value.paid, currency)
              : "Not recorded"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {value.paidItems > 0
              ? `${value.paidItems} of ${value.totalItems} filled in`
              : "Not filled in yet"}
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

      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={togglePublic}
            className="h-4 w-4 rounded border-border"
          />
          <span>Show my kit on my profile</span>
          {isPublic && handle && (
            <Link
              href={`/community/${handle}`}
              className="font-mono text-xs text-muted-foreground underline underline-offset-2"
            >
              /community/{handle}
            </Link>
          )}
        </label>

        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">Paid in</span>
          <select
            value={currency}
            aria-label="Currency you paid in"
            className="h-8 rounded-md border border-border bg-transparent px-2 text-sm"
            onChange={(e) => changeCurrency(e.target.value)}
          >
            {KIT_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Lenses and bodies are shopped for and valued separately, so they get
          a table each rather than one list sorted by when it was added. */}
      {(
        [
          ["lens", "Lenses"],
          ["camera", "Cameras"],
        ] as const
      ).map(([type, label]) => {
        const section = items.filter((i) => i.entityType === type);
        if (section.length === 0) return null;
        return (
          <section key={type} className="mt-8">
            <h2 className="mb-2 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
              {label}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    {[
                      "Item",
                      "Qty",
                      "Condition",
                      "Acquired",
                      `Paid (${currency})`,
                      "Worth used (USD)",
                      "",
                    ].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className={tableHeadClass}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.map((item) => (
                    <KitRow
                      key={item.id}
                      item={item}
                      saving={savingId === item.id}
                      currency={currency}
                      onPatch={patch}
                      onRemove={remove}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <p className="mt-4 text-sm text-muted-foreground">
        Worth used is the midpoint of recorded sales. A guide, not a valuation.
      </p>
    </>
  );
}
