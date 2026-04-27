import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { lenses } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { processAndUpload, fetchAndUpload } from "@/lib/r2-upload";

export const runtime = "nodejs";

type ImageData = { src: string; alt: string };

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_RAW_BYTES = 10 * 1024 * 1024;

function r2KeyFor(slug: string): string {
  const tail = slug.replace(/^lens\//, "");
  return `lenses/${tail}/${Date.now()}-${nanoid(6)}.webp`;
}

async function loadLens(id: number) {
  const row = await db.select().from(lenses).where(eq(lenses.id, id)).then((r) => r[0]);
  return row || null;
}

async function appendImage(id: number, image: ImageData): Promise<ImageData[]> {
  const lens = await loadLens(id);
  if (!lens) throw new Error("not found");
  const current = (Array.isArray(lens.images) ? lens.images : []) as ImageData[];
  const updated = [...current, image];
  await db.update(lenses).set({ images: updated }).where(eq(lenses.id, id));
  return updated;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const lens = await loadLens(id);
  if (!lens) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const contentType = request.headers.get("content-type") || "";
  const r2Key = r2KeyFor(lens.slug);
  let publicUrl: string;

  try {
    if (contentType.startsWith("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });
      if (!ALLOWED_TYPES.has(file.type)) {
        return NextResponse.json({ error: `Unsupported type ${file.type}` }, { status: 415 });
      }
      if (file.size > MAX_RAW_BYTES) {
        return NextResponse.json({ error: "File too large" }, { status: 413 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      publicUrl = await processAndUpload(buffer, r2Key);
    } else if (contentType.startsWith("application/json")) {
      const body = await request.json();
      if (typeof body.url !== "string") {
        return NextResponse.json({ error: "Missing url" }, { status: 400 });
      }
      try { new URL(body.url); } catch {
        return NextResponse.json({ error: "Invalid url" }, { status: 400 });
      }
      publicUrl = await fetchAndUpload(body.url, r2Key);
    } else {
      return NextResponse.json({ error: "Unsupported Content-Type" }, { status: 415 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const updated = await appendImage(id, { src: publicUrl, alt: lens.name });
  return NextResponse.json({ images: updated });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await request.json();
  if (!Array.isArray(body.srcs) || body.srcs.some((s: unknown) => typeof s !== "string")) {
    return NextResponse.json({ error: "Body must be { srcs: string[] }" }, { status: 400 });
  }

  const lens = await loadLens(id);
  if (!lens) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const current = (Array.isArray(lens.images) ? lens.images : []) as ImageData[];
  const currentSrcs = current.map((i) => i.src).sort();
  const submittedSrcs = [...body.srcs].sort();
  if (currentSrcs.length !== submittedSrcs.length || currentSrcs.some((s, i) => s !== submittedSrcs[i])) {
    return NextResponse.json({ error: "Srcs do not match current images" }, { status: 409 });
  }
  const bySrc = new Map(current.map((i) => [i.src, i]));
  const reordered = body.srcs.map((s: string) => bySrc.get(s)!);
  await db.update(lenses).set({ images: reordered }).where(eq(lenses.id, id));
  return NextResponse.json({ images: reordered });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await request.json();
  if (typeof body.src !== "string") {
    return NextResponse.json({ error: "Body must be { src: string }" }, { status: 400 });
  }

  const lens = await loadLens(id);
  if (!lens) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const current = (Array.isArray(lens.images) ? lens.images : []) as ImageData[];
  const updated = current.filter((i) => i.src !== body.src);
  await db.update(lenses).set({ images: updated }).where(eq(lenses.id, id));
  return NextResponse.json({ images: updated });
}
