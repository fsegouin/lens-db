import Link from "next/link";
import type { RecentChange } from "@/lib/recent-changes";

const TYPE_LABEL: Record<RecentChange["entityType"], string> = {
  lens: "lens",
  camera: "camera",
  system: "mount",
  collection: "collection",
  series: "series",
};

/** Field names as a reader would say them, for the boilerplate summaries. */
const FIELD_LABEL: Record<string, string> = {
  weightG: "weight",
  filterSizeMm: "filter size",
  minFocusDistanceM: "minimum focus distance",
  maxMagnification: "magnification",
  systemId: "mount",
  yearIntroduced: "year introduced",
  yearDiscontinued: "year discontinued",
  apertureMin: "minimum aperture",
  apertureMax: "maximum aperture",
  focalLengthMin: "focal length",
  focalLengthMax: "focal length",
  lensElements: "elements",
  lensGroups: "groups",
  diaphragmBlades: "diaphragm blades",
  hasStabilization: "stabilisation",
  hasAutofocus: "autofocus",
  sensorSize: "sensor size",
  sensorType: "sensor type",
  bodyType: "body type",
  lensType: "lens type",
  productionStatus: "production status",
  imageUrls: "images",
};

function fieldLabel(field: string): string {
  return (
    FIELD_LABEL[field] ??
    field
      .replace(/^specs\./, "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .toLowerCase()
  );
}

/**
 * Edits made through the admin forms are filed with a placeholder summary.
 * On a public page "Admin edit" says nothing; the fields it touched do.
 */
function readableSummary(c: RecentChange): string {
  const boilerplate = /^(admin edit|edit|update)$/i.test(c.summary.trim());
  if (!boilerplate) return c.summary;
  const fields = Array.from(new Set(c.changedFields.map(fieldLabel))).filter(Boolean);
  if (fields.length === 0) return "Corrected details";
  const shown = fields.slice(0, 4).join(", ");
  return `Changed ${shown}${fields.length > 4 ? ` and ${fields.length - 4} more` : ""}`;
}

function dayKey(value: Date | string | null): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function formatDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Revisions grouped by day: what, why, who. Shared by the site-wide recent
 * changes page and the contributions block on a profile, which is why the
 * editor can be turned off. A hundred rows on one day carry the date once,
 * not a hundred times.
 */
export default function ChangeList({
  changes,
  showEditor = true,
}: {
  changes: RecentChange[];
  showEditor?: boolean;
}) {
  if (changes.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">Nothing yet.</p>;
  }

  const days: { day: string; items: RecentChange[] }[] = [];
  for (const c of changes) {
    const key = dayKey(c.createdAt);
    const last = days[days.length - 1];
    if (last && last.day === key) last.items.push(c);
    else days.push({ day: key, items: [c] });
  }

  return (
    <div className="space-y-6">
      {days.map(({ day, items }) => (
        <section key={day || "undated"}>
          <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            {day ? formatDay(day) : "Undated"}
          </h3>
          <ul className="divide-y divide-border border-y border-border">
            {items.map((c) => (
              <li key={c.id} className="flex items-baseline gap-4 py-2.5">
                <span className="min-w-0 flex-1">
                  {c.entityPath && c.entityName ? (
                    <Link href={c.entityPath} className="font-medium hover:underline">
                      {c.entityName}
                    </Link>
                  ) : (
                    <span className="font-medium text-muted-foreground">
                      A {TYPE_LABEL[c.entityType]} that has since been removed
                    </span>
                  )}
                  <span className="block text-sm text-muted-foreground">
                    {c.isRevert && <span className="mr-1 font-mono text-xs">revert</span>}
                    {readableSummary(c)}
                    {showEditor && (
                      <>
                        {" "}
                        <span aria-hidden="true">·</span>{" "}
                        {c.editor ? (
                          <Link
                            href={`/community/${c.editor.handle}`}
                            className="underline underline-offset-2 hover:text-foreground"
                          >
                            {c.editor.displayName}
                          </Link>
                        ) : (
                          "an editor"
                        )}
                      </>
                    )}
                  </span>
                </span>
                <Link
                  href={`/history/${c.entityType}/${c.entityId}`}
                  className="shrink-0 py-1 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  history
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
