import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import JsonLd from "@/components/JsonLd";
import {
  betterOf,
  getCompareRedirectSlug,
  getLensesForCompare,
  splitPairSlug,
} from "@/lib/compare";
import {
  EMPTY,
  LENS_SPEC_ROWS,
  focalLengthLabel,
  type ComparableLens,
} from "@/lib/compare-rows";
import { getEntityPriceEstimate } from "@/lib/prices";
import { getPriceDisplay, type PriceDisplay } from "@/lib/price-display";
import { entityMetadata, SITE_URL } from "@/lib/seo";

export const revalidate = 604800;

export async function generateStaticParams() {
  return [];
}

/** The canonical URL puts the lower lens id first, so a pair has one address. */
function pairPath(a: ComparableLens, b: ComparableLens): string {
  return `/compare/lenses/${a.slug}-vs-${b.slug}`;
}

async function resolvePair(pair: string) {
  for (const [s1, s2] of splitPairSlug(pair)) {
    if (s1 === s2) continue;
    const found = await getLensesForCompare([s1, s2]);
    if (found.length === 2) {
      // getLensesForCompare orders by id, which is the canonical order.
      const [a, b] = found;
      return { a, b, canonical: pairPath(a, b) };
    }
  }
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pair: string }>;
}) {
  const { pair } = await params;
  const resolved = await resolvePair(pair);
  if (!resolved) return { title: "Comparison Not Found" };

  const { a, b } = resolved;
  return entityMetadata({
    title: `${a.name} vs ${b.name}`,
    description:
      `Side by side: ${a.name} and ${b.name}, both ${focalLengthLabel(a)} lenses. ` +
      `Specifications, what separates them, and what each sells for used.`,
    path: pairPath(a, b),
  });
}

function priceLabel(display: PriceDisplay | null): string {
  if (!display || display.low == null) return EMPTY;
  return display.low === display.high
    ? `$${display.low}`
    : `$${display.low} to $${display.high}`;
}

/** Reads the clauses as a sentence rather than a comma-separated list. */
function joinClauses(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * The differences worth saying out loud, in the order a buyer weighs them.
 * Anything the records do not hold is left unsaid rather than guessed at.
 */
function differences(a: ComparableLens, b: ComparableLens): string[] {
  const out: string[] = [];

  // Two different makers are told apart by their names alone, and repeating
  // the full model on every clause makes the sentence unreadable.
  const distinctBrands =
    !!a.brand && !!b.brand && a.brand.toLowerCase() !== b.brand.toLowerCase();
  const name = (which: "a" | "b") => {
    const lens = which === "a" ? a : b;
    return distinctBrands ? lens.brand! : lens.name;
  };

  const faster = betterOf(a.apertureMin, b.apertureMin, true);
  if (faster) {
    const fast = faster === "a" ? a : b;
    out.push(`the ${name(faster)} opens wider, at f/${fast.apertureMin}`);
  }

  const lighter = betterOf(a.weightG, b.weightG, true);
  if (lighter && a.weightG && b.weightG) {
    const diff = Math.abs(a.weightG - b.weightG);
    if (diff >= 20) out.push(`the ${name(lighter)} is ${diff}g lighter`);
  }

  const newer = betterOf(a.yearIntroduced, b.yearIntroduced, false);
  if (newer && a.yearIntroduced && b.yearIntroduced) {
    const diff = Math.abs(a.yearIntroduced - b.yearIntroduced);
    if (diff >= 1) {
      out.push(
        `the ${name(newer)} is ${diff} ${diff === 1 ? "year" : "years"} newer`,
      );
    }
  }

  if (a.hasAutofocus !== b.hasAutofocus) {
    out.push(`only the ${name(a.hasAutofocus ? "a" : "b")} autofocuses`);
  }

  if (a.hasStabilization !== b.hasStabilization) {
    out.push(`only the ${name(a.hasStabilization ? "a" : "b")} is stabilised`);
  }

  const closer = betterOf(a.minFocusDistanceM, b.minFocusDistanceM, true);
  if (closer && a.minFocusDistanceM && b.minFocusDistanceM) {
    const near = closer === "a" ? a : b;
    out.push(`the ${name(closer)} focuses closer, to ${near.minFocusDistanceM}m`);
  }

  return out;
}

export default async function CompareLensesPage({
  params,
}: {
  params: Promise<{ pair: string }>;
}) {
  const { pair } = await params;
  const resolved = await resolvePair(pair);

  if (!resolved) {
    // One side may have been merged away; send the old link to the survivor.
    for (const [s1, s2] of splitPairSlug(pair)) {
      const [r1, r2] = await Promise.all([
        getCompareRedirectSlug(s1),
        getCompareRedirectSlug(s2),
      ]);
      if (r1 || r2) {
        const next = await resolvePair(`${r1 ?? s1}-vs-${r2 ?? s2}`);
        if (next) permanentRedirect(next.canonical);
      }
    }
    notFound();
  }

  const { a, b, canonical } = resolved;
  if (`/compare/lenses/${pair}` !== canonical) permanentRedirect(canonical);

  const [estA, estB] = await Promise.all([
    getEntityPriceEstimate("lens", a.id),
    getEntityPriceEstimate("lens", b.id),
  ]);
  const priceA = getPriceDisplay(estA);
  const priceB = getPriceDisplay(estB);

  const diffs = differences(a, b);
  const shared = focalLengthLabel(a);

  const rows = LENS_SPEC_ROWS.map((row) => {
    const va = row.getValue(a);
    const vb = row.getValue(b);
    return { label: row.label, va, vb, differs: va !== vb };
  });

  return (
    <div className="w-full max-w-6xl">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `${a.name} vs ${b.name}`,
          url: `${SITE_URL}${canonical}`,
          itemListElement: [a, b].map((lens, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: {
              "@type": "Product",
              name: lens.name,
              brand: lens.brand ?? undefined,
              url: `${SITE_URL}/lenses/${lens.slug}`,
            },
          })),
        }}
      />

      <Breadcrumb
        crumbs={[
          { name: "Compare", path: "/compare" },
          { name: `${a.name} vs ${b.name}` },
        ]}
      />

      <h1 className="mt-4 text-3xl font-bold tracking-tight text-balance">
        {a.name} vs {b.name}
      </h1>

      <p className="mt-3 text-lg leading-relaxed">
        Both are {shared} lenses that fit the same bodies.{" "}
        {diffs.length > 0 ? (
          <>
            The records separate them on{" "}
            {diffs.length === 1 ? "one point" : "a few points"}:{" "}
            {joinClauses(diffs.slice(0, 3))}.
          </>
        ) : (
          <>
            On the specifications recorded here they are closely matched, which
            makes condition and price the deciding factors.
          </>
        )}
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {[
          { lens: a, price: priceA },
          { lens: b, price: priceB },
        ].map(({ lens, price }) => (
          <div key={lens.id} className="rounded-lg border border-border p-4">
            <Link
              href={`/lenses/${lens.slug}`}
              className="font-semibold hover:underline"
            >
              {lens.name}
            </Link>
            <p className="mt-2 font-mono text-sm tabular-nums text-muted-foreground">
              Used {priceLabel(price)}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            {a.name} and {b.name} specifications side by side
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="border-b border-border bg-muted px-3 py-2 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase"
              >
                Specification
              </th>
              <th
                scope="col"
                className="border-b border-border bg-muted px-3 py-2 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase"
              >
                {a.name}
              </th>
              <th
                scope="col"
                className="border-b border-border bg-muted px-3 py-2 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase"
              >
                {b.name}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th
                  scope="row"
                  className="border-b border-border px-3 py-2 text-left font-normal text-muted-foreground"
                >
                  {row.label}
                </th>
                <td
                  className={`border-b border-border px-3 py-2 ${row.differs ? "font-medium" : ""}`}
                >
                  {row.va}
                </td>
                <td
                  className={`border-b border-border px-3 py-2 ${row.differs ? "font-medium" : ""}`}
                >
                  {row.vb}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        Rows where the two differ are set in bold. &ldquo;Not recorded&rdquo;
        means the figure is missing from the record, not that the lens lacks
        the feature.
      </p>
    </div>
  );
}
