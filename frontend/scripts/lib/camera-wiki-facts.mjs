/**
 * Read a camera's facts out of its camera-wiki article.
 *
 * The first pass at this only understood the labelled specification lists that
 * about a quarter of the articles use, and treated the rest as having nothing
 * to say. They had plenty — it was just in sentences:
 *
 *   "The Kodak DCS 200 was the second digital SLR released by Kodak, in 1992.
 *    It is based on the body of a 35mm film camera, the Nikon F801, but with a
 *    digital back fitted, including a 1524 x 1012 pixel (1.5 megapixel) sensor.
 *    The sensor dimensions of 14x9.3 mm result in a severe crop factor..."
 *
 * so the prose is mined too. What comes out is facts — a year, a focal length,
 * an aperture, a resolution — not sentences: figures are not copyrightable
 * where the writing around them is, which keeps this clear of the CC BY-SA
 * question that copying the prose itself would raise.
 *
 * Everything is deliberately conservative. A pattern that could plausibly match
 * something other than the camera in front of it is not used, and where an
 * article describes several models the first match wins, since that is the one
 * the page is named for. Extracting nothing is an acceptable outcome; extracting
 * the wrong camera's aperture is not.
 */

/** Wiki markup to plain prose. */
export function toPlainText(wikitext) {
  return wikitext
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, " ")
    .replace(/<ref[^>]*\/>/gi, " ")
    .replace(/\{\{[^{}]*\}\}/g, " ")
    .replace(/\{\|[\s\S]*?\|\}/g, " ") // wiki tables
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/\[(?:https?:)\/\/\S+\s+([^\]]*)\]/g, "$1")
    .replace(/\[(?:https?:)\/\/\S+\]/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/'{2,}/g, "")
    .replace(/&times;/gi, "x")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    // Removing a footnote or template leaves a gap in front of the punctuation
    // it sat before, which shows up in anything built from this text.
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

/** The lead section, which is where an article states what the camera is. */
export function leadSection(wikitext) {
  const beforeHeading = wikitext.split(/\n=={1,}/)[0] ?? wikitext;
  return toPlainText(beforeHeading);
}

const YEAR = String.raw`(1[89]\d{2}|20[0-2]\d)`;

/**
 * Years of introduction and of the end of production.
 *
 * Only phrasings that actually say a camera was made or sold then are used. A
 * bare year in a sentence is not enough: articles casually mention when a rival
 * appeared or when a company was founded, and those would be read as this
 * camera's launch.
 */
export function extractYears(text) {
  let start = null;
  let end = null;

  const range = text.match(
    new RegExp(String.raw`\b(?:from|between|produced|made|sold|manufactured|dating from)\b[^.]{0,40}?${YEAR}\s*(?:to|until|-|–|—|and)\s*${YEAR}`, "i"),
  );
  if (range) {
    start = Number(range[1]);
    end = Number(range[2]);
  }

  if (start === null) {
    const single = text.match(
      new RegExp(String.raw`\b(?:introduced|launched|released|announced|appeared|produced|manufactured|made|marketed|sold|presented|came out)\b[^.]{0,40}?\b(?:in|from|since|during|around|about|circa|by|starting)\s+${YEAR}`, "i"),
    );
    if (single) start = Number(single[1]);
  }
  // "..., in 1992." — the comma-then-year form the DCS 200 uses.
  if (start === null) {
    const trailing = text.match(
      new RegExp(String.raw`\b(?:introduced|launched|released|announced|produced|made|marketed|sold)\b[^.]{0,60}?,\s*(?:in\s+)?${YEAR}`, "i"),
    );
    if (trailing) start = Number(trailing[1]);
  }

  if (start !== null && end !== null && end < start) end = null;

  // A decade is all many articles commit to ("made by Balda in the 1950s").
  // It is reported separately and never written into year_introduced, because
  // that column is an integer and would turn "some time in the fifties" into a
  // claim that the camera appeared in 1950.
  let decade = null;
  if (start === null) {
    const d = text.match(/\b(?:in|during|from|of)\s+the\s+(1[89]\d0)s\b/i);
    if (d) decade = `${d[1]}s`;
  }

  return { start, end, decade };
}

/**
 * The taking lens, as focal length and maximum aperture.
 *
 * Three spellings cover almost everything: "50 mm f/6.3", the continental
 * "1:2.8/50mm", and "f/3.5 105mm". A focal length outside 6-2000mm or an
 * aperture outside f/0.7-f/64 is rejected as a misread of something else.
 */
export function extractLens(text) {
  const patterns = [
    new RegExp(String.raw`(\d{1,4}(?:\.\d)?)\s*mm\s*(?:,\s*)?(?:f[/ .]|1:)\s*(\d{1,2}(?:\.\d{1,2})?)`, "i"),
    new RegExp(String.raw`(?:f[/ .]|1:)\s*(\d{1,2}(?:\.\d{1,2})?)\s*[/ ]\s*(\d{1,4}(?:\.\d)?)\s*(?:mm|cm)`, "i"),
  ];

  for (const [i, pattern] of patterns.entries()) {
    const m = text.match(pattern);
    if (!m) continue;
    let focal = Number(i === 0 ? m[1] : m[2]);
    const aperture = Number(i === 0 ? m[2] : m[1]);
    // "4.5cm" is 45mm; the continental form often uses centimetres.
    if (i === 1 && /cm/i.test(m[0])) focal *= 10;
    if (!(focal >= 6 && focal <= 2000)) continue;
    if (!(aperture >= 0.7 && aperture <= 64)) continue;
    return { focal, aperture };
  }
  return null;
}

/** Effective resolution, for the digital bodies. */
export function extractSensor(text) {
  const out = {};

  const mp = text.match(/([\d.]{1,5})\s*[- ]?megapixel/i);
  if (mp) {
    const value = Number(mp[1]);
    if (value > 0 && value < 500) out.megapixels = value;
  }

  const res = text.match(/(\d{3,5})\s*[x×]\s*(\d{3,5})\s*pixel/i);
  if (res) out.resolution = `${res[1]} x ${res[2]}`;

  const dims = text.match(/sensor[^.]{0,30}?(\d{1,2}(?:\.\d)?)\s*[x×]\s*(\d{1,2}(?:\.\d)?)\s*mm/i);
  if (dims) out.sensorSize = `${dims[1]} x ${dims[2]} mm`;

  return Object.keys(out).length ? out : null;
}

/** Body weight in grams, converting from ounces where that is what is given. */
export function extractWeight(text) {
  const grams = text.match(/\b(\d{2,4})\s*(?:g\b|gr\b|grams?\b)/i);
  if (grams) {
    const value = Number(grams[1]);
    if (value >= 40 && value <= 6000) return value;
  }
  const oz = text.match(/\b(\d{1,3}(?:\.\d)?)\s*(?:oz|ounces?)\b/i);
  if (oz) {
    const value = Math.round(Number(oz[1]) * 28.35);
    if (value >= 40 && value <= 6000) return value;
  }
  return null;
}

/**
 * The lens mount, matched against the names of systems we already have.
 *
 * Articles name a mount in prose ("with the Nikon F mount", "M42 screw mount"),
 * but only a mount the catalogue knows is any use, so the caller supplies the
 * list and nothing else is guessed at.
 */
export function extractMount(text, systemNames) {
  for (const name of systemNames) {
    // Word-boundary match on the system's own name followed by "mount", which
    // is specific enough to avoid matching a passing mention of the brand.
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(String.raw`\b${escaped}\s+(?:screw\s+|bayonet\s+)?mount\b`, "i").test(text)) {
      return name;
    }
  }
  return null;
}

/**
 * The shutter mechanism, which is what `cameras.shutter_type` holds — the
 * existing rows say "Focal-plane", not a range of speeds. The speeds are a
 * different fact and belong in specs.
 *
 * Leaf shutters are usually named rather than described: a camera "with a
 * Compur" or "a Prontor SVS" has a leaf shutter, and those trade names are more
 * common in the articles than the words "leaf shutter".
 */
export function extractShutterType(text) {
  if (/\bfocal[- ]plane\b/i.test(text)) return "Focal-plane";
  if (/\b(leaf|between[- ]the[- ]lens|inter[- ]lens)(?:[- ]type)?[, ]+(?:[a-z-]+\s+)?shutter\b/i.test(text)) {
    return "Leaf";
  }
  if (/\binter[- ]lens\b/i.test(text) && /\bleaf\b/i.test(text)) return "Leaf";
  if (/\b(Compur|Prontor|Copal|Seikosha|Synchro-Compur|Vario|Pronto|Citizen|Copal-?SV)\b/.test(text)) {
    return "Leaf";
  }
  if (/\brotary\s+shutter\b/i.test(text)) return "Rotary";
  if (/\bguillotine\s+shutter\b/i.test(text)) return "Guillotine";
  if (/\belectronic\s+shutter\b/i.test(text)) return "Electronic";
  return null;
}

/**
 * The film format, in the vocabulary the catalogue already uses — "35mm full
 * frame", "Medium format 6x6", "Half frame" — rather than the raw category text.
 * `cameras.sensor_size` holds this for film bodies, which is how the existing
 * rows record what a camera shoots.
 */
export function extractFormat(categories) {
  const joined = categories.join(" | ");

  if (/\bhalf[- ]frame\b/i.test(joined)) return "Half frame";
  if (/\bsubminiature\b/i.test(joined)) return "Subminiature";

  // A medium-format frame size, given as WxH somewhere in the type category.
  const medium = joined.match(/\b(\d(?:\.\d)?)\s*[x×]\s*(\d{1,2}(?:\.\d)?)\b/);
  if (medium) {
    const w = Number(medium[1]);
    const h = Number(medium[2]);
    if (w >= 3 && w <= 10 && h >= 3 && h <= 12) {
      // On 120 roll film the 6 is the film width, so the catalogue always
      // writes it first — "6x9", "6x7", and "6x4.5" for what camera-wiki calls
      // 4.5x6. A pair with no 6 in it keeps the order the source gave.
      const [a, b] = h === 6 && w !== 6 ? [h, w] : [w, h];
      return `Medium format ${a}x${b}`;
    }
  }

  const sheet = joined.match(/\b(\d{1,2})\s*[x×]\s*(\d{1,2})\s*(?:in|cm)\b/i);
  if (sheet) return `Sheet film ${sheet[1]}x${sheet[2]}`;

  if (/\b35mm\b/.test(joined)) return "35mm full frame";
  if (/\b110 film\b/.test(joined)) return "110 film";
  if (/\b126 film\b/.test(joined)) return "126 film";
  if (/\b127 film\b/.test(joined)) return "127 film";
  if (/\b120 film\b/.test(joined)) return "Medium format 120";
  if (/\b(620|616|828|122|130) film\b/.test(joined)) {
    return `${joined.match(/\b(620|616|828|122|130) film\b/)[1]} film`;
  }
  if (/\bplate\b/i.test(joined)) return "Plate";
  return null;
}

/** Shutter speed range, as the article writes it. */
export function extractShutter(text) {
  const range = text.match(/\b1\/(\d{1,4})\s*(?:to|-|–|—)\s*1\/(\d{1,4})\s*(?:sec|second)?/i);
  if (range) return `1/${range[1]} - 1/${range[2]}`;
  const single = text.match(/\bshutter[^.]{0,60}?\b1\/(\d{1,4})\s*(?:sec|second)/i);
  if (single) return `1/${single[1]}`;
  return null;
}

/** The film a camera takes, from its categories rather than its prose. */
export function extractFilm(categories) {
  for (const category of categories) {
    const m = category.match(/\b(\d{3}) film\b/);
    if (m) return `${m[1]} film`;
    if (/\b35mm\b/.test(category)) return "35mm film";
  }
  return null;
}

/** Where it was made, from the country categories camera-wiki uses. */
const COUNTRIES = new Map([
  ["usa", "USA"], ["japan", "Japan"], ["japanese", "Japan"], ["germany", "Germany"],
  ["german", "Germany"], ["ussr", "USSR"], ["soviet", "USSR"], ["uk", "UK"],
  ["british", "UK"], ["england", "UK"], ["france", "France"], ["french", "France"],
  ["italy", "Italy"], ["italian", "Italy"], ["china", "China"], ["chinese", "China"],
  ["austria", "Austria"], ["switzerland", "Switzerland"], ["sweden", "Sweden"],
  ["denmark", "Denmark"], ["netherlands", "Netherlands"], ["hungary", "Hungary"],
  ["czech", "Czechoslovakia"], ["poland", "Poland"], ["spain", "Spain"],
  ["korea", "Korea"], ["taiwan", "Taiwan"], ["hong kong", "Hong Kong"],
  ["east germany", "East Germany"], ["gdr", "East Germany"],
]);

export function extractCountry(categories) {
  for (const category of categories) {
    const hit = COUNTRIES.get(category.trim().toLowerCase());
    if (hit) return hit;
  }
  // Type categories lead with the nationality: "Japanese 35mm SLR".
  for (const category of categories) {
    const first = category.split(/\s+/)[0]?.toLowerCase();
    const hit = first ? COUNTRIES.get(first) : null;
    if (hit) return hit;
  }
  return null;
}

/**
 * A description in this file's words, assembled from what was actually found.
 *
 * Deliberately plain and formulaic: it exists so a page states what the camera
 * is, and every clause is a fact from the article. Nothing is written unless
 * there is something beyond the name to say, because "The Argus AA is a camera"
 * is not worth a paragraph.
 */
/** "SLR" and "TLR" are acronyms and stay upper case; "Folding" does not. */
export function readableBodyType(bodyType) {
  if (!bodyType) return "camera";
  // Body types arrive as single words ("Folding"), as acronyms ("SLR", "DSLR")
  // and as phrases mixing the two ("Compact SLR", "Pseudo TLR"), so each word
  // is judged on its own rather than the whole string.
  // Split on hyphens as well as spaces, or "SLR-style mirrorless" comes back as
  // "slr-style mirrorless" — the acronym is only part of the word.
  return bodyType
    .split(/(\s+|-)/)
    .map((part) => (/^(d?slr|tlr|evf|aps)$/i.test(part) ? part.toUpperCase() : part.toLowerCase()))
    .join("");
}

/**
 * "a" or "an", decided by how the following word is said rather than how it is
 * spelled. The word after the article is whichever comes first — the format or
 * the body type — so this cannot be settled from the body type alone: "an SLR"
 * is right, but "an 35mm SLR camera" is not.
 */
export function indefiniteArticle(word) {
  const clean = word.replace(/[^A-Za-z0-9]/g, "");
  if (!clean) return "a";
  // Numbers said with a leading vowel: eight, eleven, eighteen, eighty.
  if (/^\d/.test(clean)) return /^(8|11|18|80|81|82|83|84|85|86|87|88|89)/.test(clean) ? "an" : "a";
  // An acronym is spelled out, and F, H, L, M, N, R, S and X all start with a
  // vowel sound when they are.
  // Spelled out, these letters all begin with a vowel sound: ay, ee, ef,
  // aitch, eye, el, em, en, oh, ar, ess, ex.
  if (/^[A-Z]{2,}$/.test(clean)) return /^[AEFHILMNORSX]/.test(clean) ? "an" : "a";
  return /^[aeiou]/i.test(clean) ? "an" : "a";
}

export function composeDescription({ name, maker, bodyType, film, country, years, lens, sensor, shutter, weight, system }) {
  const kind = readableBodyType(bodyType);

  const words = [];
  // The format is stored the way the specs panel wants it ("35mm full frame",
  // "Medium format 6x6"); a sentence wants it shorter and lower case.
  if (film) {
    const spoken = film
      .replace(/ film$/, "")
      .replace(/^35mm full frame$/i, "35mm")
      .replace(/^Medium format 120$/i, "120 roll film")
      .replace(/^Medium format /i, "medium format ")
      .replace(/^Sheet film /i, "sheet film ")
      .replace(/^Half frame$/i, "half frame")
      // "a Full frame camera" reads as a proper noun it is not; "Four Thirds"
      // and "APS-C" genuinely are names and keep their capitals.
      .replace(/^Full frame$/i, "full-frame");
    words.push(spoken);
  }
  words.push(kind === "camera" ? "camera" : `${kind} camera`);

  // Only the first word decides the article, not the whole phrase: "SLR camera"
  // as a unit is neither an acronym nor vowel-led, and reads as "a SLR camera".
  const firstWord = words[0].split(/\s+/)[0];
  const opening = [`The ${name} is ${indefiniteArticle(firstWord)}`, ...words];
  if (maker && !name.toLowerCase().startsWith(maker.toLowerCase())) opening.push(`made by ${maker}`);
  if (country) opening.push(`from ${country}`);

  let first = opening.join(" ");
  if (years.start && years.end) first += `, produced from ${years.start} to ${years.end}`;
  else if (years.start) first += `, introduced in ${years.start}`;
  first += ".";

  const details = [];
  if (lens) details.push(`It has a ${lens.focal}mm f/${lens.aperture} lens`);
  if (sensor?.megapixels) {
    // Some rows store the resolution with the megapixel count appended
    // ("5184 x 3456 - 18 MP"); saying both makes the sentence repeat itself.
    const pixels = sensor.resolution
      ? String(sensor.resolution).replace(/\s*[-–]\s*[\d.]+\s*MP\s*$/i, "").trim()
      : null;
    details.push(
      `${details.length ? "and records" : "It records"} ${sensor.megapixels} megapixels${pixels ? ` (${pixels})` : ""}`,
    );
  }
  if (!lens && !sensor?.megapixels && shutter) details.push(`Its shutter runs ${shutter} sec`);
  // The mount is the fact that connects a body to the lenses on this site, so
  // it is worth a clause of its own wherever it is known.
  if (system) details.push(`${details.length ? "and takes" : "It takes"} ${system} mount lenses`);
  if (!details.length && weight) details.push(`It weighs ${weight} g`);

  const second = details.length ? `${details.join(", ")}.` : "";
  const text = [first, second].filter(Boolean).join(" ");

  // Only worth storing if it says something past the name and the body type.
  const informative = years.start || lens || sensor?.megapixels || maker || country || system;
  return informative ? text : null;
}
