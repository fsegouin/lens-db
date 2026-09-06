import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { cameras } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { processAndUpload, fetchAndUpload } from "@/lib/r2-upload";
import { revalidateEntity } from "@/lib/revalidate-entity";
import type { ImageData } from "@/lib/image-types";
import { readProvenance, applyProvenance, PROVENANCE_MAX_LEN, type ImageProvenance } from "@/lib/image-provenance";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_RAW_BYTES = 10 * 1024 * 1024;

function r2KeyFor(slug: string): string {
  const tail = slug.replace(/^camera\//, "");
  return `cameras/${tail}/${Date.now()}-${nanoid(6)}.webp`;
}

async function loadCamera(id: number) {
  const row = await db.select().from(cameras).where(eq(cameras.id, id)).then((r) => r[0]);
  return row || null;
}

async function appendImage(id: number, image: ImageData): Promise<ImageData[]> {
  const cam = await loadCamera(id);
  if (!cam) throw new Error("not found");
  const current = (Array.isArray(cam.images) ? cam.images : []) as ImageData[];
  const updated = [...current, image];
  await db.update(cameras).set({ images: updated }).where(eq(cameras.id, id));
  revalidateEntity("camera", cam.slug);
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

  const cam = await loadCamera(id);
  if (!cam) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const contentType = request.headers.get("content-type") || "";
  const r2Key = r2KeyFor(cam.slug);
  let publicUrl: string;
  let provenance: ImageProvenance = {};

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
      const fields = Object.fromEntries(
        [...form.entries()].filter(([, v]) => typeof v === "string"),
      );
      const read = readProvenance(fields);
      if (!read.ok) return NextResponse.json({ error: read.error }, { status: 400 });
      provenance = read.value;
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
      const read = readProvenance(body);
      if (!read.ok) return NextResponse.json({ error: read.error }, { status: 400 });
      // The address it was fetched from is the one piece of provenance we
      // always have, so it is kept unless the admin named a better page. A
      // signed CDN address is left out: it expires, and it would be the link
      // behind the credit once one is added.
      const fallback = body.url.length <= PROVENANCE_MAX_LEN && !new URL(body.url).search ? body.url : "";
      provenance = { ...read.value, sourceUrl: read.value.sourceUrl || fallback };
      publicUrl = await fetchAndUpload(body.url, r2Key);
    } else {
      return NextResponse.json({ error: "Unsupported Content-Type" }, { status: 415 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const updated = await appendImage(id, applyProvenance({ src: publicUrl, alt: cam.name }, provenance));
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

  const cam = await loadCamera(id);
  if (!cam) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const current = (Array.isArray(cam.images) ? cam.images : []) as ImageData[];
  const currentSrcs = current.map((i) => i.src).sort();
  const submittedSrcs = [...body.srcs].sort();
  if (currentSrcs.length !== submittedSrcs.length || currentSrcs.some((s, i) => s !== submittedSrcs[i])) {
    return NextResponse.json({ error: "Srcs do not match current images" }, { status: 409 });
  }
  const bySrc = new Map(current.map((i) => [i.src, i]));
  const reordered = body.srcs.map((s: string) => bySrc.get(s)!);
  await db.update(cameras).set({ images: reordered }).where(eq(cameras.id, id));
  revalidateEntity("camera", cam.slug);
  return NextResponse.json({ images: reordered });
}

/** Set the source and licence of one image, matched by `src`. */
export async function PATCH(
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
    return NextResponse.json({ error: "Body must include src" }, { status: 400 });
  }
  const read = readProvenance(body);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: 400 });

  const cam = await loadCamera(id);
  if (!cam) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const current = (Array.isArray(cam.images) ? cam.images : []) as ImageData[];
  if (!current.some((i) => i.src === body.src)) {
    return NextResponse.json({ error: "No such image" }, { status: 404 });
  }
  const updated = current.map((i) => (i.src === body.src ? applyProvenance(i, read.value) : i));
  await db.update(cameras).set({ images: updated }).where(eq(cameras.id, id));
  revalidateEntity("camera", cam.slug);
  return NextResponse.json({ images: updated });
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

  const cam = await loadCamera(id);
  if (!cam) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const current = (Array.isArray(cam.images) ? cam.images : []) as ImageData[];
  const updated = current.filter((i) => i.src !== body.src);
  await db.update(cameras).set({ images: updated }).where(eq(cameras.id, id));
  revalidateEntity("camera", cam.slug);
  return NextResponse.json({ images: updated });
}
