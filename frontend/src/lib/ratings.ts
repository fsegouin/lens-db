/**
 * How many ratings an entity needs before its mean is presented as an average.
 *
 * Ratings are anonymous and most rated entities have one or two of them, so a
 * bare mean is one person's opinion wearing the clothes of a consensus. Below
 * this floor we still count the votes and still let people add theirs; what we
 * withhold is the verdict, on the page and in the structured data a search
 * engine reads.
 */
export const MIN_RATINGS_FOR_AVERAGE = 3;

/** Whether an entity has enough ratings for its mean to be worth showing. */
export function hasPublishableAverage(
  averageRating: number | null | undefined,
  ratingCount: number | null | undefined,
): boolean {
  return averageRating != null && (ratingCount ?? 0) >= MIN_RATINGS_FOR_AVERAGE;
}
