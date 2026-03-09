import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lenses, cameras, blockedIps } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getClientIP, hashIP, rateLimitedResponse } from "@/lib/api-utils";
import { createRateLimit } from "@/lib/rate-limit";

const dailyLimiter = createRateLimit(5, "24 h");

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const { success } = await dailyLimiter.limit(ip);
  if (!success) return rateLimitedResponse();

  // Check if IP is blocked (return generic error to not reveal the block)
  const [blocked] = await db
    .select({ id: blockedIps.id })
    .from(blockedIps)
    .where(eq(blockedIps.ipAddress, ip))
    .limit(1);
  if (blocked) {
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json(
      { error: "Name is required" },
      { status: 400 }
    );
  }
  if (body.entityType !== "lens" && body.entityType !== "camera") {
    return NextResponse.json(
      { error: "entityType must be 'lens' or 'camera'" },
      { status: 400 }
    );
  }

  const name = body.name.trim().slice(0, 500);
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const hashedIp = await hashIP(ip);

  if (body.entityType === "lens") {
    await db.insert(lenses).values({
      name,
      slug,
      brand:
        typeof body.brand === "string" ? body.brand.slice(0, 200) : null,
      systemId:
        typeof body.systemId === "number" ? body.systemId : null,
      description:
        typeof body.description === "string"
          ? body.description.slice(0, 5000)
          : null,
      lensType:
        typeof body.lensType === "string" ? body.lensType.slice(0, 200) : null,
      era: typeof body.era === "string" ? body.era.slice(0, 200) : null,
      productionStatus:
        typeof body.productionStatus === "string"
          ? body.productionStatus.slice(0, 200)
          : null,
      focalLengthMin:
        typeof body.focalLengthMin === "number" ? body.focalLengthMin : null,
      focalLengthMax:
        typeof body.focalLengthMax === "number" ? body.focalLengthMax : null,
      apertureMin:
        typeof body.apertureMin === "number" ? body.apertureMin : null,
      apertureMax:
        typeof body.apertureMax === "number" ? body.apertureMax : null,
      weightG: typeof body.weightG === "number" ? body.weightG : null,
      filterSizeMm:
        typeof body.filterSizeMm === "number" ? body.filterSizeMm : null,
      minFocusDistanceM:
        typeof body.minFocusDistanceM === "number"
          ? body.minFocusDistanceM
          : null,
      maxMagnification:
        typeof body.maxMagnification === "number"
          ? body.maxMagnification
          : null,
      lensElements:
        typeof body.lensElements === "number"
          ? Math.round(body.lensElements)
          : null,
      lensGroups:
        typeof body.lensGroups === "number"
          ? Math.round(body.lensGroups)
          : null,
      diaphragmBlades:
        typeof body.diaphragmBlades === "number"
          ? Math.round(body.diaphragmBlades)
          : null,
      yearIntroduced:
        typeof body.yearIntroduced === "number"
          ? Math.round(body.yearIntroduced)
          : null,
      yearDiscontinued:
        typeof body.yearDiscontinued === "number"
          ? Math.round(body.yearDiscontinued)
          : null,
      isZoom: body.isZoom === true,
      isMacro: body.isMacro === true,
      isPrime: body.isPrime === true,
      hasStabilization: body.hasStabilization === true,
      hasAutofocus: body.hasAutofocus === true,
      specs:
        typeof body.specs === "object" && body.specs !== null && !Array.isArray(body.specs)
          ? body.specs
          : {},
      images: [],
      verified: false,
      submittedByIp: hashedIp,
    });
  } else {
    await db.insert(cameras).values({
      name,
      slug,
      systemId:
        typeof body.systemId === "number" ? body.systemId : null,
      description:
        typeof body.description === "string"
          ? body.description.slice(0, 5000)
          : null,
      alias:
        typeof body.alias === "string" ? body.alias.slice(0, 500) : null,
      sensorType:
        typeof body.sensorType === "string"
          ? body.sensorType.slice(0, 200)
          : null,
      sensorSize:
        typeof body.sensorSize === "string"
          ? body.sensorSize.slice(0, 200)
          : null,
      megapixels:
        typeof body.megapixels === "number" ? body.megapixels : null,
      resolution:
        typeof body.resolution === "string"
          ? body.resolution.slice(0, 200)
          : null,
      yearIntroduced:
        typeof body.yearIntroduced === "number"
          ? Math.round(body.yearIntroduced)
          : null,
      bodyType:
        typeof body.bodyType === "string" ? body.bodyType.slice(0, 200) : null,
      weightG: typeof body.weightG === "number" ? body.weightG : null,
      specs:
        typeof body.specs === "object" && body.specs !== null && !Array.isArray(body.specs)
          ? body.specs
          : {},
      images: [],
      verified: false,
      submittedByIp: hashedIp,
    });
  }

  return NextResponse.json({ slug, entityType: body.entityType }, { status: 201 });
}
