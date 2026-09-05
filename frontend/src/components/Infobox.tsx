import Link from "next/link";

export type FactCitation = {
  sourceName: string;
  sourceUrl: string | null;
  retrievedAt: Date;
};

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
  /**
   * Where this particular figure came from, when it came from anywhere other
   * than the bulk import. Most facts have none and show nothing: that absence
   * is the honest signal, and filling it with a default would erase the only
   * way to tell a checked figure from an unchecked one.
   */
  citation?: FactCitation | null;
};

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * Footnote marks, not digits. Most values in this box are numbers set in
 * tabular figures, and a superscript numeral against them reads as part of the
 * figure: "2004" with a second-source mark became "2004¹", and "13 / 10" became
 * "13 / 10¹". Symbols cannot be misread as magnitude, which is the reason
 * reference works use them in numeric tables.
 */
const MARKS = ["*", "\u2020", "\u2021", "\u00a7"];
const markFor = (n: number) => MARKS[n - 1] ?? `*${n}`;

/** Always underlined: on a touch screen a hover-only underline is no cue at all. */
function CiteLink({ citation }: { citation: FactCitation }) {
  const { sourceName, sourceUrl } = citation;
  if (!sourceUrl) return <>{sourceName}</>;
  if (sourceUrl.startsWith("http")) {
    return (
      <a
        href={sourceUrl}
        className="underline underline-offset-2"
        rel="nofollow noopener"
        target="_blank"
      >
        {sourceName}
      </a>
    );
  }
  return (
    <Link href={sourceUrl} className="underline underline-offset-2">
      {sourceName}
    </Link>
  );
}

/**
 * The specifications summary, as a reference work would set it: label left,
 * value right in tabular figures, one hairline per row. On desktop it sits in
 * the sticky rail; on mobile it comes before the prose, because the numbers
 * are what most visitors arrived for.
 *
 * A figure that has been sourced carries a superscript marker to a note at the
 * foot, the way a reference work cites. The apparatus appears only when there
 * is something to cite, so most pages are unchanged.
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

  // One number per source, not per row. Four figures taken from the same
  // DPReview page are one reference cited four times, and printing it four
  // times over is the padding a reference work exists to avoid.
  const notes: FactCitation[] = [];
  const numberOf = new Map<string, number>();
  for (const fact of rows) {
    if (!fact.citation) continue;
    const key = `${fact.citation.sourceName}|${fact.citation.sourceUrl ?? ""}`;
    let n = notes.findIndex(
      (c) => `${c.sourceName}|${c.sourceUrl ?? ""}` === key,
    );
    if (n === -1) n = notes.push(fact.citation) - 1;
    numberOf.set(fact.label, n + 1);
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <h2 className="border-b border-border bg-muted px-4 py-2.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </h2>
      <dl className="px-4 py-1">
        {rows.map((fact, i) => {
          const n = numberOf.get(fact.label);
          return (
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
                  <span className="ml-1 text-xs text-muted-foreground">
                    {fact.unit}
                  </span>
                )}
                {n && (
                  /*
                   * Not a link. The note it would jump to sits a few rows
                   * below in this same card, so the anchor bought nothing and
                   * cost three things: a 18x13px tap target, a duplicate id
                   * (the rail renders twice, once per breakpoint), and a
                   * marker that scrolled nowhere on desktop because
                   * getElementById found the hidden copy first.
                   */
                  <sup
                    className="ml-0.5 text-[10px] text-muted-foreground"
                    aria-label={`Sourced: ${fact.citation!.sourceName}`}
                  >
                    {markFor(n)}
                  </sup>
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      {notes.length > 0 && (
        /*
         * One source is the only case that occurs across all 148 cited lenses
         * today, so it is set as a plain line rather than an ordered list of
         * one, which a screen reader announces as "list, 1 item". The numbered
         * form waits for a page that actually cites two things.
         */
        <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          {notes.map((c, i) => (
            <p key={`${c.sourceName}-${i}`} className="py-0.5">
              {notes.length > 1 && <span>{markFor(i + 1)} </span>}
              <CiteLink citation={c} />
              <span className="text-muted-foreground/80">
                {" "}
                · {dateFormat.format(c.retrievedAt)}
              </span>
            </p>
          ))}
        </div>
      )}

      {footer && (
        <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          {footer}
        </div>
      )}
    </section>
  );
}
