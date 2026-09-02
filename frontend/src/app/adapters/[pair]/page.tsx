import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import JsonLd from "@/components/JsonLd";
import {
  adaptVerdict,
  getMountsWithFlange,
  getPopularLensesForMount,
} from "@/lib/adapters";
import { entityMetadata, SITE_URL } from "@/lib/seo";

export const revalidate = 604800;

/** "canon-fd-to-sony-e" -> the two mount slugs, longest-first to avoid ambiguity. */
async function parsePair(pair: string) {
  const mounts = await getMountsWithFlange();
  const bySlug = new Map(mounts.map((m) => [m.slug, m]));

  // Longest slug first: a slug that is a prefix of another must not win.
  const bySlugLength = [...mounts].sort((a, b) => b.slug.length - a.slug.length);

  for (const from of bySlugLength) {
    const prefix = `${from.slug}-to-`;
    if (!pair.startsWith(prefix)) continue;
    const to = bySlug.get(pair.slice(prefix.length));
    if (to && to.slug !== from.slug) return { from, to };
  }
  return null;
}

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pair: string }>;
}) {
  const { pair } = await params;
  const parsed = await parsePair(pair);
  if (!parsed) return { title: "Adapter Not Found" };

  const { from, to } = parsed;
  const verdict = adaptVerdict(from, to);
  return entityMetadata({
    title: `${from.name} lenses on ${to.name} bodies`,
    description:
      `${verdict.summary}. ${from.name} has a ${from.flangeDistanceMm} mm register and ` +
      `${to.name} has ${to.flangeDistanceMm} mm, which is what decides whether a plain ` +
      `adapter can reach infinity focus.`,
    path: `/adapters/${from.slug}-to-${to.slug}`,
  });
}

const TONE: Record<string, string> = {
  native: "border-border bg-muted",
  adapts: "border-[color:var(--ok)] bg-[color:var(--ok)]/10",
  tight: "border-[color:var(--warn)] bg-[color:var(--warn)]/10",
  optics: "border-[color:var(--warn)] bg-[color:var(--warn)]/10",
  unknown: "border-border bg-muted",
};

export default async function AdapterPage({
  params,
}: {
  params: Promise<{ pair: string }>;
}) {
  const { pair } = await params;
  const parsed = await parsePair(pair);
  if (!parsed) notFound();

  const { from, to } = parsed;
  const verdict = adaptVerdict(from, to);
  const lensSample = await getPopularLensesForMount(from.id);

  const crumbs = [
    { name: "Adapting", path: "/adapters" },
    { name: `${from.name} to ${to.name}` },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: `Can ${from.name} lenses be used on ${to.name} bodies?`,
              acceptedAnswer: {
                "@type": "Answer",
                text: `${verdict.summary}. ${verdict.detail}`,
              },
            },
          ],
          url: `${SITE_URL}/adapters/${from.slug}-to-${to.slug}`,
        }}
      />

      <Breadcrumb crumbs={crumbs} />

      <h1 className="mt-4 text-3xl font-bold tracking-tight text-balance">
        {from.name} lenses on {to.name} bodies
      </h1>

      <div className={`mt-6 rounded-lg border p-5 ${TONE[verdict.kind]}`}>
        <p className="font-display text-xl font-semibold">{verdict.summary}</p>
        <p className="mt-2 leading-relaxed">{verdict.detail}</p>
      </div>

      {/* The arithmetic in the open, so the answer can be checked. */}
      {from.flangeDistanceMm != null && to.flangeDistanceMm != null && (
        <dl className="mt-6 overflow-hidden rounded-lg border border-border">
          <div className="flex items-baseline justify-between gap-4 border-b border-border px-4 py-2.5">
            <dt className="text-sm text-muted-foreground">
              {from.name} register
            </dt>
            <dd className="font-mono text-sm tabular-nums">
              {from.flangeDistanceMm} mm
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-b border-border px-4 py-2.5">
            <dt className="text-sm text-muted-foreground">{to.name} register</dt>
            <dd className="font-mono text-sm tabular-nums">
              {to.flangeDistanceMm} mm
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
            <dt className="text-sm text-muted-foreground">
              Room for an adapter
            </dt>
            <dd className="font-mono text-sm tabular-nums">
              {Math.round((from.flangeDistanceMm - to.flangeDistanceMm) * 100) / 100} mm
            </dd>
          </div>
        </dl>
      )}

      <p className="mt-6 text-sm text-muted-foreground">
        <Link href={`/systems/${from.slug}`} className="underline underline-offset-2">
          {from.name}
        </Link>{" "}
        has {from.lensCount.toLocaleString()}{" "}
        {from.lensCount === 1 ? "lens" : "lenses"} recorded here.{" "}
        <Link href={`/systems/${to.slug}`} className="underline underline-offset-2">
          {to.name}
        </Link>{" "}
        has {to.cameraCount.toLocaleString()}{" "}
        {to.cameraCount === 1 ? "body" : "bodies"}.
      </p>

      {lensSample.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            {from.name} lenses you might adapt
          </h2>
          <ul className="divide-y divide-border border-y border-border">
            {lensSample.map((lens) => (
              <li key={lens.id}>
                <Link
                  href={`/lenses/${lens.slug}`}
                  className="flex flex-col gap-1 py-2.5 transition-colors hover:bg-muted/50"
                >
                  <span className="font-medium leading-snug">{lens.name}</span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {[
                      lens.focalLengthMin
                        ? lens.focalLengthMax && lens.focalLengthMax !== lens.focalLengthMin
                          ? `${lens.focalLengthMin}-${lens.focalLengthMax}mm`
                          : `${lens.focalLengthMin}mm`
                        : null,
                      lens.apertureMin ? `f/${lens.apertureMin}` : null,
                      lens.yearIntroduced,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-8 border-t border-border pt-4 text-xs text-muted-foreground">
        Worked out from the two mounts&rsquo; flange focal distances. It does not
        account for whether an adapter exists commercially, for electronic
        contacts, or for mirror clearance on SLR bodies.
      </p>
    </div>
  );
}
