import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cameras, systems } from "@/db/schema";
import { getEntityPriceEstimate, getEntityPriceHistory } from "@/lib/prices";
import ViewTracker from "@/components/ViewTracker";
import ImageGallery from "@/components/ImageGallery";
import EditButton from "@/components/EditButton";
import FlagDuplicateButton from "@/components/FlagDuplicateButton";
import EbayListings from "@/components/EbayListings";
import EbayListingsSkeleton from "@/components/EbayListingsSkeleton";
import { getImages } from "@/lib/images";
import { formatDescription } from "@/lib/format-description";
import { PageTransition } from "@/components/page-transition";
import { TopBar } from "@/components/app-shell/top-bar";
import { SpecBlock, SpecUnit, type SpecValue } from "@/components/spec-block";
import { RatingDisplay } from "@/components/lens-detail/rating-display";
import { MarketBlock } from "@/components/market-block";
import { getCurrentUser } from "@/lib/user-auth";

export const revalidate = 604800;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const fullSlug = slug.join("/");
  const [result] = await db
    .select({ camera: cameras })
    .from(cameras)
    .where(eq(cameras.slug, fullSlug))
    .limit(1);
  return {
    title: result ? `${result.camera.name} | The Lens DB` : "Camera Not Found",
  };
}

function splitTitleEmphasis(name: string): { main: string; em: string | null } {
  const match = name.match(
    /^(.+?)\s+((?:Mark|Mk\.?)\s+[IVX]{1,5}|[IVX]{2,5}|II|III|IV|V|VI|VII|VIII|[αβ])$/,
  );
  if (match) return { main: match[1].trim(), em: match[2].trim() };
  return { main: name, em: null };
}

export default async function CameraDetailPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const fullSlug = slug.join("/");

  const [result] = await db
    .select({ camera: cameras, system: systems })
    .from(cameras)
    .leftJoin(systems, eq(cameras.systemId, systems.id))
    .where(eq(cameras.slug, fullSlug))
    .limit(1);

  if (!result) notFound();
  const { camera, system } = result;

  if (camera.mergedIntoId) {
    const [target] = await db
      .select({ slug: cameras.slug })
      .from(cameras)
      .where(eq(cameras.id, camera.mergedIntoId))
      .limit(1);
    if (target) redirect(`/cameras/${target.slug}`);
  }

  const specs = (camera.specs ?? {}) as Record<string, string>;

  const [currentUser, priceEstimate, priceHistoryRows, allSystems] = await Promise.all([
    getCurrentUser(),
    getEntityPriceEstimate("camera", camera.id),
    getEntityPriceHistory("camera", camera.id),
    db.select({ id: systems.id, name: systems.name }).from(systems).orderBy(systems.name),
  ]);

  const ldbId = `LDB 02-${String(camera.id).padStart(5, "0")}`;
  const { main: titleMain, em: titleEm } = splitTitleEmphasis(camera.name);
  const views = camera.viewCount ?? 0;

  const sensorRows: [string, SpecValue][] = [
    ["Type", specs["Type"]],
    ["Imaging sensor", camera.sensorType || specs["Imaging sensor"] || specs["Imaging plane"]],
    ["Sensor size", camera.sensorSize || specs["Maximum format"]],
    [
      "Megapixels",
      camera.megapixels ? (
        <>
          {camera.megapixels}
          <SpecUnit>MP</SpecUnit>
        </>
      ) : specs["Effective pixels"],
    ],
    ["Resolution", camera.resolution || specs["Max resolution"]],
    ["Crop factor", specs["Crop factor"]],
    ["ISO", specs["ISO"]],
    ["Stabilization", specs["Sensor-shift image stabilization"]],
  ];

  const bodyRows: [string, SpecValue][] = [
    ["Lens mount", specs["Lens mount"]],
    ["Shutter speeds", specs["Speeds"]],
    ["Exposure modes", specs["Exposure modes"]],
    ["Exposure metering", specs["Exposure metering"]],
    [
      "Screen",
      specs["Screen size"]
        ? `${specs["Screen size"]} (${specs["Screen dots"] || ""})`.replace(/ \(\)$/, "")
        : null,
    ],
    ["Articulated LCD", specs["Articulated LCD"]],
    ["Storage", specs["Storage types"]],
    ["USB", specs["USB"]],
    ["Dimensions", specs["Dimensions"]],
    [
      "Weight",
      camera.weightG ? (
        <>
          {Math.round(camera.weightG)}
          <SpecUnit>g</SpecUnit>
        </>
      ) : specs["Weight"],
    ],
    ["Format", specs["Format"]],
    ["GPS", specs["GPS"] && specs["GPS"] !== "None" ? specs["GPS"] : null],
  ];

  const historyRows: [string, SpecValue][] = [
    ["Year introduced", camera.yearIntroduced],
    ["Film type", specs["Film type"]],
    ["Model class", specs["Model"]],
    ["Body type", camera.bodyType],
  ];

  const description = camera.description ? formatDescription(camera.description) : [];

  const hasEstimate =
    priceEstimate != null &&
    (priceEstimate.priceAverageLow != null ||
      priceEstimate.priceAverageHigh != null ||
      priceEstimate.priceVeryGoodLow != null ||
      priceEstimate.priceVeryGoodHigh != null ||
      priceEstimate.priceMintLow != null ||
      priceEstimate.priceMintHigh != null);
  const hasMarketData = hasEstimate || priceHistoryRows.length > 0;
  const cameraImages = getImages(
    "cameras",
    fullSlug,
    (camera.images as Array<{ src: string; alt: string }>) || [],
  );
  const hasLeftContent = cameraImages.length > 0 || description.length > 0 || hasMarketData;

  return (
    <PageTransition>
      <TopBar
        crumbs={[
          { label: "cameras", href: "/cameras" },
          ...(system
            ? [{ label: system.name.toLowerCase(), href: `/systems/${system.slug}` }]
            : []),
          { label: camera.name.toLowerCase() },
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
              {(camera.yearIntroduced || camera.bodyType) && (
                <>
                  <span className="mx-2 text-[var(--fg-faint)]">·</span>
                  <span>
                    {[camera.yearIntroduced, camera.bodyType].filter(Boolean).join(" · ")}
                  </span>
                </>
              )}
            </span>
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
          {camera.alias && (
            <p className="mono mt-2 text-[11px] text-[var(--fg-dim)]">
              aka <span className="text-foreground">{camera.alias}</span>
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {system && (
              <Link
                href={`/systems/${system.slug}`}
                className="ldb-badge is-system hover:border-[var(--line-strong)]"
              >
                {system.name}
              </Link>
            )}
            {camera.bodyType && (
              <span className="ldb-badge is-type">{camera.bodyType}</span>
            )}
            {camera.sensorSize && (
              <span className="ldb-badge">{camera.sensorSize}</span>
            )}
            {camera.megapixels != null && (
              <span className="ldb-badge">{camera.megapixels} MP</span>
            )}
            {specs["Film type"] && (
              <span className="ldb-badge is-era">{specs["Film type"]}</span>
            )}
          </div>
        </div>

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
            {cameraImages.length > 0 && <ImageGallery images={cameraImages} />}

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
              <EbayListings query={camera.name} entityType="camera" entitySlug={camera.slug} />
            </Suspense>
          </div>
          )}

          {/* RIGHT */}
          <div className="min-w-0 space-y-4">
            <RatingDisplay
              cameraId={camera.id}
              averageRating={camera.averageRating}
              ratingCount={camera.ratingCount}
              label="community rating"
            />

            <SpecBlock title="Sensor &amp; imaging" rows={sensorRows} />
            <SpecBlock title="Body &amp; features" rows={bodyRows} />
            <SpecBlock title="History" rows={historyRows} />

            <div className="flex flex-wrap gap-2 pt-2">
              <Link
                href={`/compare?type=camera&item1=${encodeURIComponent(camera.slug)}`}
                className="mono inline-flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-foreground px-3.5 py-2.5 text-[12px] text-background transition-opacity hover:opacity-90"
              >
                Compare this camera
              </Link>
              <FlagDuplicateButton
                entityType="camera"
                entityId={camera.id}
                entityName={camera.name}
                isLoggedIn={!!currentUser}
              />
            </div>

            <div className="pt-2">
              <EditButton
                entityType="camera"
                entityId={camera.id}
                entitySlug={camera.slug}
                isLoggedIn={!!currentUser}
                currentValues={{
                  name: camera.name,
                  url: camera.url,
                  description: camera.description,
                  alias: camera.alias,
                  systemId: camera.systemId,
                  sensorType: camera.sensorType,
                  sensorSize: camera.sensorSize,
                  megapixels: camera.megapixels,
                  resolution: camera.resolution,
                  yearIntroduced: camera.yearIntroduced,
                  bodyType: camera.bodyType,
                  weightG: camera.weightG,
                }}
                fields={[
                  { name: "name", label: "Name", type: "text" },
                  { name: "alias", label: "Also known as", type: "text" },
                  { name: "description", label: "Description", type: "textarea" },
                  {
                    name: "systemId",
                    label: "Mount System",
                    type: "select",
                    options: allSystems.map((s) => ({ value: s.id, label: s.name })),
                  },
                  { name: "sensorType", label: "Sensor Type", type: "text" },
                  { name: "sensorSize", label: "Sensor Size", type: "text" },
                  { name: "megapixels", label: "Megapixels", type: "number" },
                  { name: "resolution", label: "Resolution", type: "text" },
                  { name: "yearIntroduced", label: "Year Introduced", type: "number" },
                  { name: "bodyType", label: "Body Type", type: "text" },
                  { name: "weightG", label: "Weight (g)", type: "number" },
                  { name: "url", label: "Source URL", type: "text" },
                ]}
              />
            </div>

            {camera.url && /^https?:\/\//i.test(camera.url) && (
              <p className="mono pt-2 text-[11px] text-[var(--fg-faint)]">
                Source:{" "}
                <a
                  href={camera.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-[var(--line-strong)] underline-offset-2 hover:text-[var(--fg-mid)]"
                >
                  {new URL(camera.url).hostname.replace(/^www\./, "")}
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

        {/* eBay listings — in single-column mode they render under the stack since there's no left column */}
        {!hasLeftContent && (
          <div className="mt-6">
            <Suspense fallback={<EbayListingsSkeleton />}>
              <EbayListings query={camera.name} entityType="camera" entitySlug={camera.slug} />
            </Suspense>
          </div>
        )}

        <ViewTracker type="camera" id={camera.id} />
      </div>
    </PageTransition>
  );
}
