import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { issueReports, blockedIps } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getClientIP, rateLimitedResponse } from "@/lib/api-utils";
import { createRateLimit } from "@/lib/rate-limit";

// 3 reports per hour, 10 per day
const burstLimiter = createRateLimit(3, "1 h");
const dailyLimiter = createRateLimit(10, "24 h");

const VALID_ENTITY_TYPES = ["lens", "camera", "system", "collection"];
const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 2000;

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const [burst, daily] = await Promise.all([
    burstLimiter.limit(ip),
    dailyLimiter.limit(ip),
  ]);
  if (!burst.success || !daily.success) return rateLimitedResponse();

  // Check if IP is blocked (return generic error to not reveal the block)
  const [blocked] = await db
    .select({ id: blockedIps.id })
    .from(blockedIps)
    .where(eq(blockedIps.ipAddress, ip))
    .limit(1);
  if (blocked) {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.message !== "string" ||
    typeof body.entityType !== "string" ||
    !VALID_ENTITY_TYPES.includes(body.entityType) ||
    typeof body.entityId !== "number" ||
    typeof body.entityName !== "string"
  ) {
    return NextResponse.json({ error: "Invalid report" }, { status: 400 });
  }

  const message = body.message.trim();
  if (message.length < MIN_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Message must be at least ${MIN_MESSAGE_LENGTH} characters` },
      { status: 400 }
    );
  }

  const country = request.headers.get("x-vercel-ip-country") || null;

  await db.insert(issueReports).values({
    entityType: body.entityType,
    entityId: body.entityId,
    entityName: body.entityName.slice(0, 500),
    entitySlug: typeof body.entitySlug === "string" ? body.entitySlug.slice(0, 500) : null,
    message: message.slice(0, MAX_MESSAGE_LENGTH),
    fieldName: typeof body.fieldName === "string" ? body.fieldName.slice(0, 200) : null,
    oldValue: typeof body.oldValue === "string" ? body.oldValue.slice(0, 1000) : null,
    suggestedValue: typeof body.suggestedValue === "string" ? body.suggestedValue.slice(0, 1000) : null,
    ipAddress: ip,
    country,
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
