import Link from "next/link";
import { formatMoney, type Owner } from "@/lib/kit";
import KitNudgeLink from "@/components/KitNudgeLink";

/**
 * Who here owns this, and what they paid for it.
 *
 * The paid figures are the point: they are first-hand, they carry a date, and
 * unlike the used-price estimates they are nobody else's data. That is also
 * why they only appear for owners who chose to share them; the query already
 * blanks the price for everyone else, so this list shows what it is given.
 */
export default function OwnersList({
  owners,
  entityType,
  entityId,
}: {
  owners: Owner[];
  entityType: "lens" | "camera";
  entityId: number;
}) {
  // An empty list is still a question worth asking. The rail button is the
  // control; this is the sentence that tells a reader the list is theirs to
  // start.
  if (owners.length === 0) {
    return (
      <div>
        <h2 className="mb-2 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          Owners here
        </h2>
        <p className="text-sm text-muted-foreground">
          Nobody here has recorded owning this yet.{" "}
          <KitNudgeLink
            entityType={entityType}
            entityId={entityId}
            source="owners_empty"
          />
        </p>
      </div>
    );
  }

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
