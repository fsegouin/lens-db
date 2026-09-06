/**
 * Shared matching helpers for the catalogue gap scanners
 * (scan-libraw-gaps.mjs, scan-camera-wiki-gaps.mjs).
 *
 * The scanners compare an external catalogue against our `cameras` table. Both
 * hit the same problem: the same body is written differently everywhere. LibRaw
 * reports the EXIF model code (`ILCE-7M3`), camera-wiki uses the article title
 * (`Sony Alpha 7 III`), and we store the marketing name (`Sony a7 III`). A plain
 * normalised-string compare calls all three different cameras, so a scanner
 * built on one reports hundreds of bodies we already have.
 *
 * The approach is to generate every name a body is plausibly filed under, on
 * both sides, and count it a match if any pair meets. Generating variants is
 * safer here than loosening the compare: a substring or token-overlap match on
 * names this short pairs "Canon EOS 5D" with "Canon EOS 5DS" and "Nikon D3" with
 * "Nikon D300", which is how you get a gap list nobody trusts.
 */

/** Brand spellings that differ between catalogues but mean the same maker. */
const BRAND_ALIASES = new Map([
  ["fujifilm", "fuji"],
  ["fujica", "fuji"],
  ["fujinon", "fuji"],
  ["konicaminolta", "minolta"],
  ["konica minolta", "minolta"],
  ["omsystem", "olympus"],
  ["om system", "olympus"],
  ["om digital solutions", "olympus"],
  ["carlzeiss", "zeiss"],
  ["carl zeiss", "zeiss"],
  ["zeissikon", "zeiss"],
  ["eastmankodak", "kodak"],
  ["eastman kodak", "kodak"],
  ["phaseone", "phase one"],
  ["hasselbladhasselblad", "hasselblad"],
  ["voigtlander", "voigtlaender"],
  ["voigtländer", "voigtlaender"],
]);

/**
 * Noise words that appear in one catalogue's name for a body and not another's.
 * Dropping them is only safe because they never distinguish two bodies from the
 * same maker: no maker ships both a "Lumix DC-GH5" and a plain "DC-GH5".
 */
const FILLER = [
  "lumix",
  "finepix",
  "coolpix",
  "cybershot",
  "cyber shot",
  "photosmart",
  "powershot",
  "digital camera",
  "digital",
  "camera",
  "professional",
  "series",
];

/** Latin-ish diacritics we fold so "Voigtländer" and "Voigtlander" agree. */
function foldDiacritics(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

function toRoman(n) {
  return ROMAN[n] ?? String(n);
}

/**
 * Strip a name to comparable form: lowercase, no diacritics, no punctuation,
 * no filler. "Panasonic Lumix DC-GH5" and "Panasonic DC-GH5" both land on
 * "panasonicdcgh5".
 */
export function normalize(name) {
  let s = foldDiacritics(String(name).toLowerCase());
  // "Mark II", "Mk II" and a bare "II" are the same generation. LibRaw spells it
  // out ("E-M10 Mark II") where we abbreviate ("OM-D E-M10 II"), so the word is
  // dropped rather than expanded — the numeral alone carries the generation.
  s = s.replace(/(?:\b|(?<=\d))m(?:ar)?k\.?\s*(?=[ivx]+\b|\d)/g, "");
  for (const word of FILLER) s = s.replace(new RegExp(`\\b${word}\\b`, "g"), " ");
  s = s.replace(/[^a-z0-9]/g, "");
  return s;
}

/**
 * Our names carry alternate model codes in parentheses, e.g.
 * "Sony Alpha a5000 (ILCE 5000)" and
 * "Panasonic Lumix DC-G90 (Lumix DC-G91 / Lumix DC-G95D)". Each alternative is
 * a name the body is sold under, so each becomes its own variant rather than
 * being dropped with the brackets.
 */
function splitParenthetical(name) {
  const out = [];
  const base = name.replace(/\s*\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (base) out.push(base);
  const brandGuess = base.split(/\s+/)[0] ?? "";

  /** Qualify a bare model code with the brand so it cannot collide across makers. */
  const push = (alt) => {
    const trimmed = alt.trim();
    if (!trimmed) return;
    out.push(trimmed);
    if (brandGuess && !trimmed.toLowerCase().startsWith(brandGuess.toLowerCase())) {
      out.push(`${brandGuess} ${trimmed}`);
    }
  };

  for (const match of name.matchAll(/\(([^)]*)\)/g)) {
    for (const part of match[1].split("/")) push(part);
  }

  // Every catalogue packs a body's alternative names into one string separated
  // by a slash: LibRaw writes "Panasonic DC-G90 / G95 / G91 / G99", camera-wiki
  // writes "Nikomat/Nikkormat FT2" and "Nikon D2H/D2X", we write
  // "(Lumix DC-G91 / Lumix DC-G95D)".
  //
  // The catch is that a slash also appears inside a single model name — the
  // Hasselblad 500C/M, the Nikon F3/T — where splitting would invent cameras
  // that never existed. What separates the two is the length of the shorter
  // side: an alternative name is a whole model designation, while the tail of a
  // hyphenated one is a letter or two. Requiring every part to be at least three
  // characters keeps "Nikomat/Nikkormat" apart and leaves "500C/M" whole.
  const slashParts = base.includes(" / ")
    ? base.split(" / ")
    : base.split("/").every((p) => p.trim().length >= 3)
      ? base.split("/")
      : [];

  if (slashParts.length > 1) {
    const parts = slashParts.map((p) => p.trim());
    for (const part of parts) push(part);
    // Later parts are usually bare codes ("G95"); the first part carries the
    // brand and series prefix, so lend it to them: "DC-G90" -> "DC-G95".
    const prefix = parts[0].match(/^(.*?)([A-Za-z]*[-]?)(\w*\d\w*)$/);
    if (prefix) {
      for (const part of parts.slice(1)) {
        if (/^\w*\d\w*$/.test(part)) push(`${prefix[1]}${prefix[2]}${part}`);
      }
    }
    // "Nikomat/Nikkormat FT2" puts the shared model number on the last part
    // only, so the earlier alternatives need it lent back to them the other way.
    const tail = parts.at(-1).match(/^(\S+)\s+(.+)$/);
    if (tail) {
      for (const part of parts.slice(0, -1)) {
        if (!/\s/.test(part)) push(`${part} ${tail[2]}`);
      }
    }
  }

  // Quoted commemorative editions ("Leica MP \"Ralph Gibson\"") are distinct
  // products, so the quotes stay; nothing to split.
  return out.length ? out : [name];
}

/**
 * Sony files digital bodies under an EXIF code that encodes the marketing name:
 * ILCE-7M3 is the a7 III, ILCE-7RM4 the a7R IV, ILCE-6400 the a6400. The
 * mapping is regular enough to derive rather than tabulate, which matters
 * because Sony ships several bodies a year.
 */
function sonyVariants(name) {
  if (!/\bsony\b/i.test(name)) return [];

  // Pull (number, R/S/C suffix, generation) out of whichever spelling is given:
  // the EXIF code ("ILCE-7RM4", "DSLR-A100", "SLT-A77V") or the marketing name
  // ("a7R IV"). Both then re-emit every spelling, so the pair meets whichever
  // side each catalogue happens to use.
  let digits;
  let suffix = "";
  let generation = 0;

  const code = name.match(/\b(?:ILCE|SLT|DSLR|NEX)-?A?([0-9]+)([RSC]?)(?:M([0-9]+))?\b/i);
  const marketing = name.match(/\bSony\s+(?:Alpha\s+)?a\s?([0-9]+)([RSC]?)\s*((?:I|V|X)+)?\b/i);

  if (code) {
    digits = code[1];
    suffix = (code[2] ?? "").toUpperCase();
    generation = code[3] ? Number(code[3]) : 0;
  } else if (marketing) {
    digits = marketing[1];
    suffix = (marketing[2] ?? "").toUpperCase();
    const romanIndex = marketing[3] ? ROMAN.indexOf(marketing[3].toUpperCase()) : -1;
    generation = romanIndex > 1 ? romanIndex : 0;
  } else {
    return [];
  }

  const roman = generation > 1 ? ` ${toRoman(generation)}` : "";
  const mark = generation > 1 ? `M${generation}` : "";
  return [
    `Sony a${digits}${suffix}${roman}`,
    `Sony Alpha a${digits}${suffix}${roman}`,
    `Sony ILCE-${digits}${suffix}${mark}`,
    `Sony Alpha ILCE-${digits}${suffix}${mark}`,
    `Sony SLT-A${digits}${suffix}`,
    `Sony Alpha SLT-A${digits}${suffix}`,
    `Sony DSLR-A${digits}${suffix}`,
    `Sony Alpha DSLR-A${digits}${suffix}`,
  ];
}

/*
 * Canon sells one body as a bare number (Europe), EOS Rebel (Americas) and EOS
 * Kiss (Japan) — the 800D, Rebel T7i and Kiss X9i are one camera. There is
 * deliberately no rule for that here. The three names share no tokens and the
 * numbers do not correspond by any pattern, so the mapping can only come from a
 * lookup table, and a guessed one would silently mispair bodies. It is not
 * needed for LibRaw, which packs all three into a single slash-separated name
 * that splitParenthetical already breaks apart. If a source turns up that gives
 * only the regional name, add the table then, from that source.
 */

/**
 * Olympus writes the OM-D and PEN lines with and without the range prefix
 * ("OM-D E-M1 Mark II" vs "E-M1MarkII"), and LibRaw always drops it.
 */
function olympusVariants(name) {
  const out = [];
  const stripped = name.replace(/\bOM-?D\s+/gi, " ").replace(/\bPEN\s+/gi, " ").replace(/\s+/g, " ").trim();
  if (stripped !== name) out.push(stripped);
  return out;
}

/**
 * Every name a body might reasonably be filed under, including the one given.
 */
export function nameVariants(name) {
  const seeds = splitParenthetical(String(name).trim());
  const out = new Set();
  for (const seed of seeds) {
    out.add(seed);
    for (const v of sonyVariants(seed)) out.add(v);
    for (const v of olympusVariants(seed)) out.add(v);
    // Brand alias swaps apply to whatever the above produced.
    for (const current of [...out]) {
      const lower = current.toLowerCase();
      for (const [from, to] of BRAND_ALIASES) {
        if (lower.startsWith(from)) out.add(to + current.slice(from.length));
      }
    }
  }
  return [...out];
}

/** Every normalised key a body should be indexed under. */
export function matchKeys(name) {
  const keys = new Set();
  for (const variant of nameVariants(name)) {
    const key = normalize(variant);
    if (key.length >= 3) keys.add(key);
  }
  return keys;
}

/**
 * Index our catalogue rows by every key they could be looked up under.
 * Returns a Map of key -> array of rows, so a lookup can report what it hit.
 */
export function buildIndex(rows, nameOf = (r) => r.name) {
  const index = new Map();
  for (const row of rows) {
    for (const key of matchKeys(nameOf(row))) {
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(row);
    }
  }
  return index;
}

/** Look a candidate name up in an index built by buildIndex. */
export function lookup(index, name) {
  for (const key of matchKeys(name)) {
    const hit = index.get(key);
    if (hit) return hit;
  }
  return null;
}
