import { NextRequest, NextResponse } from "next/server";
import { getMountsWithFlange } from "@/lib/adapters";
import { getPublicCameras, getPublicLenses } from "@/lib/public-data";
import { apiError, apiOptions, LICENCE, publicHeaders } from "@/lib/public-api";

export const maxDuration = 300;

export function OPTIONS() {
  return apiOptions();
}

const PAGE = 500;

/**
 * The whole set, as newline-delimited JSON.
 *
 * Paging through /api/v1/lenses 500 at a time works and is the polite way to
 * do it, but anyone who actually wants the corpus wants one file. It is
 * streamed rather than assembled: 9,000 lenses held in memory to build one
 * string is how a serverless function runs out of it.
 *
 * The first line of every dump is a header object naming the licence, so the
 * terms travel with the file rather than living only on a page someone read
 * once.
 */
export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type") ?? "lenses";
  if (!["lenses", "cameras", "mounts"].includes(type)) {
    return apiError("type must be lenses, cameras or mounts", 400);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const line = (o: unknown) => controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));
      try {
        line({
          _meta: "thelensdb.com",
          type,
          generatedAt: new Date().toISOString(),
          licence: LICENCE.facts,
          note: LICENCE.excluded,
        });

        if (type === "mounts") {
          const mounts = await getMountsWithFlange();
          for (const m of mounts) {
            line({
              id: m.slug,
              name: m.name,
              flangeDistanceMm: m.flangeDistanceMm,
              lensCount: m.lensCount,
              cameraCount: m.cameraCount,
            });
          }
        } else {
          let after = 0;
          for (;;) {
            const { items, nextAfter } =
              type === "lenses"
                ? await getPublicLenses({ limit: PAGE, after })
                : await getPublicCameras({ limit: PAGE, after });
            for (const item of items) line(item);
            if (nextAfter == null) break;
            after = nextAfter;
          }
        }
        controller.close();
      } catch (error) {
        console.error("GET /api/v1/dump error:", error);
        // The stream has already started, so the failure has to be a line in
        // the file rather than a status code.
        line({ _error: "The dump ended early and is incomplete." });
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      ...publicHeaders(86400),
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": `inline; filename="thelensdb-${type}.ndjson"`,
    },
  });
}
