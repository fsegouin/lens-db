import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lenses, systems } from "@/db/schema";
import { getEntityPriceEstimate, getEntityPriceHistory } from "@/lib/prices";
import { formatDescription } from "@/lib/format-description";
import { formatMagnification } from "@/lib/format-magnification";
import { getImages } from "@/lib/images";
import ViewTracker from "@/components/ViewTracker";
import ImageGallery from "@/components/ImageGallery";
import EditButton from "@/components/EditButton";
import FlagDuplicateButton from "@/components/FlagDuplicateButton";
import { PageTransition } from "@/components/page-transition";
import { TopBar } from "@/components/app-shell/top-bar";
import { AtAGlance } from "@/components/lens-detail/at-a-glance";
import { RatingDisplay } from "@/components/lens-detail/rating-display";
import { SpecBlock, SpecUnit, SpecMono, type SpecValue } from "@/components/spec-block";
import { MarketBlock } from "@/components/market-block";
import { getCurrentUser } from "@/lib/user-auth";
import { Suspense } from "react";
import EbayListings from "@/components/EbayListings";
import EbayListingsSkeleton from "@/components/EbayListingsSkeleton";

export const revalidate = 604800;

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

function splitTitleEmphasis(name: string): { main: string; em: string | null } {
  const match = name.match(
    /^(.+?)\s+((?:Mark|Mk\.?)\s+[IVX]{1,5}|[IVX]{2,5}|II|III|IV|V|VI|VII|VIII|[αβ])$/,
  );
  if (match) return { main: match[1].trim(), em: match[2].trim() };
  return { main: name, em: null };
}

function formatCoverage(coverage: string | null) {
  if (!coverage) return null;
  if (coverage === "aps-c") return "APS-C";
  if (coverage === "full-frame") return "Full frame";
  if (coverage === "micro-four-thirds") return "Micro 4/3";
  if (coverage === "medium-format") return "Medium format";
  return coverage;
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

  if (lens.mergedIntoId) {
    const [target] = await db
      .select({ slug: lenses.slug })
      .from(lenses)
      .where(eq(lenses.id, lens.mergedIntoId))
      .limit(1);
    if (target) redirect(`/lenses/${target.slug}`);
  }

  const [currentUser, priceEstimate, priceHistoryRows, allSystems] = await Promise.all([
    getCurrentUser(),
    getEntityPriceEstimate("lens", lens.id),
    getEntityPriceHistory("lens", lens.id),
    db.select({ id: systems.id, name: systems.name }).from(systems).orderBy(systems.name),
  ]);

  const specs = (lens.specs ?? {}) as Record<string, string>;
  const mountFromSpecs =
    specs["Mount"] ?? specs["Mount and Flange focal distance"] ?? specs["Mount type"] ?? null;
  const cleanedMountFromSpecs = mountFromSpecs
    ? mountFromSpecs.split(";")[0].replace(/\[.*?\]/g, "").trim()
    : null;
  const apertureControl =
    specs["Aperture control"] ?? specs["Aperture Control"] ?? specs["Aperture ring"] ?? null;

  const ldbId = `LDB 06-${String(lens.id).padStart(5, "0")}`;
  const { main: titleMain, em: titleEm } = splitTitleEmphasis(lens.name);
  const views = lens.viewCount ?? 0;

  const focalValue: SpecValue = lens.focalLengthMin
    ? lens.focalLengthMin === lens.focalLengthMax
      ? (
          <>
            {lens.focalLengthMin}
            <SpecUnit>mm</SpecUnit>
          </>
        )
      : (
          <>
            {lens.focalLengthMin}–{lens.focalLengthMax}
            <SpecUnit>mm</SpecUnit>
          </>
        )
    : null;

  const opticalRows: [string, SpecValue][] = [
    ["Focal length", focalValue],
    ["Max aperture", lens.apertureMin ? `ƒ/${lens.apertureMin}` : null],
    [
      "Min aperture",
      lens.apertureMax && lens.apertureMax !== lens.apertureMin ? `ƒ/${lens.apertureMax}` : null,
    ],
    [
      "Lens construction",
      lens.lensElements && lens.lensGroups ? (
        <SpecMono>
          {lens.lensElements} el / {lens.lensGroups} grp
        </SpecMono>
      ) : null,
    ],
    [
      "Min focus distance",
      lens.minFocusDistanceM ? (
        <>
          {lens.minFocusDistanceM}
          <SpecUnit>m</SpecUnit>
        </>
      ) : null,
    ],
    [
      "Max magnification",
      lens.maxMagnification ? (
        <SpecMono>{formatMagnification(lens.maxMagnification)}</SpecMono>
      ) : null,
    ],
    [
      "35mm equivalent",
      specs["35mm equivalent focal length"] ?? specs["35mm equivalent focal length range"] ?? null,
    ],
    ["Autofocus", lens.hasAutofocus ? "Yes" : lens.hasAutofocus === false ? "No" : null],
    ["Stabilization", lens.hasStabilization ? "Yes" : lens.hasStabilization === false ? "—" : null],
    ["Teleconverters", specs["Teleconverters"] ?? null],
  ];

  const physicalRows: [string, SpecValue][] = [
    ["Mount", system?.name ?? cleanedMountFromSpecs],
    [
      "Weight",
      lens.weightG ? (
        <>
          {Math.round(lens.weightG)}
          <SpecUnit>g</SpecUnit>
        </>
      ) : null,
    ],
    [
      "Filter size",
      lens.filterSizeMm ? (
        <>
          {lens.filterSizeMm}
          <SpecUnit>mm</SpecUnit>
        </>
      ) : null,
    ],
    ["Diaphragm blades", lens.diaphragmBlades],
    ["Aperture control", apertureControl],
    ["Lens hood", specs["Lens hood"] ?? null],
  ];

  const historyRows: [string, SpecValue][] = [
    ["Announced", lens.yearIntroduced],
    ["Discontinued", lens.yearDiscontinued],
    ["Production status", lens.productionStatus],
    ["Era", lens.era],
  ];

  const description = lens.description ? formatDescription(lens.description) : [];

  const hasEstimate =
    priceEstimate != null &&
    (priceEstimate.priceAverageLow != null ||
      priceEstimate.priceAverageHigh != null ||
      priceEstimate.priceVeryGoodLow != null ||
      priceEstimate.priceVeryGoodHigh != null ||
      priceEstimate.priceMintLow != null ||
      priceEstimate.priceMintHigh != null);
  const hasMarketData = hasEstimate || priceHistoryRows.length > 0;
  const lensImages = getImages(
    "lenses",
    slug,
    (lens.images as Array<{ src: string; alt: string }>) || [],
  );
  const hasLeftContent = lensImages.length > 0 || description.length > 0 || hasMarketData;

  return (
    <PageTransition>
      <TopBar
        crumbs={[
          { label: "lenses", href: "/lenses" },
          ...(system
            ? [{ label: system.name.toLowerCase(), href: `/systems/${system.slug}` }]
            : []),
          { label: lens.name.toLowerCase() },
        ]}
      >
        <span className="mono hidden text-[var(--fg-faint)] sm:inline">{ldbId}</span>
        {views > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="live-dot" aria-hidden="true" />
            <span>{views.toLocaleString()} views</span>
          </span>
        )}
      </TopBar>

      <div
        className={`mx-auto w-full px-6 pb-24 pt-10 lg:px-10 ${
          hasLeftContent ? "max-w-[1200px]" : "max-w-[760px]"
        }`}
      >
        {/* Head */}
        <div className="mb-8 border-b border-border pb-7">
          <div className="mono mb-3.5 flex items-center justify-between gap-4 text-[11px] tracking-[0.04em] text-[var(--fg-dim)]">
            <span>
              <span className="text-[var(--fg-faint)]">{ldbId.slice(0, 3)}</span>{" "}
              {ldbId.slice(4)}
              {lens.createdAt && (
                <>
                  <span className="mx-2 text-[var(--fg-faint)]">·</span>
                  <span className="text-[var(--fg-faint)]">entry added</span>{" "}
                  {new Date(lens.createdAt).toISOString().slice(0, 10)}
                </>
              )}
            </span>
            {lens.productionStatus && (
              <span className="flex items-center gap-1.5 text-[var(--pos)]">
                <span className="live-dot" aria-hidden="true" />
                {lens.productionStatus.toLowerCase()}
              </span>
            )}
          </div>
          <h1 className="text-[clamp(28px,3.5vw,40px)] font-medium leading-[1.02] -tracking-[0.03em]">
            {titleMain}
            {titleEm && (
              <>
                {" "}
                <span className="hero-title-em">{titleEm}</span>
              </>
            )}
          </h1>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {lens.brand && (
              <Link
                href={`/lenses?brand=${encodeURIComponent(lens.brand)}`}
                className="ldb-badge is-brand hover:border-[var(--line-strong)]"
              >
                {lens.brand}
              </Link>
            )}
            {system && (
              <Link
                href={`/systems/${system.slug}`}
                className="ldb-badge is-system hover:border-[var(--line-strong)]"
              >
                {system.name}
              </Link>
            )}
            {lens.coverage && (
              <Link
                href={`/lenses?coverage=${encodeURIComponent(lens.coverage)}`}
                className="ldb-badge hover:border-[var(--line-strong)]"
              >
                {formatCoverage(lens.coverage)}
              </Link>
            )}
            {lens.lensType && (
              <Link
                href={`/lenses?lensType=${encodeURIComponent(lens.lensType)}`}
                className="ldb-badge is-type hover:border-[var(--line-strong)]"
              >
                {lens.lensType}
              </Link>
            )}
            {lens.era && (
              <Link
                href={`/lenses?era=${encodeURIComponent(lens.era)}`}
                className="ldb-badge is-era hover:border-[var(--line-strong)]"
              >
                {lens.era}
              </Link>
            )}
            {lens.productionStatus && (
              <Link
                href={`/lenses?productionStatus=${encodeURIComponent(lens.productionStatus)}`}
                className="ldb-badge is-status hover:border-[var(--line-strong)]"
              >
                {lens.productionStatus}
              </Link>
            )}
          </div>
        </div>

        {/* Detail grid — collapses to a single centered column when there's no left-hand content */}
        <div
          className={
            hasLeftContent
              ? "grid grid-cols-1 gap-10 lg:grid-cols-[1.2fr_1fr] lg:gap-12"
              : "flex flex-col gap-4"
          }
        >
          {/* LEFT */}
          {hasLeftContent && (
            <div className="min-w-0 space-y-8">
              {lensImages.length > 0 && <ImageGallery images={lensImages} />}

              {description.length > 0 && (
                <section>
                  <div className="ldb-section-head mb-4">
                    <h2>
                      Overview <span className="section-n">/ manufacturer copy</span>
                    </h2>
                  </div>
                  <div className="space-y-3.5 text-[14.5px] leading-[1.7] text-[var(--fg-mid)]">
                    {description.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                </section>
              )}

              {hasMarketData && (
                <section>
                  <div className="ldb-section-head mb-4">
                    <h2>
                      Used market <span className="section-n">/ trailing 12mo</span>
                    </h2>
                  </div>
                  <MarketBlock estimate={priceEstimate ?? null} history={priceHistoryRows} />
                </section>
              )}

              <Suspense fallback={<EbayListingsSkeleton />}>
                <EbayListings query={lens.name} entityType="lens" entitySlug={lens.slug} />
              </Suspense>
            </div>
          )}

          {/* RIGHT */}
          <div className="min-w-0 space-y-4">
            <RatingDisplay
              lensId={lens.id}
              averageRating={lens.averageRating}
              ratingCount={lens.ratingCount}
              label="community rating"
            />

            <AtAGlance
              apertureMin={lens.apertureMin}
              apertureMax={lens.apertureMax}
              focalLengthMin={lens.focalLengthMin}
              focalLengthMax={lens.focalLengthMax}
              weightG={lens.weightG}
              filterSizeMm={lens.filterSizeMm}
              diaphragmBlades={lens.diaphragmBlades}
              isPrime={lens.isPrime}
            />

            <SpecBlock title="Optical" rows={opticalRows} />
            <SpecBlock title="Physical" rows={physicalRows} />
            <SpecBlock title="History" rows={historyRows} />

            <div className="flex flex-wrap gap-2 pt-2">
              <Link
                href={`/compare?type=lens&item1=${encodeURIComponent(slug)}`}
                className="mono inline-flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-foreground px-3.5 py-2.5 text-[12px] text-background transition-opacity hover:opacity-90"
              >
                Compare this lens
              </Link>
              <FlagDuplicateButton
                entityType="lens"
                entityId={lens.id}
                entityName={lens.name}
                isLoggedIn={!!currentUser}
              />
            </div>

            <div className="pt-2">
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
                  {
                    name: "systemId",
                    label: "Mount System",
                    type: "select",
                    options: allSystems.map((s) => ({ value: s.id, label: s.name })),
                  },
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
            </div>

            {lens.url && /^https?:\/\//i.test(lens.url) && (
              <p className="mono pt-2 text-[11px] text-[var(--fg-faint)]">
                Source:{" "}
                <a
                  href={lens.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-[var(--line-strong)] underline-offset-2 hover:text-[var(--fg-mid)]"
                >
                  {new URL(lens.url).hostname.replace(/^www\./, "")}
                </a>
              </p>
            )}

            {process.env.NODE_ENV === "development" && Object.keys(specs).length > 0 && (
              <details className="group pt-2">
                <summary className="mono cursor-pointer text-[10px] uppercase tracking-[0.08em] text-[var(--fg-dim)] hover:text-foreground">
                  Raw specs JSON ({Object.keys(specs).length} fields)
                </summary>
                <pre className="mono mt-3 max-h-96 overflow-auto rounded-lg border border-border bg-[var(--surface-soft)] p-3 text-[11px] text-[var(--fg-mid)]">
                  {JSON.stringify(specs, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </div>

        {/* eBay listings — in single-column mode they live under the stack since there's no left column */}
        {!hasLeftContent && (
          <div className="mt-6">
            <Suspense fallback={<EbayListingsSkeleton />}>
              <EbayListings query={lens.name} entityType="lens" entitySlug={lens.slug} />
            </Suspense>
          </div>
        )}

        <ViewTracker type="lens" id={lens.id} />
      </div>
    </PageTransition>
  );
}
