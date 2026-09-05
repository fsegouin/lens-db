/**
 * Wikimedia Commons image resolution for camera and lens models.
 *
 * Commons is the only large, free-licensed source of film camera photography,
 * but naive lookups fail in two specific ways that this module exists to avoid:
 *
 *   1. Full-text search is useless here. `list=search` for "Cosina C2" returns a
 *      photo of a BART train, and "Gamma IIIA" returns a physics paper. We only
 *      ever read files out of a *category*, and only after the category name
 *      passes a token check against the model name.
 *
 *   2. "Category:Taken with X" holds photographs *shot on* that camera, not
 *      photographs *of* it. Ingesting those fills a Canon AE-1 page with
 *      someone's holiday snaps. Every such category is rejected below.
 *
 * Resolution ladder, cheapest and most precise first:
 *   Wikidata P18 (image claim on the model's item) -> exact Commons category ->
 *   category search, best token match wins.
 *
 * Every returned candidate carries its licence, so the caller can store
 * attribution alongside the image instead of losing it.
 */

const UA = "lens-db-image-backfill/1.0 (https://thelensdb.com; florent@segouin.me)";
const API_COMMONS = "https://commons.wikimedia.org/w/api.php";
const API_WIKIDATA = "https://www.wikidata.org/w/api.php";

// Categories whose members are photos taken *with* the camera, or a person's
// upload stream, rather than photos *of* the camera.
const CATEGORY_BLOCKLIST = /^(taken with|photographs by|photos by|files by|images by|photographs taken|media by)/i;

// Licences we are allowed to serve. Anything else (fair use, non-commercial,
// no-derivatives) is dropped rather than guessed at.
const ALLOWED_LICENCE = /^(cc0|cc-by(-sa)?(-\d)?|pd|public\s?domain|attribution)/i;
const FORBIDDEN_LICENCE = /(fair\s?use|non-?free|non-?commercial|\bnc\b|\bnd\b|no\s?derivative)/i;

export const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Wikimedia sheds load with a 503 under sustained querying, and a bulk run is
// exactly that. Retrying matters more than it looks: without it a transient
// 503 is indistinguishable from "this camera has no photograph", and the run
// would write that verdict down for a camera that simply was not asked
// properly.
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

async function api(base, params, attempt = 0) {
  const url = new URL(base);
  for (const [k, v] of Object.entries({ format: "json", ...params })) url.searchParams.set(k, v);

  let resp;
  try {
    resp = await fetch(url, { headers: { "User-Agent": UA } });
  } catch (err) {
    // `fetch` throws rather than returning a status when the network itself is
    // gone: a dropped connection, DNS failure, a sleeping laptop. A whole
    // overnight run was lost to this, because only HTTP statuses were retried
    // and every camera after the outage was recorded as a hard failure.
    if (attempt < MAX_ATTEMPTS - 1) {
      await delay(1000 * 2 ** attempt);
      return api(base, params, attempt + 1);
    }
    throw err;
  }

  if (!resp.ok) {
    if (RETRY_STATUSES.has(resp.status) && attempt < MAX_ATTEMPTS - 1) {
      const retryAfter = Number(resp.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
      await delay(wait);
      return api(base, params, attempt + 1);
    }
    throw new Error(`${base} -> ${resp.status}`);
  }
  return resp.json();
}

/**
 * Fold a model name to comparable tokens: diacritics stripped, punctuation
 * dropped. "Voigtländer Bessa R" and "Voigtlander Bessa-R" both become
 * ["voigtlander", "bessa", "r"].
 */
export function tokenize(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

const squash = (name) => tokenize(name).join("");

/**
 * Does `candidate` plausibly name the same model as `query`?
 *
 * Two ways to qualify, because neither alone covers the real names:
 *
 *   a) every query token appears as a whole token in the candidate. Extra
 *      tokens are fine, so "Canonet QL17" matches "Canonet G-III QL17".
 *   b) the candidate's squashed form contains the query's squashed form, which
 *      is what rescues spacing differences: "Mamiya RB67" -> "Mamiya RB 67",
 *      "Canon A-1" -> "Canon A1 (front)".
 *
 * Substring matching per token is deliberately NOT one of them. A one-letter
 * token matches inside almost any string, which had "Salyut-S" resolving to a
 * Soyuz mission patch and a photo of a stadium entrance.
 */
export function nameMatches(query, candidate) {
  const q = tokenize(query);
  if (!q.length) return false;
  const c = tokenize(candidate);
  if (q.every((t) => c.includes(t))) return true;

  // Rule (b): the query must line up with a whole number of leading candidate
  // tokens. Plain substring containment is not enough, because "salyuts" is a
  // prefix of "salyutstadium" and that is how "Salyut-S" resolved to a photo of
  // a football stadium in Belgorod.
  const target = squash(query);
  let acc = "";
  for (const token of c) {
    acc += token;
    if (acc === target) return true;
    if (acc.length > target.length) break;
  }
  return false;
}

/**
 * Special editions ("Leica M6 TTL \"Test the Best\"") have no free imagery and
 * would otherwise silently resolve to the base model, putting the wrong camera
 * on the page. The caller skips these.
 */
export function isSpecialEdition(name) {
  return /["“”]/.test(name) || /\b(anniversary|edition|jubil|limited|commemorat)/i.test(name);
}

// Wikidata's "camera model" class. Every camera we spot-checked is an instance
// of it, and requiring it is what stops a label collision from resolving to
// something that merely shares a name.
const Q_CAMERA_MODEL = "Q20888659";

/** Wikidata camera-model item whose label matches, and which has a P18 image. */
async function fromWikidata(name) {
  const search = await api(API_WIKIDATA, {
    action: "wbsearchentities",
    search: name,
    language: "en",
    limit: 5,
  });
  for (const hit of search.search || []) {
    if (!nameMatches(name, hit.label || "")) continue;
    const entity = await api(API_WIKIDATA, {
      action: "wbgetentities",
      ids: hit.id,
      props: "claims",
    });
    const claims = entity.entities?.[hit.id]?.claims || {};
    const isCamera = (claims.P31 || []).some(
      (c) => c.mainsnak?.datavalue?.value?.id === Q_CAMERA_MODEL,
    );
    if (!isCamera) {
      await delay(120);
      continue;
    }
    const file = claims.P18?.[0]?.mainsnak?.datavalue?.value;
    if (file) return { file: `File:${file}`, via: `wikidata:${hit.id}` };
    await delay(120);
  }
  return null;
}

/** Commons category holding photos of this model, or null. */
async function findCategory(name) {
  const exact = `Category:${name}`;
  const direct = await api(API_COMMONS, {
    action: "query",
    titles: exact,
    prop: "categoryinfo",
  });
  const page = Object.values(direct.query?.pages || {})[0];
  if (page && page.missing === undefined && (page.categoryinfo?.files ?? 0) > 0) return exact;

  await delay(150);
  const search = await api(API_COMMONS, {
    action: "query",
    list: "search",
    srsearch: name,
    srnamespace: 14,
    srlimit: 8,
  });
  for (const hit of search.query?.search || []) {
    const bare = hit.title.replace(/^Category:/, "");
    if (CATEGORY_BLOCKLIST.test(bare)) continue;
    if (!nameMatches(name, bare)) continue;
    return hit.title;
  }
  return null;
}

/**
 * File titles inside a category (files only, no subcategory recursion).
 *
 * Deliberately generous: category members come back alphabetically, and one
 * photographer's bulk upload can fill the first 50 slots with a licence we
 * cannot use. Category:Nikon F5 opens with 40-odd GFDL-only files and would
 * otherwise look like a camera with no free imagery at all.
 */
async function categoryFiles(category, max = 200) {
  const d = await api(API_COMMONS, {
    action: "query",
    list: "categorymembers",
    cmtitle: category,
    cmtype: "file",
    cmlimit: Math.min(max, 500),
  });
  return (d.query?.categorymembers || []).map((m) => m.title);
}

/**
 * Last resort: search file names directly.
 *
 * This is the search that returns a BART train for "Cosina C2", so every hit is
 * put through the same strict name check as a category. That check is what
 * makes it safe now: "cosina" appears in neither the tokens nor the leading
 * squash of "Line scan photo of nine car BART C1 train", so the train is
 * dropped. It recovers cameras that have a photo on Commons but no category of
 * their own, which is common for the medium-format bodies.
 */
async function fromFileSearch(name) {
  const d = await api(API_COMMONS, {
    action: "query",
    list: "search",
    srsearch: name,
    srnamespace: 6,
    srlimit: 20,
  });
  return (d.query?.search || [])
    .map((hit) => hit.title)
    .filter((title) => nameMatches(name, title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "")));
}

const stripHtml = (html) =>
  String(html || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/** imageinfo + licence for a batch of file titles (Commons allows 50 per call). */
async function fileDetails(titles) {
  if (!titles.length) return [];
  const d = await api(API_COMMONS, {
    action: "query",
    titles: titles.slice(0, 50).join("|"),
    prop: "imageinfo",
    iiprop: "url|mime|size|extmetadata",
    // We downscale to 500px on upload anyway, so pull Commons' own 640px render
    // rather than a 12 MB original. Thumbnails of PNGs keep their alpha channel.
    iiurlwidth: 640,
  });
  const out = [];
  for (const page of Object.values(d.query?.pages || {})) {
    const ii = page.imageinfo?.[0];
    if (!ii) continue;
    const meta = ii.extmetadata || {};
    const licenseShort = stripHtml(meta.LicenseShortName?.value) || stripHtml(meta.License?.value);
    const artist = stripHtml(meta.Artist?.value);
    out.push({
      title: page.title,
      url: ii.url,
      thumburl: ii.thumburl,
      descriptionUrl: ii.descriptionurl,
      mime: ii.mime,
      width: ii.width,
      height: ii.height,
      license: licenseShort,
      licenseUrl: meta.LicenseUrl?.value || "",
      credit: artist,
      copyrighted: stripHtml(meta.Copyrighted?.value),
    });
  }
  return out;
}

/**
 * Free enough to serve? Public-domain files legitimately have no author.
 *
 * GFDL-only files are rejected on purpose. The licence is free, but it obliges
 * the reuser to ship the full licence text with the image, which a product
 * gallery is not going to do. Wikimedia deprecated GFDL-only uploads for the
 * same reason. Files dual-licensed GFDL + CC report the CC licence here and
 * pass normally.
 */
export function isUsable(file) {
  const lic = file.license || "";
  if (!lic) return false;
  if (FORBIDDEN_LICENCE.test(lic)) return false;
  const normalised = lic.replace(/\s+/g, "-");
  const free =
    ALLOWED_LICENCE.test(normalised) || /public domain/i.test(lic) || file.copyrighted === "False";
  if (!free) return false;

  // A CC BY or BY-SA file we cannot name the author of is unusable: the licence
  // is conditional on crediting them, and a handful of Commons files carry no
  // Artist field at all. Public domain and CC0 carry no such condition.
  const needsAuthor = /^(cc-?by|attribution)/i.test(normalised);
  if (needsAuthor && !file.credit) return false;

  return true;
}

/**
 * Rank candidates for a model page. Higher is better.
 *
 * Filename signal only; the pixel-level background check needs the bytes and
 * happens in the caller once, at download time.
 */
export function scoreFile(file, name) {
  let score = 0;
  const title = file.title.replace(/^File:/, "");

  if (nameMatches(name, title)) score += 40;
  // Wikidata's P18 is the hand-picked lead image for the model, so it beats an
  // arbitrary category member that happens to score the same.
  if (file.isLead) score += 25;
  // SVG line art and PNG are where any transparency lives.
  if (file.mime === "image/png") score += 12;
  if (file.mime === "image/svg+xml") score -= 100; // logos and diagrams, not the camera
  // Prefer something big enough to survive the 500px thumbnail.
  if (file.width >= 800) score += 8;
  if (file.width < 400) score -= 15;
  // Photographs *through* the camera, or of its output, are not of the camera.
  if (/\b(sample|test\s?shot|taken\s?with|photo\s?by|selfie|portrait)\b/i.test(title)) score -= 60;
  // Disassembly, repair and boxes rank below a clean body shot.
  if (/\b(repair|disassembl|broken|box|manual|advert|ad\b|logo|patent)\b/i.test(title)) score -= 25;
  // A base-model query matches its own special editions ("Leica M3" ->
  // "Leica M3 Gold"), which are the wrong camera to show on the base page.
  if (/\b(gold|titanium|anniversary|edition|limited|commemorative|jubil)/i.test(title)) score -= 30;
  // Likewise anything altered from the stock body: Commons has a NASA-modified
  // Nikon F3, an F5 carrying a Kodak DCS digital back, and a gold-plated
  // Exakta. Each is a photograph of something that is not the camera the page
  // is about. German terms appear because much of the Exakta and Praktica
  // material was uploaded from German-language sources.
  // No trailing boundary: the words appear inflected ("vergoldete") and with
  // digits attached ("DCS660"), neither of which \b would match.
  if (/\b(nasa|modifi|prototype|cutaway|custom|umbau|vergoldet)/i.test(title)) score -= 35;
  if (/\bdcs\d*/i.test(title) && !/\bkodak\b/i.test(name)) score -= 35;
  if (/\b(front|body|camera)\b/i.test(title)) score += 5;

  return score;
}

const ENOUGH_CANDIDATES = 12;

// Marques the DB spells out in full but Commons files under the short brand.
const PARENT_BRAND = [
  [/^Asahi Pentax\b/i, "Pentax"],
  [/^Honeywell Pentax\b/i, "Pentax"],
  [/^Zenza Bronica\b/i, "Bronica"],
];

/**
 * Fallback spellings to try when the DB name finds nothing.
 *
 * Two patterns account for most of it: a parent-brand prefix Commons drops
 * ("Asahi Pentax K1000" is filed as "Pentax K1000"), and a disambiguating
 * parenthetical Commons has no category for ("Pentax 6x7 (MLU)").
 *
 * Dropping the parenthetical means the two Agfa Ambi Silette types resolve to
 * the same base-model photographs. They are near-identical variants, so that is
 * better than no image, but it is a deliberate loosening rather than an exact
 * match.
 */
export function nameVariants(name) {
  const out = new Set();
  const noParen = name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  if (noParen && noParen !== name) out.add(noParen);
  for (const base of [name, noParen]) {
    for (const [re, replacement] of PARENT_BRAND) {
      if (re.test(base)) out.add(base.replace(re, replacement));
    }
  }
  return [...out];
}

/** One resolution attempt for a single spelling of the model name. */
async function resolveOne(name, limit) {
  const titles = [];
  let via = "";
  let leadTitle = null;

  const wd = await fromWikidata(name);
  if (wd) {
    titles.push(wd.file);
    leadTitle = wd.file;
    via = wd.via;
  }
  await delay(150);

  const category = await findCategory(name);
  if (category) {
    via = via || `category:${category}`;
    for (const t of await categoryFiles(category)) {
      if (!titles.includes(t)) titles.push(t);
    }
  }
  if (!titles.length) {
    await delay(150);
    const found = await fromFileSearch(name);
    if (found.length) {
      via = "filesearch";
      titles.push(...found);
    }
  }
  if (!titles.length) return { images: [], rejectedByLicence: 0, via: "" };

  // Details come 50 titles at a time; stop as soon as we have enough usable
  // ones rather than pulling metadata for a 200-file category.
  const usable = [];
  let rejectedByLicence = 0;
  for (let i = 0; i < titles.length && usable.length < ENOUGH_CANDIDATES; i += 50) {
    const batch = await fileDetails(titles.slice(i, i + 50));
    for (const f of batch) {
      if (isUsable(f)) usable.push({ ...f, isLead: f.title === leadTitle });
      else rejectedByLicence++;
    }
    if (i + 50 < titles.length) await delay(200);
  }

  const images = usable
    .map((f) => ({ ...f, score: scoreFile(f, name), via }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return { images, rejectedByLicence, via };
}

/**
 * Resolve usable, ranked Commons candidates for a model.
 *
 * `aliases` covers the regional renames: the DB's "Nikon N80" is filed on
 * Commons under its world-market name, "Nikon F80".
 *
 * Returns { images, rejectedByLicence, via } rather than throwing, so a camera
 * with nothing free can be told apart from one whose imagery we had to refuse.
 */
export async function resolveCommonsImages(name, { limit = 3, aliases = [] } = {}) {
  let last = { images: [], rejectedByLicence: 0, via: "" };
  for (const candidate of [name, ...aliases.filter(Boolean), ...nameVariants(name)]) {
    const result = await resolveOne(candidate, limit);
    if (result.images.length) return result;
    last = { ...result, rejectedByLicence: last.rejectedByLicence + result.rejectedByLicence };
    await delay(150);
  }
  return last;
}
