import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { fieldCitations } from "@/db/schema";

/**
 * How a given fact here is known.
 *
 * The site's claim is to be a citable registry, and today it is not: 92% of
 * lenses carry a lens-db.com url and nothing records which individual figure
 * came from where. This resolves that question per field, from the exceptions
 * table plus the entity's own source as the fallback.
 *
 * The two are deliberately not equivalent. A field with its own citation has
 * been checked against something; a field falling back to the import has not.
 * Collapsing them into one "source" line would be the comfortable answer and
 * the dishonest one, and it would also hide the re-sourcing backlog, which is
 * exactly the work this is meant to make visible.
 */

export type Citation = {
  field: string;
  sourceName: string;
  sourceUrl: string | null;
  retrievedAt: Date;
  note: string | null;
};

/** Everything cited on one entity, keyed by field name. */
export async function getCitations(
  entityType: string,
  entityId: number,
): Promise<Map<string, Citation>> {
  const rows = await db
    .select({
      field: fieldCitations.field,
      sourceName: fieldCitations.sourceName,
      sourceUrl: fieldCitations.sourceUrl,
      retrievedAt: fieldCitations.retrievedAt,
      note: fieldCitations.note,
    })
    .from(fieldCitations)
    .where(
      and(
        eq(fieldCitations.entityType, entityType),
        eq(fieldCitations.entityId, entityId),
      ),
    );

  return new Map(rows.map((r) => [r.field, r]));
}

/** The same, for a page that lists many entities. */
export async function getCitationCounts(
  entityType: string,
  entityIds: number[],
): Promise<Map<number, number>> {
  if (entityIds.length === 0) return new Map();
  const rows = await db
    .select({ entityId: fieldCitations.entityId, field: fieldCitations.field })
    .from(fieldCitations)
    .where(
      and(
        eq(fieldCitations.entityType, entityType),
        inArray(fieldCitations.entityId, entityIds),
      ),
    );

  const counts = new Map<number, number>();
  for (const r of rows) counts.set(r.entityId, (counts.get(r.entityId) ?? 0) + 1);
  return counts;
}

export type CitationInput = {
  entityType: string;
  entityId: number;
  field: string;
  sourceName: string;
  sourceUrl?: string | null;
  retrievedAt?: Date;
  revisionId?: number | null;
  note?: string | null;
};

/**
 * Record where a field came from, replacing any earlier citation for it.
 *
 * Replacing rather than appending keeps "how is this known" to a single
 * answer. The history of who changed what is already kept in `revisions`, and
 * duplicating it here would let the two disagree.
 */
export async function citeField(input: CitationInput): Promise<void> {
  await db
    .insert(fieldCitations)
    .values({
      entityType: input.entityType,
      entityId: input.entityId,
      field: input.field,
      sourceName: input.sourceName,
      sourceUrl: input.sourceUrl ?? null,
      retrievedAt: input.retrievedAt ?? new Date(),
      revisionId: input.revisionId ?? null,
      note: input.note ?? null,
    })
    .onConflictDoUpdate({
      target: [
        fieldCitations.entityType,
        fieldCitations.entityId,
        fieldCitations.field,
      ],
      set: {
        sourceName: input.sourceName,
        sourceUrl: input.sourceUrl ?? null,
        retrievedAt: input.retrievedAt ?? new Date(),
        revisionId: input.revisionId ?? null,
        note: input.note ?? null,
      },
    });
}

export async function citeFields(inputs: CitationInput[]): Promise<number> {
  let n = 0;
  for (const input of inputs) {
    await citeField(input);
    n++;
  }
  return n;
}
