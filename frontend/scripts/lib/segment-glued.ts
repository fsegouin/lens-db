/**
 * Splitting the runs that lost every space, such as
 * "minimizeghostingandflarewhile" or "reduceghostingandflare".
 *
 * These come from the same import bug as the rest (see
 * description-whitespace.ts), but from the densest markup: a sentence whose
 * terms were each wrapped in their own tag lost every space between them, so
 * there is no capital and no digit left to key on. Nothing but the words
 * themselves says where the boundaries were.
 *
 * The dictionary is therefore built from the corpus being repaired rather than
 * shipped with the code. Descriptions are overwhelmingly correctly spaced, so
 * the words either side of a glued run appear, spelled and spaced properly, in
 * thousands of other rows. That gives a vocabulary already in the right
 * register: "bokeh", "vignetting", "aspherical" and "Nikkor" are ordinary
 * words here and absent from a generic English list.
 *
 * Segmentation is a shortest-path over the run, where a word costs its
 * negative log frequency. That naturally prefers few common words over many
 * rare ones, and prefers leaving a run alone when it is already a word.
 *
 * The result is only accepted when every piece clears MIN_PIECE_FREQUENCY.
 * A run that cannot be spelled entirely out of confident words is returned
 * unchanged, because a wrong split here invents text rather than merely
 * failing to fix it.
 */

/** A word must be at least this common in the corpus to be a valid piece. */
const MIN_PIECE_FREQUENCY = 12;

/** One and two letter pieces are only ever these, so "a t" cannot be produced. */
const ALLOWED_SHORT = new Set([
  "a", "i", "an", "as", "at", "be", "by", "do", "go", "if", "in", "is", "it",
  "no", "of", "on", "or", "so", "to", "up", "us", "we", "he",
  "mm", "cm",
]);

/**
 * Charged once per word, so a segmentation is only preferred when the words it
 * gains are common enough to pay for themselves. It has to outweigh the log
 * frequencies it competes with: at 8 the search bought four rare words over
 * one ordinary one and read "viewfinder" as "view f in der".
 */
const PER_WORD_PENALTY = 20;

/**
 * No dictionary entry may be longer than this. The corpus is the dictionary,
 * and the corpus still contains the damage, so "minimizeghostingandflare"
 * (14 occurrences, all the same press release) would otherwise be admitted as
 * a word and the run it appears in would be "segmented" back into itself.
 * Genuine vocabulary here tops out around "transmittance".
 */
const MAX_WORD_LENGTH = 13;

/**
 * A shorter compound is rejected when it is far rarer than the words it is
 * made of, which is what separates the damage from real compounds:
 * "andspherical" occurs 21 times against "spherical" at 150, while
 * "viewfinder" occurs 784 times against "finder" at 110.
 */
const COMPOUND_RATIO = 0.5;

export type Vocabulary = Map<string, number>;

/** Count every properly spaced word in the corpus, lowercased. */
function countWords(texts: Iterable<string>): Vocabulary {
  const counts: Vocabulary = new Map();
  for (const text of texts) {
    for (const raw of text.split(/[^A-Za-z]+/)) {
      if (raw.length < 1) continue;
      const w = raw.toLowerCase();
      counts.set(w, (counts.get(w) || 0) + 1);
    }
  }
  return counts;
}

/**
 * Build the dictionary, then take back out the entries that are themselves
 * glued damage. Without this step the vocabulary vouches for the very text it
 * is meant to repair.
 */
export function buildVocabulary(texts: Iterable<string>): Vocabulary {
  const counts = countWords(texts);
  const vocab: Vocabulary = new Map();

  for (const [word, n] of counts) {
    if (word.length > MAX_WORD_LENGTH) continue;
    if (n < MIN_PIECE_FREQUENCY) continue;
    vocab.set(word, n);
  }

  for (const [word, n] of [...vocab]) {
    if (word.length < 8) continue;
    for (let cut = 3; cut <= word.length - 3; cut++) {
      const left = counts.get(word.slice(0, cut)) ?? 0;
      const right = counts.get(word.slice(cut)) ?? 0;
      if (left < MIN_PIECE_FREQUENCY || right < MIN_PIECE_FREQUENCY) continue;
      if (n < COMPOUND_RATIO * Math.min(left, right)) {
        vocab.delete(word);
        break;
      }
    }
  }
  return vocab;
}

function usable(word: string, vocab: Vocabulary): number {
  const n = vocab.get(word) || 0;
  if (n < MIN_PIECE_FREQUENCY) return 0;
  if (word.length <= 2 && !ALLOWED_SHORT.has(word)) return 0;
  return n;
}

/**
 * Best segmentation of a single glued run, or null when it cannot be spelled
 * confidently. Returns the run itself when it is already one word.
 */
export function segmentRun(run: string, vocab: Vocabulary): string[] | null {
  const n = run.length;
  // best[i] = cheapest cost to cover run[0..i); from[i] = start of last word.
  const best = new Array(n + 1).fill(Infinity);
  const from = new Array(n + 1).fill(-1);
  best[0] = 0;

  for (let end = 1; end <= n; end++) {
    for (let start = 0; start < end; start++) {
      if (best[start] === Infinity) continue;
      const freq = usable(run.slice(start, end), vocab);
      if (!freq) continue;
      const cost = best[start] + PER_WORD_PENALTY - Math.log(freq);
      if (cost < best[end]) {
        best[end] = cost;
        from[end] = start;
      }
    }
  }

  if (best[n] === Infinity) return null;
  const pieces: string[] = [];
  for (let at = n; at > 0; at = from[at]) pieces.unshift(run.slice(from[at], at));
  return pieces;
}

/**
 * Split every glued run in a description. Runs are located case-insensitively
 * but matched in lowercase, and each piece keeps the original casing so that a
 * run starting a sentence is not lowercased.
 */
export function splitGluedRuns(
  text: string,
  vocab: Vocabulary,
  minLength = 18
): { text: string; splits: string[][] } {
  const splits: string[][] = [];
  const out = text.replace(new RegExp(`[A-Za-z]{${minLength},}`, "g"), (run) => {
    const pieces = segmentRun(run.toLowerCase(), vocab);
    if (!pieces || pieces.length < 2) return run;
    // Re-apply the original characters so casing survives.
    let at = 0;
    const cased = pieces.map((p) => run.slice(at, (at += p.length)));
    splits.push(cased);
    return cased.join(" ");
  });
  return { text: out, splits };
}
