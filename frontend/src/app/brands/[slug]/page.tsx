import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import JsonLd from "@/components/JsonLd";
import { getBrandBySlug, getBrands } from "@/lib/brands";
import { entityMetadata } from "@/lib/seo";
import { hubJsonLd } from "@/lib/jsonld";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const revalidate = 604800;

export async function generateStaticParams() {
  if (process.env.VERCEL_ENV !== "production") return [];
  const brands = await getBrands();
  return brands.map((b) => ({ slug: b.slug }));
}

/** Reads inside "made ...": "from 1931 to 2026", or "in 1979". */
function yearRange(from: number | null, to: number | null): string | null {
  if (!from && !to) return null;
  if (from && to && from !== to) return `from ${from} to ${to}`;
  return `in ${from ?? to}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = await getBrandBySlug(slug);
  if (!page) return { title: "Brand Not Found" };

  const { brand, mounts } = page;
  const span = yearRange(brand.earliestYear, brand.latestYear);

  return entityMetadata({
    title: `${brand.name} lenses`,
    description:
      `Every ${brand.name} lens in the database: ${brand.lensCount.toLocaleString()} lenses` +
      (span ? ` made ${span}` : "") +
      (mounts.length ? `, across mounts including ${mounts.slice(0, 3).map((m) => m.name).join(", ")}` : "") +
      ". Specifications, release years and used prices.",
    path: `/brands/${brand.slug}`,
  });
}

export default async function BrandPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = await getBrandBySlug(slug);
  if (!page) notFound();

  const { brand, mounts, lenses } = page;
  const span = yearRange(brand.earliestYear, brand.latestYear);
  const crumbs = [
    { name: "Lenses", path: "/lenses" },
    { name: "Brands", path: "/brands" },
    { name: brand.name },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl">
      <JsonLd
        data={hubJsonLd({
          path: `/brands/${brand.slug}`,
          name: `${brand.name} lenses`,
          description: `Lenses made by ${brand.name}.`,
          items: lenses.map((l) => ({ name: l.name, path: `/lenses/${l.slug}` })),
          crumbs,
        })}
      />

      <Breadcrumb crumbs={crumbs} />

      <div className="mt-4">
        <h1 className="text-3xl font-bold tracking-tight">{brand.name} lenses</h1>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed">
          {brand.lensCount.toLocaleString()}{" "}
          {brand.lensCount === 1 ? "lens" : "lenses"} from {brand.name} are
          recorded here{span ? `, made ${span}` : ""}.
        </p>
      </div>

      {mounts.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Mounts
          </h2>
          <ul className="flex flex-wrap gap-2">
            {mounts.map((m) => (
              <li key={m.slug}>
                <Link
                  href={`/systems/${m.slug}`}
                  className="inline-flex items-baseline gap-1.5 rounded-lg border border-border px-2.5 py-1 text-sm transition-colors hover:border-zinc-400 dark:hover:border-zinc-600"
                >
                  {m.name}
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {m.count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="mt-8 divide-y divide-border border-y border-border lg:hidden">
        {lenses.map((lens) => (
          <li key={lens.id}>
            <Link
              href={`/lenses/${lens.slug}`}
              className="flex flex-col gap-1.5 py-3 transition-colors hover:bg-muted/50"
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

      <div className="mt-8 hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Name</TableHead>
              <TableHead scope="col">Focal length</TableHead>
              <TableHead scope="col">Aperture</TableHead>
              <TableHead scope="col">Type</TableHead>
              <TableHead scope="col">Year</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lenses.map((lens) => (
              <TableRow key={lens.id}>
                <TableCell className="max-w-[26rem] whitespace-normal">
                  <Link href={`/lenses/${lens.slug}`} className="font-medium hover:underline">
                    {lens.name}
                  </Link>
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  {lens.focalLengthMin
                    ? lens.focalLengthMax && lens.focalLengthMax !== lens.focalLengthMin
                      ? `${lens.focalLengthMin}-${lens.focalLengthMax}mm`
                      : `${lens.focalLengthMin}mm`
                    : "—"}
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  {lens.apertureMin ? `f/${lens.apertureMin}` : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {lens.isZoom ? "Zoom" : "Prime"}
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  {lens.yearIntroduced ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {brand.lensCount > lenses.length && (
        <p className="mt-6 text-sm">
          <Link
            href={`/lenses?brand=${encodeURIComponent(brand.name)}`}
            className="underline underline-offset-2"
          >
            Filter all {brand.lensCount.toLocaleString()} {brand.name} lenses →
          </Link>
        </p>
      )}
    </div>
  );
}
