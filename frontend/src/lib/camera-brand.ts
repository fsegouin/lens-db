/**
 * Working out a camera's brand from its name.
 *
 * Two signals, kept apart so each can be checked against the other: the brand
 * the name visibly starts with (prefixBrand, against brands the catalogue
 * already uses), and a model's answer for the same camera. resolveBrand
 * accepts a brand only when nothing contradicts it and sends the rest to a
 * person. scripts/assign-camera-brands.mjs runs both over the catalogue;
 * inferBrand is the unattended version, for the moment a camera is created.
 *
 * No imports, so the script can load this file directly.
 */

/** Brand spellings keyed by their folded form. */
export type BrandVocabulary = Map<string, string>;

export type BrandAnswer = { brand: string; confidence: "high" | "medium" | "low" };

export type BrandDecision = {
  brand: string | null;
  status: "agreed" | "model" | "manual" | "review";
  reason?: string;
};

/** Lower case with accents folded, so "Voigtlander" meets "Voigtländer". */
export function foldBrand(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

/**
 * One spelling per folded form. Brand columns hold a few case variants
 * ("Revuenon", "REVUENON"); the one on more rows wins.
 */
export function buildVocabulary(brandCounts: { brand: string; n: number }[]): BrandVocabulary {
  const byFold = new Map<string, { brand: string; n: number }>();
  for (const { brand, n } of brandCounts) {
    const key = foldBrand(brand);
    const held = byFold.get(key);
    if (!held || n > held.n) byFold.set(key, { brand: brand.trim(), n });
  }
  return new Map([...byFold].map(([key, { brand }]) => [key, brand]));
}

/** The vocabulary's spelling of a brand, or the brand as given when it is new. */
export function canonicalBrand(brand: string, vocabulary: BrandVocabulary): string {
  const trimmed = brand.trim();
  return vocabulary.get(foldBrand(trimmed)) ?? trimmed;
}

/**
 * The longest vocabulary brand the name starts with, in the vocabulary's
 * spelling. The match must end where a word does: "Fuji" does not claim
 * "Fujifilm X-T4", but "Minolta" claims "Minolta-35".
 */
export function prefixBrand(name: string, vocabulary: BrandVocabulary): string | null {
  const folded = foldBrand(name);
  let best: { key: string; brand: string } | null = null;
  for (const [key, brand] of vocabulary) {
    if (!folded.startsWith(key)) continue;
    const next = folded[key.length];
    if (next !== undefined && /[\p{L}\p{N}]/u.test(next)) continue;
    if (!best || key.length > best.key.length) best = { key, brand };
  }
  return best?.brand ?? null;
}

/**
 * The word a name leads with, for putting cameras of one family side by side
 * in review: "Zenit-E" and "Zenit 122" both lead with "zenit".
 */
export function leadWord(name: string): string {
  const first = foldBrand(name).split(/\s+/)[0] ?? "";
  const stem = first.split(/[-/]/)[0];
  return stem.length >= 3 ? stem : first;
}

/**
 * Decides one camera.
 *
 * status "agreed": the name's prefix and the model say the same brand.
 * status "model": the name starts with no known brand and the model is sure.
 * status "manual": a person chose it.
 * status "review": the two signals differ, the model is unsure, or it gave
 * no answer. `brand` then holds the best guess, for the reviewer to confirm.
 */
export function resolveBrand(
  signals: { prefix: string | null; answer?: BrandAnswer; manual?: string },
  vocabulary: BrandVocabulary,
): BrandDecision {
  const { prefix, answer, manual } = signals;
  if (manual) return { brand: canonicalBrand(manual, vocabulary), status: "manual" };
  if (!answer) return { brand: prefix, status: "review", reason: "no model answer" };

  const modelBrand = canonicalBrand(answer.brand, vocabulary);
  if (answer.confidence !== "high") {
    return { brand: modelBrand, status: "review", reason: `model ${answer.confidence}` };
  }
  if (!prefix) return { brand: modelBrand, status: "model" };
  if (foldBrand(prefix) === foldBrand(modelBrand)) return { brand: prefix, status: "agreed" };
  return { brand: modelBrand, status: "review", reason: "name and model differ" };
}

/**
 * A brand the model alone supplied, held by one camera and unknown to the
 * vocabulary, is where an invented maker would hide: nothing else in the
 * catalogue vouches for it. Those go to review as well.
 */
export function flagLoneBrands<T extends BrandDecision>(
  decisions: T[],
  vocabulary: BrandVocabulary,
): T[] {
  const holders = new Map<string, number>();
  for (const d of decisions) {
    if (d.status === "review" || !d.brand) continue;
    holders.set(d.brand, (holders.get(d.brand) ?? 0) + 1);
  }
  return decisions.map((d) =>
    d.status === "model" && d.brand && holders.get(d.brand) === 1 && !vocabulary.has(foldBrand(d.brand))
      ? { ...d, status: "review", reason: "brand used once" }
      : d,
  );
}

/** How many cameras must share a leading word before it vouches for a brand. */
const SIBLINGS_NEEDED = 3;

/**
 * The brand of a camera being created, read from the cameras already branded.
 *
 * First the brand of the cameras whose names open with the same two words,
 * so a factory name followed by the brand it was sold under ("Cosina
 * Voigtlander Bessa") takes the brand those cameras carry. Then the brand the
 * name visibly starts with. Failing that, the brand of its siblings: when
 * every camera leading with the same word carries one brand, a new one does
 * too, which is how "Fujifilm X-T6" becomes Fuji and "Rolleiflex" becomes
 * Rollei. A word only a camera or two lead with proves nothing ("Digital",
 * "Super"), and neither does one whose cameras disagree, so both return null
 * and the brand is left for a person. So does a name that goes on to name a
 * second brand no family vouches for: "Cosina Vivitar V2000" is a Vivitar
 * built by Cosina, "Baby Minolta" a Minolta among Baby Rolleiflexes.
 */
export function inferBrand(
  name: string,
  catalogue: { name: string; brand: string }[],
): string | null {
  const pair = leadPair(name);
  const family = pair ? siblingBrand(catalogue.filter((c) => leadPair(c.name) === pair)) : null;
  if (family) return family;

  const counts = new Map<string, number>();
  for (const c of catalogue) counts.set(c.brand, (counts.get(c.brand) ?? 0) + 1);
  const vocabulary = buildVocabulary([...counts].map(([brand, n]) => ({ brand, n })));
  const lead = leadWord(name);
  const brand =
    prefixBrand(name, vocabulary) ??
    siblingBrand(catalogue.filter((c) => leadWord(c.name) === lead));
  return brand && !namesAnotherBrand(name, brand, vocabulary) ? brand : null;
}

/** The first two words of a name, folded, or null for a one-word name. */
function leadPair(name: string): string | null {
  const words = foldBrand(name).split(/\s+/);
  return words.length > 1 ? `${words[0]} ${words[1]}` : null;
}

/** The one brand enough siblings share, or null when they are too few or disagree. */
function siblingBrand(siblings: { brand: string }[]): string | null {
  if (siblings.length < SIBLINGS_NEEDED) return null;
  const brands = new Set(siblings.map((c) => c.brand));
  return brands.size === 1 ? siblings[0].brand : null;
}

/**
 * Whether a word after the brand (or after the first word, when the name
 * does not start with the brand) names a different catalogue brand.
 */
function namesAnotherBrand(name: string, brand: string, vocabulary: BrandVocabulary): boolean {
  const own = foldBrand(brand);
  const folded = foldBrand(name);
  const skip = folded.startsWith(own) ? own.length : folded.split(/\s/)[0].length;
  const words = folded.slice(skip).trim().split(/\s+/);
  return words.some((_, i) => {
    const other = prefixBrand(words.slice(i).join(" "), vocabulary);
    return other !== null && foldBrand(other) !== own;
  });
}

/**
 * The decisions a run of the assignment script writes. A brand already on the
 * row was chosen by someone, on the admin form or by an earlier run, so it is
 * replaced only by a person's choice or for a camera the run was told to ask
 * about again; every other decision fills an empty brand only.
 */
export function brandWrites(
  decisions: (BrandDecision & { id: number; name: string; current: string | null })[],
  reask: ReadonlySet<number>,
): { id: number; name: string; brand: string; before: string | null }[] {
  return decisions.flatMap((d) =>
    d.status !== "review" &&
    d.brand &&
    d.brand !== d.current &&
    (d.current == null || d.status === "manual" || reask.has(d.id))
      ? [{ id: d.id, name: d.name, brand: d.brand, before: d.current }]
      : [],
  );
}
