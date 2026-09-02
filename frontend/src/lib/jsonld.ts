import {
  SITE_NAME,
  SITE_URL,
  formatFocalLength,
  opticalConstruction,
} from "@/lib/seo";

type Json = Record<string, unknown>;

/** Drop null/undefined/empty entries so we never emit a half-filled node. */
function compact(obj: Json): Json {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => {
      if (v == null) return false;
      if (Array.isArray(v)) return v.length > 0;
      return true;
    }),
  );
}

function property(name: string, value: unknown, extra: Json = {}): Json | null {
  if (value == null || value === "") return null;
  return { "@type": "PropertyValue", name, value, ...extra };
}

export function breadcrumbList(
  crumbs: { name: string; path?: string }[],
  id: string,
): Json {
  return {
    "@type": "BreadcrumbList",
    "@id": id,
    itemListElement: crumbs.map((c, i) =>
      compact({
        "@type": "ListItem",
        position: i + 1,
        name: c.name,
        item: c.path ? `${SITE_URL}${c.path}` : undefined,
      }),
    ),
  };
}

type LensNode = {
  name: string;
  slug: string;
  brand: string | null;
  description: string;
  images: string[];
  focalLengthMin: number | null;
  focalLengthMax: number | null;
  apertureMin: number | null;
  apertureMax: number | null;
  weightG: number | null;
  filterSizeMm: number | null;
  minFocusDistanceM: number | null;
  lensElements: number | null;
  lensGroups: number | null;
  diaphragmBlades: number | null;
  hasAutofocus: boolean | null;
  hasStabilization: boolean | null;
  coverage: string | null;
  productionStatus: string | null;
  yearIntroduced: number | null;
  averageRating: number | null;
  ratingCount: number | null;
  systemNames: string[];
};

/**
 * Product + WebPage + BreadcrumbList for a lens.
 *
 * Deliberately omits `offers`: our prices are an estimate derived from past
 * eBay sales, not an offer this page makes, so they go in `additionalProperty`
 * instead. `bestRating` is spelled out because our scale is 1-10, not 5.
 */
export function lensJsonLd(
  lens: LensNode,
  priceRange: { low: number; high: number; currency: string } | null,
  crumbs: { name: string; path?: string }[],
): Json {
  const page = `${SITE_URL}/lenses/${lens.slug}`;
  const focal = formatFocalLength(lens.focalLengthMin, lens.focalLengthMax);

  const product = compact({
    "@type": "Product",
    "@id": `${page}#product`,
    name: lens.name,
    url: page,
    sku: lens.slug,
    description: lens.description,
    image: lens.images,
    brand: lens.brand ? { "@type": "Brand", name: lens.brand } : undefined,
    category: "Camera Lenses",
    productionDate: lens.yearIntroduced ? String(lens.yearIntroduced) : undefined,
    weight: lens.weightG
      ? { "@type": "QuantitativeValue", value: lens.weightG, unitCode: "GRM" }
      : undefined,
    additionalProperty: [
      property("Focal length", focal),
      property("Maximum aperture", lens.apertureMin ? `f/${lens.apertureMin}` : null),
      property("Minimum aperture", lens.apertureMax ? `f/${lens.apertureMax}` : null),
      property("Lens mount", lens.systemNames.length ? lens.systemNames.join("; ") : null),
      property("Image coverage", lens.coverage),
      property(
        "Optical construction",
        opticalConstruction(lens.lensElements, lens.lensGroups),
      ),
      property("Diaphragm blades", lens.diaphragmBlades),
      property("Minimum focus distance", lens.minFocusDistanceM, { unitCode: "MTR" }),
      property("Filter thread", lens.filterSizeMm, { unitCode: "MMT" }),
      property("Autofocus", lens.hasAutofocus === true ? "Yes" : null),
      property("Image stabilization", lens.hasStabilization === true ? "Yes" : null),
      property("Production status", lens.productionStatus),
      property(
        "Typical used price (recent eBay sales)",
        priceRange
          ? `${priceRange.currency} ${priceRange.low}–${priceRange.high}`
          : null,
      ),
    ].filter(Boolean),
    aggregateRating:
      lens.averageRating && (lens.ratingCount ?? 0) > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: Number(lens.averageRating.toFixed(2)),
            bestRating: 10,
            worstRating: 1,
            ratingCount: lens.ratingCount,
          }
        : undefined,
  });

  return {
    "@context": "https://schema.org",
    "@graph": [
      product,
      compact({
        "@type": "WebPage",
        "@id": `${page}#webpage`,
        url: page,
        name: lens.name,
        isPartOf: { "@id": `${SITE_URL}/#website` },
        breadcrumb: { "@id": `${page}#breadcrumb` },
        mainEntity: { "@id": `${page}#product` },
      }),
      breadcrumbList(crumbs, `${page}#breadcrumb`),
    ],
  };
}

type CameraNode = {
  name: string;
  slug: string;
  alias: string | null;
  description: string;
  images: string[];
  sensorType: string | null;
  sensorSize: string | null;
  megapixels: number | null;
  bodyType: string | null;
  weightG: number | null;
  yearIntroduced: number | null;
  averageRating: number | null;
  ratingCount: number | null;
  systemName: string | null;
  brand: string | null;
};

export function cameraJsonLd(
  camera: CameraNode,
  crumbs: { name: string; path?: string }[],
): Json {
  const page = `${SITE_URL}/cameras/${camera.slug}`;

  const product = compact({
    "@type": "Product",
    "@id": `${page}#product`,
    name: camera.name,
    alternateName: camera.alias ?? undefined,
    url: page,
    sku: camera.slug,
    description: camera.description,
    image: camera.images,
    brand: camera.brand ? { "@type": "Brand", name: camera.brand } : undefined,
    category: "Cameras",
    productionDate: camera.yearIntroduced ? String(camera.yearIntroduced) : undefined,
    weight: camera.weightG
      ? { "@type": "QuantitativeValue", value: camera.weightG, unitCode: "GRM" }
      : undefined,
    additionalProperty: [
      property("Lens mount", camera.systemName),
      property("Sensor type", camera.sensorType),
      property("Sensor size", camera.sensorSize),
      property("Effective resolution", camera.megapixels, { unitText: "MP" }),
      property("Body type", camera.bodyType),
    ].filter(Boolean),
    aggregateRating:
      camera.averageRating && (camera.ratingCount ?? 0) > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: Number(camera.averageRating.toFixed(2)),
            bestRating: 10,
            worstRating: 1,
            ratingCount: camera.ratingCount,
          }
        : undefined,
  });

  return {
    "@context": "https://schema.org",
    "@graph": [
      product,
      compact({
        "@type": "WebPage",
        "@id": `${page}#webpage`,
        url: page,
        name: camera.name,
        isPartOf: { "@id": `${SITE_URL}/#website` },
        breadcrumb: { "@id": `${page}#breadcrumb` },
        mainEntity: { "@id": `${page}#product` },
      }),
      breadcrumbList(crumbs, `${page}#breadcrumb`),
    ],
  };
}

/** CollectionPage + ItemList for a hub (system, collection, series). */
export function hubJsonLd({
  path,
  name,
  description,
  items,
  crumbs,
}: {
  path: string;
  name: string;
  description: string | null;
  items: { name: string; path: string }[];
  crumbs: { name: string; path?: string }[];
}): Json {
  const page = `${SITE_URL}${path}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      compact({
        "@type": "CollectionPage",
        "@id": `${page}#page`,
        url: page,
        name,
        description: description ?? undefined,
        isPartOf: { "@id": `${SITE_URL}/#website` },
        breadcrumb: { "@id": `${page}#breadcrumb` },
        mainEntity: {
          "@type": "ItemList",
          name,
          numberOfItems: items.length,
          // Cap the emitted list: the page links them all anyway, and a
          // 500-item graph would dwarf the rest of the document.
          itemListElement: items.slice(0, 100).map((item, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: item.name,
            url: `${SITE_URL}${item.path}`,
          })),
        },
      }),
      breadcrumbList(crumbs, `${page}#breadcrumb`),
    ],
  };
}

/** WebSite + SearchAction + Organization, emitted once on the home page. */
export function siteJsonLd(): Json {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        description:
          "An open reference for interchangeable camera lenses, camera bodies and lens mounts.",
        publisher: { "@id": `${SITE_URL}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/icon.svg`,
      },
    ],
  };
}
