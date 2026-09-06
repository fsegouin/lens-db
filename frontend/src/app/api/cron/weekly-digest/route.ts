import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { isCronAuthorized } from "@/lib/api-utils";
import { buildDigestEmail, sendDigestEmail } from "@/lib/email-digest";
import { getNewEntitiesSummary } from "@/lib/new-entities";

export const maxDuration = 300;

/** "f***@example.com": no addresses in the logs. */
function maskEmail(email: string): string {
  return email.replace(/^(.).*?(@.*)$/, "$1***$2");
}

/**
 * Monday morning: what was added in the last seven days, to everyone who
 * asked for it. A quiet week sends nothing at all, since an email saying
 * "nothing happened" is the fastest way to be unsubscribed.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";

  try {
    const entries = await getNewEntitiesSummary(7);
    if (entries.length === 0) {
      return NextResponse.json({ sent: 0, reason: "nothing new" });
    }

    const weekLabel = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    const email = buildDigestEmail(entries, weekLabel);

    const recipients = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(
        and(
          eq(users.digestOptIn, true),
          isNotNull(users.emailVerifiedAt),
          eq(users.isBanned, false),
        ),
      );

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        recipients: recipients.length,
        entries: entries.length,
        subject: email.subject,
      });
    }

    let sent = 0;
    let failed = 0;
    for (const r of recipients) {
      try {
        await sendDigestEmail(r.email, email);
        sent++;
      } catch (err) {
        failed++;
        console.error(`[digest] Failed to send to ${maskEmail(r.email)}:`, err);
      }
    }

    return NextResponse.json({ sent, failed, recipients: recipients.length, entries: entries.length });
  } catch (err) {
    console.error("Weekly digest failed:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
