import { createHash, randomUUID } from "node:crypto";

/**
 * Password reset and email verification links carry a random token; the
 * database keeps only its SHA-256. Whoever can read the table (a dump, a
 * backup, a query log) then holds nothing that works as a link. A fast hash
 * is enough here: the token is 122 random bits, not a password to stretch.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A fresh token: `token` goes in the emailed link, `tokenHash` in the database. */
export function issueToken(): { token: string; tokenHash: string } {
  const token = randomUUID();
  return { token, tokenHash: hashToken(token) };
}

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The stored values a presented token may match: its hash, and for a token of
 * the emailed shape also the token itself, because rows written before hashing
 * hold it as it was sent. Those rows expire within a day of this change being
 * deployed, after which the second form matches nothing and can be dropped.
 *
 * A stored hash is 64 hex characters, never the emailed shape, so a hash read
 * from the table and presented as a token matches no row.
 */
export function storedForms(token: string): string[] {
  const hash = hashToken(token);
  return UUID_SHAPE.test(token) ? [hash, token] : [hash];
}
