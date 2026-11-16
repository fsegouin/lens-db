import { createHash } from "node:crypto";
import { foldBrand } from "./camera-brand.ts";
import { SITE_URL } from "./seo.ts";

/**
 * The two objects the partner API hands to a connected app, and the request
 * shapes it accepts. Search and the kit return the same objects, so an app
 * reads one format.
 *
 * Like the public API, the field sets are written out by hand: they are a
 * promise to someone else's code, and the version lives in the path. What a
 * member records about their own copy (condition, price paid, serial number,
 * notes) has no field here and never leaves the site.
 *
 * No database or framework in this file, so the shapes can be tested as
 * written. lib/partner-catalogue.ts fills them from the catalogue.
 */

export type EntityType = "camera" | "lens";
export type EntityRef = { type: EntityType; id: number };

export type PartnerLens = {
  type: "lens";
  id: number;
  name: string;
  brand: string | null;
  model: string;
  url: string;
  mounts: string[];
  yearIntroduced: number | null;
  focalLengthMm: { min: number; max: number } | null;
  maxAperture: { atMinFocal: number; atMaxFocal: number } | null;
};

export type PartnerCamera = {
  type: "camera";
  id: number;
  name: string;
  brand: string | null;
  model: string;
  url: string;
  mount: string | null;
  yearIntroduced: number | null;
  builtInLens: PartnerLens | null;
};

export type PartnerItem = PartnerLens | PartnerCamera;

export type LensRow = {
  id: number;
  name: string;
  slug: string;
  brand: string | null;
  yearIntroduced: number | null;
  focalLengthMin: number | null;
  focalLengthMax: number | null;
  apertureMin: number | null;
  apertureMax: number | null;
};

export type CameraRow = {
  id: number;
  name: string;
  slug: string;
  brand: string | null;
  yearIntroduced: number | null;
};

/**
 * The name without its brand, for a file that records make and model apart.
 * Only a brand the name opens with, as a word of its own, is taken off:
 * "Rolleiflex 2.8F" by Rollei and "Minolta-35" by Minolta are model names in
 * full, and a model is never left empty.
 */
export function modelName(name: string, brand: string | null): string {
  if (!brand) return name;
  const full = name.normalize("NFC");
  const lead = brand.normalize("NFC").trim();
  const rest = full.slice(lead.length);
  if (foldBrand(full.slice(0, lead.length)) !== foldBrand(lead) || !/^\s+\S/.test(rest)) {
    return name;
  }
  return rest.trim();
}

export function partnerLens(row: LensRow, mounts: string[]): PartnerLens {
  return {
    type: "lens",
    id: row.id,
    name: row.name,
    brand: row.brand,
    model: modelName(row.name, row.brand),
    url: `${SITE_URL}/lenses/${row.slug}`,
    mounts,
    yearIntroduced: row.yearIntroduced,
    focalLengthMm:
      row.focalLengthMin == null
        ? null
        : { min: row.focalLengthMin, max: row.focalLengthMax ?? row.focalLengthMin },
    // Both columns hold a wide-open value (lib/aperture.ts): apertureMin at
    // the short end of a zoom, apertureMax at the long end.
    maxAperture:
      row.apertureMin == null
        ? null
        : { atMinFocal: row.apertureMin, atMaxFocal: row.apertureMax ?? row.apertureMin },
  };
}

export function partnerCamera(
  row: CameraRow,
  mount: string | null,
  builtInLens: PartnerLens | null,
): PartnerCamera {
  return {
    type: "camera",
    id: row.id,
    name: row.name,
    brand: row.brand,
    model: modelName(row.name, row.brand),
    url: `${SITE_URL}/cameras/${row.slug}`,
    mount,
    yearIntroduced: row.yearIntroduced,
    builtInLens,
  };
}

export function refKey(ref: EntityRef): string {
  return `${ref.type}:${ref.id}`;
}

export const MAX_KIT_CHANGES = 200;

export type KitChanges = { add: EntityRef[]; remove: EntityRef[] };

/**
 * Reads the body of a kit change. Returns the changes with repeats folded, or
 * a sentence saying what is wrong with the request.
 */
export function parseKitChanges(body: unknown): KitChanges | string {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return "The body must be a JSON object with add and remove lists";
  }
  const { add = [], remove = [] } = body as { add?: unknown; remove?: unknown };
  if (!Array.isArray(add) || !Array.isArray(remove)) {
    return "add and remove must be lists";
  }
  if (add.length + remove.length > MAX_KIT_CHANGES) {
    return `A call carries at most ${MAX_KIT_CHANGES} entries`;
  }

  const read = (list: unknown[]): EntityRef[] | null => {
    const seen = new Map<string, EntityRef>();
    for (const entry of list) {
      const { type, id } = (entry ?? {}) as { type?: unknown; id?: unknown };
      if ((type !== "camera" && type !== "lens") || !Number.isSafeInteger(id) || (id as number) < 1) {
        return null;
      }
      const ref: EntityRef = { type, id: id as number };
      seen.set(refKey(ref), ref);
    }
    return [...seen.values()];
  };

  const added = read(add);
  const removed = read(remove);
  if (!added || !removed) {
    return 'Each entry must be { "type": "camera" or "lens", "id": a positive integer }';
  }
  return { add: added, remove: removed };
}

export const SEARCH_DEFAULT_LIMIT = 20;
export const SEARCH_MAX_LIMIT = 50;

export type SearchRequest = {
  q: string;
  type: EntityType | null;
  brand: string | null;
  limit: number;
};

/** Reads a search request, or returns a sentence saying what is wrong with it. */
export function parseSearchRequest(params: URLSearchParams): SearchRequest | string {
  const q = params.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 200) return "q must be 2 to 200 characters";

  const type = params.get("type");
  if (type !== null && type !== "camera" && type !== "lens") {
    return "type must be camera or lens";
  }

  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? SEARCH_DEFAULT_LIMIT : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > SEARCH_MAX_LIMIT) {
    return `limit must be 1 to ${SEARCH_MAX_LIMIT}`;
  }

  return { q, type, brand: params.get("brand")?.trim() || null, limit };
}

/** A strong ETag for a response body. */
export function etagOf(body: string): string {
  return `"${createHash("sha256").update(body).digest("base64url")}"`;
}

/**
 * Whether an If-None-Match header names this ETag. The comparison is the weak
 * one the header calls for, since a proxy that compresses a response may mark
 * its ETag weak on the way out.
 */
export function etagMatches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const bare = (value: string) => value.trim().replace(/^W\//, "");
  return ifNoneMatch.split(",").some((candidate) => {
    const value = bare(candidate);
    return value === "*" || value === bare(etag);
  });
}
