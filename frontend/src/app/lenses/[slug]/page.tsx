import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import BackButton from "@/components/BackButton";
import { db } from "@/db";
import { lenses, systems, priceEstimates, priceHistory } from "@/db/schema";
import { formatDescription } from "@/lib/format-description";
import { formatMagnification } from "@/lib/format-magnification";
import { getImages } from "@/lib/images";
import ViewTracker from "@/components/ViewTracker";
import RatingWidget from "@/components/RatingWidget";
import ImageGallery from "@/components/ImageGallery";
import EditButton from "@/components/EditButton";
import FlagDuplicateButton from "@/components/FlagDuplicateButton";
import SpecsTable from "@/components/SpecsTable";
import { PageTransition } from "@/components/page-transition";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getCurrentUser } from "@/lib/user-auth";
import { Suspense } from "react";
import PriceCard from "@/components/PriceCard";
import EbayListings from "@/components/EbayListings";
import EbayListingsSkeleton from "@/components/EbayListingsSkeleton";

export const revalidate = 604800;

export async function generateStaticParams() {
  const rows = await db.select({ slug: lenses.slug }).from(lenses);
  return rows.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [result] = await db
    .select({ lens: lenses })
    .from(lenses)
    .where(eq(lenses.slug, slug))
    .limit(1);

  return {
    title: result ? `${result.lens.name} | The Lens DB` : "Lens Not Found",
  };
}

export default async function LensDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [result] = await db
    .select({ lens: lenses, system: systems })
    .from(lenses)
    .leftJoin(systems, eq(lenses.systemId, systems.id))
    .where(eq(lenses.slug, slug))
    .limit(1);

  if (!result) notFound();

  const { lens, system } = result;

  // Redirect if this entity was merged into another
  if (lens.mergedIntoId) {
    const [target] = await db
      .select({ slug: lenses.slug })
      .from(lenses)
      .where(eq(lenses.id, lens.mergedIntoId))
      .limit(1);
    if (target) redirect(`/lenses/${target.slug}`);
  }
  const currentUser = await getCurrentUser();

  // Fetch price data
  const [priceEstimate] = await db
    .select()
    .from(priceEstimates)
    .where(and(
      eq(priceEstimates.entityType, "lens"),
      eq(priceEstimates.entityId, lens.id),
    ))
    .limit(1);

  const priceHistoryRows = await db
    .select({
      saleDate: priceHistory.saleDate,
      condition: priceHistory.condition,
      priceUsd: priceHistory.priceUsd,
      source: priceHistory.source,
      sourceUrl: priceHistory.sourceUrl,
    })
    .from(priceHistory)
    .where(and(
      eq(priceHistory.entityType, "lens"),
      eq(priceHistory.entityId, lens.id),
    ))
    .orderBy(desc(priceHistory.saleDate));

  const allSystems = await db.select({ id: systems.id, name: systems.name }).from(systems).orderBy(systems.name);
  const specs = (lens.specs ?? {}) as Record<string, string>;
  const mountFromSpecs =
    specs["Mount"] ??
    specs["Mount and Flange focal distance"] ??
    specs["Mount type"] ??
    null;
  const cleanedMountFromSpecs = mountFromSpecs
    ? mountFromSpecs.split(";")[0].replace(/\[.*?\]/g, "").trim()
    : null;
  const apertureControl =
    specs["Aperture control"] ??
    specs["Aperture Control"] ??
    specs["Aperture ring"] ??
    null;

  const opticalRows: [string, string | number | null | undefined][] = [
    [
      "Focal Length",
      lens.focalLengthMin
        ? lens.focalLengthMin === lens.focalLengthMax
          ? `${lens.focalLengthMin}mm`
          : `${lens.focalLengthMin}-${lens.focalLengthMax}mm`
        : null,
    ],
    ["Maximum Aperture", lens.apertureMin ? `f/${lens.apertureMin}` : null],
    [
      "Minimum Aperture",
      lens.apertureMax && lens.apertureMax !== lens.apertureMin
        ? `f/${lens.apertureMax}`
        : null,
    ],
    ["Lens Elements", lens.lensElements],
    ["Lens Groups", lens.lensGroups],
    [
      "Min Focus Distance",
      lens.minFocusDistanceM ? `${lens.minFocusDistanceM}m` : null,
    ],
    [
      "Max Magnification",
      lens.maxMagnification ? formatMagnification(lens.maxMagnification) : null,
    ],
    ["Autofocus", lens.hasAutofocus ? "Yes" : "No"],
    ["Stabilization", lens.hasStabilization ? "Yes" : "No"],
    [
      "35mm Equiv.",
      specs["35mm equivalent focal length"] ??
        specs["35mm equivalent focal length range"] ??
        null,
    ],
    ["Teleconverters", specs["Teleconverters"] ?? null],
  ];

  const physicalRows: [string, string | number | null | undefined][] = [
    ["Mount/System", system?.name ?? cleanedMountFromSpecs],
    ["Weight", lens.weightG ? `${lens.weightG}g` : null],
    ["Filter Size", lens.filterSizeMm ? `${lens.filterSizeMm}mm` : null],
    ["Aperture Control", apertureControl],
    ["Diaphragm Blades", lens.diaphragmBlades],
    ["Lens Hood", specs["Lens hood"] ?? null],
    ["Year Introduced", lens.yearIntroduced],
    ["Year Discontinued", lens.yearDiscontinued],
  ];

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl space-y-8">
        <BackButton fallbackHref="/lenses" label="Back to lenses" />

        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            {lens.name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            {lens.brand && (
              <Link href={`/lenses?brand=${encodeURIComponent(lens.brand)}`}>
                <Badge variant="brand">{lens.brand}</Badge>
              </Link>
            )}
            {system && (
              <Link href={`/lenses?system=${encodeURIComponent(system.slug)}`}>
                <Badge variant="system">{system.name}</Badge>
              </Link>
            )}
            {lens.coverage && (
              <Link href={`/lenses?coverage=${encodeURIComponent(lens.coverage)}`}>
                <Badge variant="outline">
                  {lens.coverage === "aps-c" ? "APS-C"
                    : lens.coverage === "full-frame" ? "Full Frame"
                    : lens.coverage === "micro-four-thirds" ? "Micro Four Thirds"
                    : lens.coverage === "medium-format" ? "Medium Format"
                    : lens.coverage}
                </Badge>
              </Link>
            )}
            {lens.lensType && (
              <Link href={`/lenses?lensType=${encodeURIComponent(lens.lensType)}`}>
                <Badge variant="lensType">{lens.lensType}</Badge>
              </Link>
            )}
            {lens.era && (
              <Link href={`/lenses?era=${encodeURIComponent(lens.era)}`}>
                <Badge variant="era">{lens.era}</Badge>
              </Link>
            )}
            {lens.productionStatus && (
              <Link
                href={`/lenses?productionStatus=${encodeURIComponent(lens.productionStatus)}`}
              >
                <Badge variant="status">{lens.productionStatus}</Badge>
              </Link>
            )}
            {(lens.viewCount ?? 0) > 0 && (
              <span className="text-sm text-zinc-400">
                {lens.viewCount!.toLocaleString()} views
              </span>
            )}
          </div>
        </div>

        <ImageGallery
          images={
            getImages(
              "lenses",
              slug,
              (lens.images as Array<{ src: string; alt: string }>) || []
            )
          }
        />

        {lens.description && (
          <div className="space-y-3">
            {formatDescription(lens.description).map((paragraph, i) => (
              <p key={i} className="leading-relaxed text-zinc-700 dark:text-zinc-300">
                {paragraph}
              </p>
            ))}
          </div>
        )}

        <RatingWidget lensId={lens.id} />

        <PriceCard
          estimate={priceEstimate ?? null}
          history={priceHistoryRows}
        />

        <Suspense fallback={<EbayListingsSkeleton />}>
          <EbayListings query={lens.name} />
        </Suspense>

        <div className="space-y-5">
          <div>
            <h3 className="mb-2 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
              Optical
            </h3>
            <SpecsTable
              rows={opticalRows
                .filter(([, value]) => value != null && value !== "")
                .map(([label, value]) => [label, String(value)])}
            />
          </div>

          <Separator />

          <div>
            <h3 className="mb-2 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
              Physical
            </h3>
            <SpecsTable
              rows={physicalRows
                .filter(([, value]) => value != null && value !== "")
                .map(([label, value]) => [label, String(value)])}
            />
          </div>
        </div>

        {process.env.NODE_ENV === "development" && Object.keys(specs).length > 0 && (
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-400">
              Raw specs JSON ({Object.keys(specs).length} fields)
            </summary>
            <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-zinc-50 p-4 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              {JSON.stringify(specs, null, 2)}
            </pre>
          </details>
        )}

        {lens.url && /^https?:\/\//i.test(lens.url) && (
          <p className="text-xs text-zinc-400">
            Source:{" "}
            <a
              href={lens.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-zinc-600"
            >
              {lens.url}
            </a>
          </p>
        )}

        <div className="flex items-center justify-between">
          <EditButton
            entityType="lens"
            entityId={lens.id}
            entitySlug={lens.slug}
            isLoggedIn={!!currentUser}
            currentValues={{
              name: lens.name,
              url: lens.url,
              brand: lens.brand,
              description: lens.description,
              systemId: lens.systemId,
              lensType: lens.lensType,
              era: lens.era,
              productionStatus: lens.productionStatus,
              focalLengthMin: lens.focalLengthMin,
              focalLengthMax: lens.focalLengthMax,
              apertureMin: lens.apertureMin,
              apertureMax: lens.apertureMax,
              weightG: lens.weightG,
              filterSizeMm: lens.filterSizeMm,
              minFocusDistanceM: lens.minFocusDistanceM,
              maxMagnification: lens.maxMagnification,
              lensElements: lens.lensElements,
              lensGroups: lens.lensGroups,
              diaphragmBlades: lens.diaphragmBlades,
              yearIntroduced: lens.yearIntroduced,
              yearDiscontinued: lens.yearDiscontinued,
              hasAutofocus: lens.hasAutofocus,
              hasStabilization: lens.hasStabilization,
              isZoom: lens.isZoom,
              isMacro: lens.isMacro,
              isPrime: lens.isPrime,
            }}
            fields={[
              { name: "name", label: "Name", type: "text" },
              { name: "brand", label: "Brand", type: "text" },
              { name: "description", label: "Description", type: "textarea" },
              { name: "systemId", label: "Mount System", type: "select", options: allSystems.map((s) => ({ value: s.id, label: s.name })) },
              { name: "lensType", label: "Lens Type", type: "text" },
              { name: "era", label: "Era", type: "text" },
              { name: "productionStatus", label: "Production Status", type: "text" },
              { name: "focalLengthMin", label: "Focal Length Min (mm)", type: "number" },
              { name: "focalLengthMax", label: "Focal Length Max (mm)", type: "number" },
              { name: "apertureMin", label: "Max Aperture (f/)", type: "number" },
              { name: "apertureMax", label: "Min Aperture (f/)", type: "number" },
              { name: "weightG", label: "Weight (g)", type: "number" },
              { name: "filterSizeMm", label: "Filter Size (mm)", type: "number" },
              { name: "minFocusDistanceM", label: "Min Focus Distance (m)", type: "number" },
              { name: "maxMagnification", label: "Max Magnification", type: "number" },
              { name: "lensElements", label: "Lens Elements", type: "number" },
              { name: "lensGroups", label: "Lens Groups", type: "number" },
              { name: "diaphragmBlades", label: "Diaphragm Blades", type: "number" },
              { name: "yearIntroduced", label: "Year Introduced", type: "number" },
              { name: "yearDiscontinued", label: "Year Discontinued", type: "number" },
              { name: "hasAutofocus", label: "Has Autofocus", type: "boolean" },
              { name: "hasStabilization", label: "Has Stabilization", type: "boolean" },
              { name: "isZoom", label: "Zoom", type: "boolean" },
              { name: "isMacro", label: "Macro", type: "boolean" },
              { name: "isPrime", label: "Prime", type: "boolean" },
              { name: "url", label: "Source URL", type: "text" },
            ]}
          />
          <div className="flex items-center gap-2">
            <FlagDuplicateButton
              entityType="lens"
              entityId={lens.id}
              entityName={lens.name}
              isLoggedIn={!!currentUser}
            />
          </div>
        </div>

        <ViewTracker type="lens" id={lens.id} />
      </div>
    </PageTransition>
  );
}
