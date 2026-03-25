import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lenses, cameras, pendingEdits } from "@/db/schema";
import { requireUserAPI } from "@/lib/user-auth";
import { createRevision } from "@/lib/revisions";
import { getUserTier } from "@/lib/edit-validation";
import { getClientIP, hashIP } from "@/lib/api-utils";
import { createRateLimit } from "@/lib/rate-limit";

const submitLimiter = createRateLimit(10, "3600 s"); // 10 submissions per hour

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Allowed fields for new submissions (subset of editable fields)
const lensFields = [
  "name", "url", "brand", "description", "lensType", "era", "productionStatus",
  "systemId",
  "focalLengthMin", "focalLengthMax", "apertureMin", "apertureMax",
  "weightG", "filterSizeMm", "minFocusDistanceM", "maxMagnification",
  "lensElements", "lensGroups", "diaphragmBlades",
  "yearIntroduced", "yearDiscontinued",
  "isZoom", "isMacro", "isPrime", "hasStabilization", "hasAutofocus",
];

const cameraFields = [
  "name", "url", "description", "alias",
  "systemId",
  "sensorType", "sensorSize", "megapixels", "resolution",
  "yearIntroduced", "bodyType", "weightG",
];

const numericFields = new Set([
  "systemId",
  "focalLengthMin", "focalLengthMax", "apertureMin", "apertureMax",
  "weightG", "filterSizeMm", "minFocusDistanceM", "maxMagnification",
  "lensElements", "lensGroups", "diaphragmBlades",
  "yearIntroduced", "yearDiscontinued", "megapixels",
]);

export async function POST(request: NextRequest) {
  const token = request.cookies.get("user_session")?.value;
  const authResult = await requireUserAPI(token);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  // Email verification check
  if (!user.emailVerifiedAt) {
    return NextResponse.json({ error: "Please verify your email before submitting" }, { status: 403 });
  }

  // Ban check
  if (user.isBanned) {
    return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
  }

  // Rate limit
  const { success: rateLimitOk } = await submitLimiter.limit(`submit:${user.id}`);
  if (!rateLimitOk) {
    return NextResponse.json({ error: "Too many submissions. Please wait before submitting again." }, { status: 429 });
  }

  const body = await request.json();
  const { entityType, data, summary } = body as {
    entityType: string;
    data: Record<string, unknown>;
    summary: string;
  };

  if (entityType !== "lens" && entityType !== "camera") {
    return NextResponse.json({ error: "Entity type must be 'lens' or 'camera'" }, { status: 400 });
  }

  // Validate name
  const name = data?.name;
  if (!name || typeof name !== "string" || name.trim().length < 2 || name.trim().length > 200) {
    return NextResponse.json({ error: "Name is required (2-200 characters)" }, { status: 400 });
  }

  if (!summary || typeof summary !== "string" || summary.trim().length < 3 || summary.trim().length > 500) {
    return NextResponse.json({ error: "Summary must be 3-500 characters" }, { status: 400 });
  }

  // URL validation
  if (data.url && typeof data.url === "string") {
    if (!/^https?:\/\//i.test(data.url)) {
      return NextResponse.json({ error: "URL must start with http:// or https://" }, { status: 400 });
    }
    if (data.url.length > 2000) {
      return NextResponse.json({ error: "URL is too long (max 2000 characters)" }, { status: 400 });
    }
  }

  // String length validation
  for (const [key, val] of Object.entries(data)) {
    if (typeof val === "string" && val.length > 5000 && key !== "url") {
      return NextResponse.json({ error: `${key} is too long (max 5000 characters)` }, { status: 400 });
    }
  }

  // Build entity data from allowed fields only
  const allowedFields = entityType === "lens" ? lensFields : cameraFields;
  const entityData: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      let val = data[field];
      if (numericFields.has(field)) {
        val = val != null && val !== "" ? Number(val) : null;
        if (val !== null && !Number.isFinite(val)) {
          return NextResponse.json({ error: `${field} must be a finite number` }, { status: 400 });
        }
      }
      entityData[field] = val;
    }
  }

  // Normalize empty strings to null for text fields
  for (const [key, val] of Object.entries(entityData)) {
    if (val === "" && !numericFields.has(key)) entityData[key] = null;
  }

  entityData.name = name.trim();
  const slug = generateSlug(name.trim());
  entityData.slug = slug;

  const ipHash = await hashIP(getClientIP(request));
  const userTier = getUserTier(user);
  const canAutoApply = userTier !== "none";

  if (!canAutoApply) {
    // Queue for admin review
    const [pending] = await db
      .insert(pendingEdits)
      .values({
        entityType,
        entityId: 0, // 0 indicates a new entity creation
        changes: entityData,
        summary: summary.trim(),
        userId: user.id,
        ipHash,
      })
      .returning({ id: pendingEdits.id });

    return NextResponse.json({
      success: true,
      pending: true,
      pendingEditId: pending.id,
      message: "Your submission has been queued for review. An admin will approve it shortly.",
    });
  }

  // Auto-create for trusted users
  let created: { id: number; slug: string };
  if (entityType === "lens") {
    const [row] = await db
      .insert(lenses)
      .values({
        name: entityData.name as string,
        slug,
        url: (entityData.url as string) || null,
        brand: (entityData.brand as string) || null,
        systemId: (entityData.systemId as number) || null,
        description: (entityData.description as string) || null,
        lensType: (entityData.lensType as string) || null,
        era: (entityData.era as string) || null,
        productionStatus: (entityData.productionStatus as string) || null,
        focalLengthMin: (entityData.focalLengthMin as number) ?? null,
        focalLengthMax: (entityData.focalLengthMax as number) ?? null,
        apertureMin: (entityData.apertureMin as number) ?? null,
        apertureMax: (entityData.apertureMax as number) ?? null,
        weightG: (entityData.weightG as number) ?? null,
        filterSizeMm: (entityData.filterSizeMm as number) ?? null,
        minFocusDistanceM: (entityData.minFocusDistanceM as number) ?? null,
        maxMagnification: (entityData.maxMagnification as number) ?? null,
        lensElements: (entityData.lensElements as number) ?? null,
        lensGroups: (entityData.lensGroups as number) ?? null,
        diaphragmBlades: (entityData.diaphragmBlades as number) ?? null,
        yearIntroduced: (entityData.yearIntroduced as number) ?? null,
        yearDiscontinued: (entityData.yearDiscontinued as number) ?? null,
        isZoom: (entityData.isZoom as boolean) ?? false,
        isMacro: (entityData.isMacro as boolean) ?? false,
        isPrime: (entityData.isPrime as boolean) ?? false,
        hasStabilization: (entityData.hasStabilization as boolean) ?? false,
        hasAutofocus: (entityData.hasAutofocus as boolean) ?? false,
        specs: {},
        images: [],
      })
      .returning({ id: lenses.id, slug: lenses.slug });
    created = row;
  } else {
    const [row] = await db
      .insert(cameras)
      .values({
        name: entityData.name as string,
        slug,
        url: (entityData.url as string) || null,
        systemId: (entityData.systemId as number) || null,
        description: (entityData.description as string) || null,
        alias: (entityData.alias as string) || null,
        sensorType: (entityData.sensorType as string) || null,
        sensorSize: (entityData.sensorSize as string) || null,
        megapixels: (entityData.megapixels as number) ?? null,
        resolution: (entityData.resolution as string) || null,
        yearIntroduced: (entityData.yearIntroduced as number) ?? null,
        bodyType: (entityData.bodyType as string) || null,
        weightG: (entityData.weightG as number) ?? null,
        specs: {},
        images: [],
      })
      .returning({ id: cameras.id, slug: cameras.slug });
    created = row;
  }

  const isAdmin = user.role === "admin";
  const isTrusted = user.role === "trusted";

  await createRevision({
    entityType,
    entityId: created.id,
    summary: summary.trim(),
    userId: user.id,
    ipHash,
    autoPatrol: isAdmin || isTrusted,
  });

  return NextResponse.json({
    success: true,
    pending: false,
    entityId: created.id,
    slug: created.slug,
    entityType,
  });
}
