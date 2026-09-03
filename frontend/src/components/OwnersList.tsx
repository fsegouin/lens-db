import Link from "next/link";
import { formatMoney, type Owner } from "@/lib/kit";

/**
 * Who here owns this, and what they paid for it.
 *
 * The paid figures are the point: they are first-hand, they carry a date, and
 * unlike the used-price estimates they are nobody else's data.
 */
export default function OwnersList({ owners }: { owners: Owner[] }) {
  if (owners.length === 0) return null;

  const total = owners.reduce((n, o) => n + o.quantity, 0);

  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
        Owned by {total} {total === 1 ? "person" : "people"} here
      </h2>
      <ul className="divide-y divide-border border-y border-border">
        {owners.map((owner) => (
          <li
            key={owner.handle}
            className="flex items-baseline justify-between gap-4 py-2"
          >
            <span className="min-w-0">
              <Link
                href={`/community/${owner.handle}`}
                className="font-medium hover:underline"
              >
                {owner.displayName}
              </Link>
              {owner.quantity > 1 && (
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  &times;{owner.quantity}
                </span>
              )}
            </span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
              {[
                owner.condition,
                owner.acquiredPrice != null &&
                  `paid ${formatMoney(owner.acquiredPrice, owner.currency)}`,
                owner.acquiredYear && `in ${owner.acquiredYear}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
