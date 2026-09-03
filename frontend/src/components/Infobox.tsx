export type Fact = {
  label: string;
  /** Rendered in tabular mono; pass null to drop the row entirely. */
  value: string | number | null | undefined;
  /** Shown after the value, dimmed, so the magnitude reads first. */
  unit?: string;
  /**
   * Values are set in tabular figures because most of them are numbers. A
   * prose-shaped value ("Fujinon Aspherical Super EBC GF 35mm f/4") wraps to
   * two right-aligned monospace lines, so it opts out.
   */
  mono?: boolean;
};

/**
 * The specifications summary, as a reference work would set it: label left,
 * value right in tabular figures, one hairline per row. On desktop it sits in
 * the sticky rail; on mobile it comes before the prose, because the numbers
 * are what most visitors arrived for.
 */
export default function Infobox({
  title,
  facts,
  footer,
}: {
  title: string;
  facts: Fact[];
  footer?: React.ReactNode;
}) {
  const rows = facts.filter(
    (f) => f.value !== null && f.value !== undefined && f.value !== "",
  );
  if (rows.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <h2 className="border-b border-border bg-muted px-4 py-2.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </h2>
      <dl className="px-4 py-1">
        {rows.map((fact, i) => (
          <div
            key={fact.label}
            className={`flex items-baseline justify-between gap-4 py-2 ${
              i < rows.length - 1 ? "border-b border-border" : ""
            }`}
          >
            <dt className="text-sm text-muted-foreground">{fact.label}</dt>
            <dd
              className={`text-right text-sm ${
                fact.mono === false ? "" : "font-mono tabular-nums"
              }`}
            >
              {fact.value}
              {fact.unit && (
                <span className="ml-1 text-xs text-muted-foreground">{fact.unit}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {footer && (
        <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          {footer}
        </div>
      )}
    </section>
  );
}
