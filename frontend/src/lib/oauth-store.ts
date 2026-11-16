import { and, eq, gt, lt, not, sql } from "drizzle-orm";
import { db } from "@/db";
import { oauthAuthorizationCodes, oauthTokens, users } from "@/db/schema";
import {
  CODE_TTL_MS,
  TOKEN_IDLE_DAYS,
  findClient,
  issueAccessToken,
  issueCode,
  verifyPkce,
  type AuthorizeRequest,
} from "@/lib/oauth";
import { hashToken } from "@/lib/one-shot-token";

/** The codes and tokens behind lib/oauth.ts. Only hashes are ever stored. */

/** True of a token that has been presented, or was issued, within the idle limit. */
const IN_USE = sql`coalesce(${oauthTokens.lastUsedAt}, ${oauthTokens.createdAt}) > now() - make_interval(days => ${TOKEN_IDLE_DAYS}::int)`;

/** Records that a member agreed, and returns the code to hand to the app. */
export async function createAuthorizationCode(
  userId: number,
  request: AuthorizeRequest,
): Promise<string> {
  // Codes nobody exchanged and tokens past the idle limit are swept here,
  // where new ones are made, so neither table needs a job of its own and
  // nothing is kept about a connection that no longer works.
  await Promise.all([
    db.delete(oauthAuthorizationCodes).where(lt(oauthAuthorizationCodes.expiresAt, new Date())),
    db.delete(oauthTokens).where(not(IN_USE)),
  ]);

  const { code, codeHash } = issueCode();
  await db.insert(oauthAuthorizationCodes).values({
    codeHash,
    clientId: request.client.id,
    userId,
    redirectUri: request.redirectUri,
    scope: request.scope,
    codeChallenge: request.codeChallenge,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  return code;
}

/**
 * Exchanges a code for an access token, or returns null when anything about
 * the exchange is wrong. The code is deleted by the statement that finds it,
 * so it works once: a second exchange, or a failed one, finds nothing.
 */
export async function redeemAuthorizationCode(exchange: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<{ accessToken: string; scope: string } | null> {
  const [grant] = await db
    .delete(oauthAuthorizationCodes)
    .where(
      and(
        eq(oauthAuthorizationCodes.codeHash, hashToken(exchange.code)),
        gt(oauthAuthorizationCodes.expiresAt, new Date()),
      ),
    )
    .returning({
      clientId: oauthAuthorizationCodes.clientId,
      userId: oauthAuthorizationCodes.userId,
      redirectUri: oauthAuthorizationCodes.redirectUri,
      scope: oauthAuthorizationCodes.scope,
      codeChallenge: oauthAuthorizationCodes.codeChallenge,
    });
  if (
    !grant ||
    grant.clientId !== exchange.clientId ||
    grant.redirectUri !== exchange.redirectUri ||
    !verifyPkce(exchange.codeVerifier, grant.codeChallenge)
  ) {
    return null;
  }

  const [user] = await db
    .select({ isBanned: users.isBanned })
    .from(users)
    .where(eq(users.id, grant.userId))
    .limit(1);
  // Only an account known not to be banned gets a token: the same test
  // findTokenOwner applies to every call, so no token is issued that the
  // partner API would then refuse.
  if (!user || user.isBanned !== false) return null;

  const { token, tokenHash } = issueAccessToken();
  await db.insert(oauthTokens).values({
    tokenHash,
    clientId: grant.clientId,
    userId: grant.userId,
    scope: grant.scope,
  });
  return { accessToken: token, scope: grant.scope };
}

export async function revokeToken(token: string): Promise<void> {
  await db.delete(oauthTokens).where(eq(oauthTokens.tokenHash, hashToken(token)));
}

export type TokenOwner = { userId: number; displayName: string; scopes: string[] };

/**
 * Who a presented token speaks for, or null when it no longer works: revoked,
 * idle for too long, or belonging to a suspended account.
 */
export async function findTokenOwner(token: string): Promise<TokenOwner | null> {
  const [row] = await db
    .select({
      id: oauthTokens.id,
      userId: oauthTokens.userId,
      scope: oauthTokens.scope,
      displayName: users.displayName,
      // Decided by the database's clock, the one that wrote the timestamps.
      usedToday: sql<boolean>`coalesce(${oauthTokens.lastUsedAt} > now() - interval '1 day', false)`,
    })
    .from(oauthTokens)
    .innerJoin(users, eq(users.id, oauthTokens.userId))
    .where(
      and(
        eq(oauthTokens.tokenHash, hashToken(token)),
        eq(users.isBanned, false),
        IN_USE,
      ),
    )
    .limit(1);
  if (!row) return null;

  if (!row.usedToday) {
    await db.update(oauthTokens).set({ lastUsedAt: sql`now()` }).where(eq(oauthTokens.id, row.id));
  }
  return { userId: row.userId, displayName: row.displayName, scopes: row.scope.split(" ") };
}

export type ConnectedApp = {
  clientId: string;
  name: string;
  connectedAt: string;
  lastUsedAt: string | null;
};

/** The apps holding a working token for this account, one line per app. */
export async function listConnectedApps(userId: number): Promise<ConnectedApp[]> {
  const rows = await db
    .select({
      clientId: oauthTokens.clientId,
      connectedAt: sql<Date>`min(${oauthTokens.createdAt})`.mapWith(oauthTokens.createdAt),
      lastUsedAt: sql<Date | null>`max(${oauthTokens.lastUsedAt})`.mapWith(oauthTokens.createdAt),
    })
    .from(oauthTokens)
    .where(
      and(
        eq(oauthTokens.userId, userId),
        IN_USE,
      ),
    )
    .groupBy(oauthTokens.clientId)
    .orderBy(oauthTokens.clientId);

  return rows.map((row) => ({
    clientId: row.clientId,
    name: findClient(row.clientId)?.name ?? row.clientId,
    connectedAt: row.connectedAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  }));
}

/**
 * Ends every token one app holds for this account, and any code it has not
 * exchanged yet, which would otherwise still buy it a fresh token. Returns
 * whether there were any tokens.
 */
export async function disconnectApp(userId: number, clientId: string): Promise<boolean> {
  const [removed] = await Promise.all([
    db
      .delete(oauthTokens)
      .where(and(eq(oauthTokens.userId, userId), eq(oauthTokens.clientId, clientId)))
      .returning({ id: oauthTokens.id }),
    db
      .delete(oauthAuthorizationCodes)
      .where(
        and(eq(oauthAuthorizationCodes.userId, userId), eq(oauthAuthorizationCodes.clientId, clientId)),
      ),
  ]);
  return removed.length > 0;
}

/** What a `db.transaction` callback is handed. */
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Ends every app's access to an account, and any code still waiting to be
 * exchanged. A password reset means the account may have been in someone
 * else's hands, so whatever was granted before it is withdrawn with the
 * sessions, in the transaction that sets the new password: a reset must never
 * land while the apps connected before it keep working.
 */
export async function revokeAllAppAccess(tx: Transaction, userId: number): Promise<void> {
  // One after the other: a transaction is a single connection.
  await tx.delete(oauthTokens).where(eq(oauthTokens.userId, userId));
  await tx.delete(oauthAuthorizationCodes).where(eq(oauthAuthorizationCodes.userId, userId));
}
