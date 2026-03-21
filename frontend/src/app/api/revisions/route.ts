import { NextRequest, NextResponse } from "next/server";
import { getRevisionHistory, type EntityType } from "@/lib/revisions";

const validEntityTypes = new Set(["lens", "camera", "system", "collection", "series"]);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");
  const page = parseInt(searchParams.get("page") || "1", 10);

  if (!entityType || !validEntityTypes.has(entityType)) {
    return NextResponse.json({ error: "Invalid entityType" }, { status: 400 });
  }
  if (!entityId || isNaN(parseInt(entityId, 10))) {
    return NextResponse.json({ error: "Invalid entityId" }, { status: 400 });
  }

  const result = await getRevisionHistory(
    entityType as EntityType,
    parseInt(entityId, 10),
    page,
    50
  );

  return NextResponse.json(result);
}
