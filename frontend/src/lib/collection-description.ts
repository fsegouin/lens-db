/**
 * Collection blurbs arrived from a scrape that flattened the source page's
 * furniture into the description text, and they are shown raw today: on the
 * index cards, on the collection page as one paragraph, and in the page's
 * meta description.
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

  // A real sentence is made of words.
  const spaces = (s.match(/\s/g) ?? []).length;
  if (spaces < 5) return false;

  // Bullets and diameter marks only ever appear in the flattened lists.
  if (/[●⌀•]/.test(s)) return false;

  // "avalable:51C- Canon FD;55C-" — a separator followed by a part code.
  if (/[:;]\s*\d{1,3}[A-Z]\b/.test(s)) return false;

  // Dense figures, or a word no human typed, mean a table lost its columns.
  const digits = (s.match(/\d/g) ?? []).length;
  if (digits / s.length > 0.12) return false;
  if (longestToken(s) > 30) return false;

  return true;
}

export function cleanCollectionDescription(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;

  let text = raw;
  for (const marker of FURNITURE) {
    const at = text.search(marker);
    if (at !== -1) text = text.slice(0, at);
  }

  // The scrape also dropped the space after sentence punctuation, giving
  // "barrel distortion.Fisheye lenses are". Requiring a lowercase letter
  // before the stop leaves initialisms like "U.S.A." intact.
  text = text.replace(/([a-z][.;:!?])([A-Z])/g, "$1 $2");

  // The same loss before a lowercase word, which the rule above cannot see:
  // "two types of fisheye lenses:a circular fisheye". Requiring a letter after
  // the colon leaves figures like "1:4 f=17mm" and "1:2.8" alone.
  text = text.replace(/([:;])([a-zA-Z])/g, "$1 $2");

  // Links stripped from the source left words fused to their neighbour:
  // "the previousAdaptall system". formatDescription already does this for
  // lens and camera text; the same join shows up here for the same reason.
  text = text.replace(/([a-z])([A-Z])/g, "$1 $2").trim();

  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? [];
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
