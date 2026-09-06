/**
 * Repair of descriptions imported from lens-db.com, where every space that sat
 * on the boundary of an inline tag was deleted.
 *
 * The cause was in `scraper/parse_lenses.py`: `_extract_description` called
 * BeautifulSoup's `get_text(strip=True)`, which strips each text node and joins
 * them with the empty string. So markup like
 *
 *     Like the <a href="...">85mm f1.4</a> it is ideal
 *
 * yielded the nodes "Like the ", "85mm f1.4", " it is ideal", each stripped,
 * then concatenated: "Like the85mm f1.4it is ideal". Densely tagged sentences
 * lost more: "minimize <b>ghosting</b> and <b>flare</b> while" became
 * "minimizeghostingandflarewhile".
 *
 * The one useful property of that bug is that it only ever DELETED a space. It
 * never substituted, reordered or dropped a character. So repair is purely the
 * question of where a space belongs, and every rule below is written to fail
 * safe: when a boundary is ambiguous the text is left glued rather than split
 * on a guess. An unfixed join is a cosmetic blemish; a wrong split corrupts a
 * product name, and product names are the thing this site exists to get right.
 *
 * That trade-off is not hypothetical. The unguarded pair of regexes this module
 * replaced turned "Leica Camera Austria GmbH" into "Gmb H", "eBAND" into
 * "e BAND", "SteadyShot" into "Steady Shot" and the glass code "LaK9" into
 * "La K9", on every page view.
 *
 * Each rule keys on a transition that cannot occur inside an ordinary English
 * word, and each carries an allowlist built by counting what actually appears
 * in the corpus rather than from imagination:
 *
 *   sentence glue   "mount.Robust"    -> "mount. Robust"
 *   camel glue      "theSIGMA"        -> "the SIGMA"      (eBAND, GmbH exempt)
 *   digit -> word   "f1.4it"          -> "f1.4 it"        (85mm, 4x, 1980s exempt)
 *   word -> digit   "the85mm"         -> "the 85mm"       (f2.8, XF23mm exempt)
 *
 * Runs that lost every space, like "minimizeghostingandflarewhile", have no
 * case or digit transition to key on and are deliberately NOT touched here;
 * splitting those needs a dictionary and belongs in a separate reviewed pass.
 */

/** Tokens whose internal capital is part of the name, so must never be split. */
export const PROTECTED_TOKENS = new Set([
  "eBAND",
  "eVR",
  "eXpand",
  "eXtra",
  "eXtreme",
  "SteadyShot",
  "SnapBridge",
  "FiRIN",
  "FinePix",
  "FujiFilm",
  "PowerShot",
  "GmbH",
  "LoPinto",
  "DxO",
  "iAuto",
  "iTTL",
  "iA",
]);

/**
 * Lowercase runs that may legitimately follow a digit with no space. Single
 * letters are included only where the corpus shows them as units ("1.5m",
 * "4x", "500g", "1980s", "24p", "4k"); "i", "o", "c" and friends are left out
 * so that "f1.4it" splits rather than being read as a unit.
 */
export const UNITS_AFTER_DIGIT = new Set([
  "mm", "cm", "m", "nm", "um",
  "x", "g", "kg", "lb", "lbs", "oz",
  "in", "inch", "inches", "ft",
  "s", "ms", "sec", "min", "hr", "fps",
  "th", "st", "nd", "rd",
  "p", "k", "mp", "ev", "bit", "deg", "f",
]);

/**
 * Short words that may legitimately sit on the left of a restored space, e.g.
 * "aKowa" -> "a Kowa", "1.5mWith" -> "1.5m With", "35mmIII" -> "35mm III".
 *
 * A one or two letter run that is NOT in here is treated as the middle of a
 * name rather than a word, which is what keeps "CdS", "LaK9", "DeMille",
 * "eBAND" and the OCR damage in "coIor" from being split apart.
 */
const SHORT_WORDS = new Set([
  "a", "an", "as", "at", "be", "by", "do", "go", "he", "if", "in", "is", "it",
  "me", "my", "no", "of", "on", "or", "so", "to", "up", "us", "we",
  "m", "mm", "cm", "nm",
]);

/** Model names where a digit joins the word with no space, e.g. "X-Pro1". */
const PROTECTED_PATTERNS = [/^X-Pro\d/i, /^X-[A-Z]\d/];

/** Abbreviations where a following capital is normal, so no space is inserted. */
const ABBREVIATIONS = new Set([
  "no", "nos", "vol", "fig", "figs", "mt", "st", "dr", "mr", "mrs", "ms",
  "inc", "ltd", "co", "corp", "vs", "approx", "est", "etc", "ca", "cf",
  "ed", "eds", "pp", "al", "jr", "sr", "dept", "univ",
]);

const NBSP = /[   ]/g;
export const ZERO_WIDTH = /[​‌‍﻿]/g;

/** Fujifilm-style names ("XF23mmF1.4", "GF50-140mmF2.8") keep their "mmF" join. */
function isFujiStyleJoin(token: string, index: number): boolean {
  return (
    token[index] === "m" &&
    token[index - 1] === "m" &&
    /[Ff]/.test(token[index + 1] ?? "") &&
    /[0-9]/.test(token[index + 2] ?? "")
  );
}

function stripEdgePunctuation(token: string): string {
  return token.replace(/^[^\w]+/, "").replace(/[^\w]+$/, "");
}

/** True when the "." at `index` closes an initial ("J.R.") or an abbreviation. */
function isNonSentenceDot(token: string, index: number): boolean {
  const before = token.slice(0, index);
  // A single capital letter, i.e. an initial: "J.R.", "N.Y.", "U.S.A."
  if (/(?:^|[^A-Za-z])[A-Z]$/.test(before)) return true;
  const word = (before.match(/[A-Za-z]+$/) || [""])[0].toLowerCase();
  return ABBREVIATIONS.has(word);
}

/**
 * Whether the lowercase run ending at `index` is a whole word, and so may carry
 * a restored space after it. A run of three or more letters is taken as a word.
 * A shorter one has to be in SHORT_WORDS and must not follow a capital, since
 * the "a" inside "LaK9" is part of a glass code, not the article.
 */
function isWordBeforeBoundary(token: string, index: number): boolean {
  const run = (token.slice(0, index + 1).match(/[a-z]+$/) || [""])[0];
  if (run.length >= 3) return true;
  if (!SHORT_WORDS.has(run)) return false;
  return !/[A-Z]/.test(token[index - run.length] ?? "");
}

/**
 * Insert the spaces that tag-boundary stripping deleted inside a single
 * whitespace-delimited token.
 */
function repairToken(token: string): string {
  const bare = stripEdgePunctuation(token);
  if (PROTECTED_TOKENS.has(bare)) return token;
  if (PROTECTED_PATTERNS.some((re) => re.test(bare))) return token;

  let out = "";
  for (let i = 0; i < token.length; i++) {
    const ch = token[i];
    const next = token[i + 1];
    out += ch;
    if (next === undefined) break;

    // 1. Sentence glue: "mount.Robust", "impressive!Used"
    if (/[.!?]/.test(ch) && /[A-Z]/.test(next) && !isNonSentenceDot(token, i)) {
      out += " ";
      continue;
    }

    // 1b. Colon and semicolon glue: "fisheye lenses:a circular fisheye".
    // Requiring a letter after leaves ratios ("1:1"), apertures ("1:2.8") and
    // the "//" of a URL alone.
    if (/[:;]/.test(ch) && /[A-Za-z]/.test(next)) {
      out += " ";
      continue;
    }

    // 2. Camel glue: "theSIGMA", "designThe", "1.5mWith"
    if (
      /[a-z]/.test(ch) &&
      /[A-Z]/.test(next) &&
      !isFujiStyleJoin(token, i) &&
      isWordBeforeBoundary(token, i)
    ) {
      out += " ";
      continue;
    }

    // 3. Digit followed by a word rather than a unit: "f1.4it", "35mmlens"
    if (/[0-9]/.test(ch) && /[a-z]/.test(next)) {
      const run = (token.slice(i + 1).match(/^[a-z]+/) || [""])[0];
      if (!UNITS_AFTER_DIGIT.has(run)) {
        // Longest unit that prefixes the run, so "35mmlens" splits after "mm"
        // while "f1.4it" (no unit prefix) splits straight after the digit.
        let unit = "";
        for (let n = Math.min(run.length - 1, 6); n >= 1; n--) {
          const candidate = run.slice(0, n);
          if (UNITS_AFTER_DIGIT.has(candidate) && run.slice(n).length >= 2) {
            unit = candidate;
            break;
          }
        }
        if (unit) {
          out += unit + " ";
          i += unit.length;
        } else if (run.length >= 2) {
          out += " ";
        }
        continue;
      }
    }

    // 4. Word followed by a digit: "the85mm", "Features1", "Sigma35mm".
    // The whole-word test keeps "f2.8", "XF23mm" and "X-Pro1" intact.
    if (
      /[a-z]/.test(ch) &&
      /[0-9]/.test(next) &&
      isWordBeforeBoundary(token, i) &&
      !UNITS_AFTER_DIGIT.has((token.slice(0, i + 1).match(/[a-z]+$/) || [""])[0])
    ) {
      out += " ";
    }
  }
  return out;
}

/** Collapse the whitespace damage that survived the import, without reflowing. */
function normalizeWhitespace(text: string): string {
  return text
    .replace(NBSP, " ")
    .replace(ZERO_WIDTH, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Repair one description. Returns the text unchanged when nothing applies. */
export function repairDescription<T extends string | null | undefined>(text: T): T {
  if (typeof text !== "string" || text === "") return text;
  const repaired = normalizeWhitespace(text)
    .split(/(\s+)/)
    .map((part) => (/^\s+$/.test(part) ? part : repairToken(part)))
    .join("");
  // Splitting can introduce a double space next to punctuation we already had.
  return repaired.replace(/[ \t]{2,}/g, " ").trim() as T;
}

/** Space-free runs of glued words, which repairDescription deliberately leaves. */
export function findGluedRuns(text: string, minLength = 20): string[] {
  if (typeof text !== "string") return [];
  return text.match(new RegExp(`[a-z]{${minLength},}`, "g")) || [];
}
