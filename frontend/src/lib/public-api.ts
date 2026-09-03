import { NextResponse } from "next/server";

/**
 * The shape of the public read API, kept apart from the internal one.
 *
 * The internal /api routes exist to feed this site's own screens and change
 * whenever a screen does. Anything published here is a promise: other people's
 * tools break when it moves, so the field sets are written out by hand rather
 * than spreading a database row, and the version lives in the path.
 *
 * What is deliberately absent is the used-price data. It is derived from eBay
 * completed listings, which this site may show but may not redistribute, so it
 * stays on the pages and out of the API.
 */

export const API_VERSION = "v1";

export const LICENCE = {
  facts:
    "Factual records (names, mounts, focal lengths, apertures, dates, flange distances) may be used freely with attribution to thelensdb.com.",
  excluded:
    "Used price data is not included: it is derived from eBay completed listings and cannot be redistributed.",
} as const;

/** Cross-origin and cache headers every public response carries. */
export function publicHeaders(maxAgeSeconds = 3600): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": `public, max-age=${maxAgeSeconds}, s-maxage=${maxAgeSeconds}, stale-while-revalidate=86400`,
    "X-Api-Version": API_VERSION,
  };
}

export function apiJson(body: unknown, init?: { status?: number; maxAge?: number }) {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: publicHeaders(init?.maxAge),
  });
}

export function apiError(message: string, status: number) {
  return apiJson({ error: message }, { status, maxAge: 60 });
}

export function apiOptions() {
  return new NextResponse(null, { status: 204, headers: publicHeaders() });
}

type LensRow = {
  slug: string;
  name: string;
  brand: string | null;
  lensType: string | null;
  focalLengthMin: number | null;
  focalLengthMax: number | null;
  apertureMin: number | null;
  apertureMax: number | null;
  weightG: number | null;
  filterSizeMm: number | null;
  minFocusDistanceM: number | null;
  maxMagnification: number | null;
  lensElements: number | null;
  lensGroups: number | null;
  diaphragmBlades: number | null;
  yearIntroduced: number | null;
  yearDiscontinued: number | null;
  isZoom: boolean | null;
  isMacro: boolean | null;
  isPrime: boolean | null;
  hasStabilization: boolean | null;
  hasAutofocus: boolean | null;
  coverage: string | null;
  era: string | null;
  productionStatus: string | null;
};

export function publicLens(row: LensRow, mounts: string[] = []) {
  return {
    id: row.slug,
    url: `https://thelensdb.com/lenses/${row.slug}`,
    name: row.name,
    brand: row.brand,
    type: row.lensType,
    mounts,
    focalLengthMm:
      row.focalLengthMin == null
        ? null
        : { min: row.focalLengthMin, max: row.focalLengthMax ?? row.focalLengthMin },
    // Named by what they mean rather than min and max: a smaller f-number is
    // the wider opening, so "maximum aperture" is the numeric minimum and the
    // pair reads backwards to anyone who has not met the convention.
    aperture:
      row.apertureMin == null
        ? null
        : {
            widest: row.apertureMin,
            narrowest:
              row.apertureMax != null && row.apertureMax !== row.apertureMin
                ? row.apertureMax
                : null,
          },
    coverage: row.coverage,
    opticalConstruction:
      row.lensElements == null && row.lensGroups == null
        ? null
        : { elements: row.lensElements, groups: row.lensGroups },
    diaphragmBlades: row.diaphragmBlades,
    minFocusDistanceM: row.minFocusDistanceM,
    maxMagnification: row.maxMagnification,
    filterSizeMm: row.filterSizeMm,
    weightG: row.weightG,
    isZoom: row.isZoom ?? false,
    isPrime: row.isPrime ?? false,
    isMacro: row.isMacro ?? false,
    hasAutofocus: row.hasAutofocus ?? false,
    hasStabilization: row.hasStabilization ?? false,
    yearIntroduced: row.yearIntroduced,
    yearDiscontinued: row.yearDiscontinued,
    era: row.era,
    productionStatus: row.productionStatus,
  };
}

type CameraRow = {
  slug: string;
  name: string;
  sensorType: string | null;
  sensorSize: string | null;
  megapixels: number | null;
  resolution: string | null;
  bodyType: string | null;
  shutterType: string | null;
  weightG: number | null;
  yearIntroduced: number | null;
};

export function publicCamera(row: CameraRow, mount: string | null = null) {
  return {
    id: row.slug,
    url: `https://thelensdb.com/cameras/${row.slug}`,
    name: row.name,
    mount,
    sensor:
      row.sensorType == null && row.sensorSize == null && row.megapixels == null
        ? null
        : {
            type: row.sensorType,
            size: row.sensorSize,
            megapixels: row.megapixels,
            resolution: row.resolution,
          },
    bodyType: row.bodyType,
    shutterType: row.shutterType,
    weightG: row.weightG,
    yearIntroduced: row.yearIntroduced,
  };
}

type MountRow = {
  slug: string;
  name: string;
  flangeDistanceMm: number | null;
  mountType: string | null;
};

export function publicMount(
  row: MountRow,
  counts?: { lenses: number; cameras: number },
) {
  return {
    id: row.slug,
    url: `https://thelensdb.com/systems/${row.slug}`,
    name: row.name,
    /** Flange focal distance in mm: the register, and the whole basis of adapting. */
    flangeDistanceMm: row.flangeDistanceMm,
    mountType: row.mountType,
    ...(counts ? { lensCount: counts.lenses, cameraCount: counts.cameras } : {}),
  };
}
