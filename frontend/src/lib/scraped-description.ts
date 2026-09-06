import { repairDescription } from "./description-whitespace";

/**
 * Collection and series blurbs arrived from a scrape that flattened the source
 * page's furniture into the description text, and they were shown raw: on the
 * index cards, on the hub page as one paragraph, and in the page's meta
 * description. Both tables were filled by the same import and carry the same
 * damage, so both read through this.
 *
 * The damage is not one shape. A "QUICK JUMP TO:" index of mount systems.
 * An HTML table run together without its columns ("YearOrder No.Model
 * "Edition"..."). A specification list whose separators survived but whose
 * layout did not ("51C- Canon FD;55C- Contax/Yashica"). One collection is
 * 13,000 characters of this in a single paragraph, and several pages open
 * their search-result snippet mid-table.
 *
 * Naming each variant was the first attempt and it kept missing new ones, so
 * this works the other way round: keep the leading sentences for as long as
 * they read as prose, and stop at the first that does not. What follows the
 * break is always data that lost the structure which made it readable, and
 * the page already lists that data properly underneath.
 *
 * The stored description is not modified. This runs at render, so a re-scrape
 * cannot quietly undo it.
 */

/** The source page's own navigation, and the heading row of a flattened table. */
const FURNITURE = [
  /QUICK JUMP TO:/,
  // "YearOrder No.", "DateModel / Edition", "DateMade by". The   is
  // deliberate: the scrape used non-breaking spaces inside these headings, so
  // a literal space matches nothing.
  /(?:Year|Date)[\s ]*(?:Order|Model|Made)\b/,
];

/** Longest run of non-space characters, which is how joined-up data reads. */
function longestToken(s: string): number {
  let best = 0;
  for (const part of s.split(/\s+/)) best = Math.max(best, part.length);
  return best;
}

function looksLikeProse(sentence: string): boolean {
  const s = sentence.trim();
  if (!s) return false;

  // Three words is a sentence. "Fisheye lenses distort." is prose, and a
  // higher bar here discards everything after it as well.
  const spaces = (s.match(/\s/g) ?? []).length;
  if (spaces < 2) return false;

  // Bullets and diameter marks only ever appear in the flattened lists.
  if (/[●⌀•]/.test(s)) return false;

  // "avalable:51C- Canon FD;55C-" — a separator followed by a part code.
  if (/[:;]\s*\d{1,3}[A-Z]\b/.test(s)) return false;

  // Lowercase density is what actually separates prose from a flattened
  // table. Digit density does not: on a lens site the junk runs to 0.122 and
  // an ordinary sentence like "The range runs from 21mm to 300mm across 14
  // lenses" reaches 0.137, so the two classes overlap. Measured on this
  // corpus, junk sits at 0.28-0.34 lowercase and prose at 0.58-0.83.
  const lower = (s.match(/[a-z]/g) ?? []).length;
  if (lower / s.length < 0.45) return false;

  if (longestToken(s) > 30) return false;

  return true;
}

export function cleanScrapedDescription(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;

  let text = raw;
  for (const marker of FURNITURE) {
    const at = text.search(marker);
    if (at !== -1) text = text.slice(0, at);
  }

  // The scrape dropped the space after sentence punctuation ("barrel
  // distortion.Fisheye lenses are"), after a colon ("two types of fisheye
  // lenses:a circular fisheye") and wherever a stripped link fused two words
  // ("the previousAdaptall system"). All three are the same damage, and
  // repairDescription restores them without splitting names such as "GmbH"
  // or "LaK9", which the bare `([a-z])([A-Z])` rule here used to break.
  text = repairDescription(text);

  // Only a stop followed by whitespace or the end of the text closes a
  // sentence. Matching the stop itself cannot span "43.27mm" or "f/1.4": the
  // engine restarts after the decimal point and silently drops the clause
  // before it, which is how a complete sentence about a 43.27mm image circle
  // came out beginning "27mm so that all four corners".
  const sentences = text.match(/[\s\S]+?[.!?]+(?=\s|$)/g) ?? [];
  const kept: string[] = [];
  for (const sentence of sentences) {
    if (!looksLikeProse(sentence)) break;
    kept.push(sentence.trim());
  }

  const prose = kept.join(" ").trim();
  if (!prose) return null;

  // Two of these open by announcing the table we have just removed ("The
  // table shows most of the special limited editions... follow link to a
  // matching lens"). Kept, it points at nothing.
  if (/^The table shows/i.test(prose)) return null;

  return prose;
}
