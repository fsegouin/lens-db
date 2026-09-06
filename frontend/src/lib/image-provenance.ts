import type { ImageData } from "./image-types.ts";
import { licenceUrlFor } from "./image-licences.ts";

/**
 * Where an image came from and on what terms: the four attribution fields of
 * an `ImageData` entry, as an admin sets them on upload or edits them later.
 *
 * `credit` is the source's name (a person, "Nikon", "Wikimedia Commons"),
 * `sourceUrl` the page it was taken from. The gallery links the name to the
 * page and prints the licence beside it, which is what CC BY and CC BY-SA
 * require of us.
 */
export type ImageProvenance = Pick<ImageData, "credit" | "sourceUrl" | "license" | "licenseUrl">;

const PROVENANCE_KEYS = ["credit", "sourceUrl", "license", "licenseUrl"] as const;
export const PROVENANCE_MAX_LEN = 500;

type Result = { ok: true; value: ImageProvenance } | { ok: false; error: string };

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validate the provenance fields of a request body.
 *
 * A key that is absent or null is left out of the result, so callers can
 * apply it as "unchanged". An empty string is kept as an empty string, which
 * `applyProvenance` treats as "clear this field": the edit form sends every
 * field on every save, and blanking a credit has to be able to remove it.
 *
 * When the licence is one of the presets and no deed URL was given, the
 * preset's deed fills in, so the label and its link never drift apart.
 */
export function readProvenance(body: unknown): Result {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Body must be an object" };
  const input = body as Record<string, unknown>;
  const out: ImageProvenance = {};

  for (const key of PROVENANCE_KEYS) {
    const raw = input[key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== "string") return { ok: false, error: `${key} must be a string` };
    const value = raw.trim();
    if (value.length > PROVENANCE_MAX_LEN) return { ok: false, error: `${key} is too long` };
    if ((key === "sourceUrl" || key === "licenseUrl") && value && !isHttpUrl(value)) {
      return { ok: false, error: `${key} must be an http(s) URL` };
    }
    out[key] = value;
  }

  if (out.license && !out.licenseUrl) {
    const deed = licenceUrlFor(out.license);
    if (deed) out.licenseUrl = deed;
  }

  return { ok: true, value: out };
}

/**
 * Return `image` with the provenance applied. Fields the provenance does not
 * mention are untouched; fields it sets to "" are removed rather than stored
 * empty, so the gallery's `if (!image.credit)` checks keep working and the
 * JSON in the column stays as small as it was.
 */
export function applyProvenance(image: ImageData, provenance: ImageProvenance): ImageData {
  const next: ImageData = { ...image };
  for (const key of PROVENANCE_KEYS) {
    const value = provenance[key];
    if (value === undefined) continue;
    if (value === "") delete next[key];
    else next[key] = value;
  }
  return next;
}
