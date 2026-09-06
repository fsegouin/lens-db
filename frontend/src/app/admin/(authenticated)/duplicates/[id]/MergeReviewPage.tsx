"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  IMAGES_KEY,
  MERGE_FIELDS,
  SPECS_PREFIX,
  defaultTake,
  imagesOf,
  isEmptyValue,
  newImages,
  specsOf,
  takeValue,
  type EntityRecord,
  type ImageEntry,
  type MergeEntityType,
  type MergeField,
} from "@/lib/entity-merge";

type Citation = { sourceName: string; sourceUrl: string | null };

type Side = {
  record: EntityRecord;
  citations: Record<string, Citation>;
};

type Payload = {
  flag: {
    id: number;
    sourceEntityId: number;
    targetEntityId: number;
    reason: string | null;
    status: string;
  };
  entityType: MergeEntityType;
  source: Side;
  target: Side;
  refs: { systems: Record<string, string>; lenses: Record<string, string> };
};

type Row = {
  key: string;
  label: string;
  kind: MergeField["kind"] | "spec" | "images";
  /** What the keeper would get if this row is taken. */
  left: unknown;
  right: unknown;
  same: boolean;
  /** False when the left side has nothing to offer. */
  takeable: boolean;
};

const GRID = "grid grid-cols-[8.5rem_1fr_2.5rem_1fr] items-start gap-x-3 lg:grid-cols-[11rem_1fr_3rem_1fr] lg:gap-x-4";

function entityHref(type: MergeEntityType, slug: unknown): string {
  return `${type === "lens" ? "/lenses" : "/cameras"}/${String(slug)}`;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function buildRows(data: Payload, keeper: EntityRecord, loser: EntityRecord, take: Set<string>): Row[] {
  const rows: Row[] = [];
  const taken = [...take];
  for (const field of MERGE_FIELDS[data.entityType]) {
    const left = takeValue(data.entityType, field.key, keeper, loser, taken);
    const right = keeper[field.key];
    if (isEmptyValue(left) && isEmptyValue(right)) continue;
    rows.push({
      key: field.key,
      label: field.label,
      kind: field.kind,
      left,
      right,
      same: sameValue(left, right),
      takeable: !isEmptyValue(left),
    });
  }
  const keeperSpecs = specsOf(keeper);
  const loserSpecs = specsOf(loser);
  const specKeys = [...new Set([...Object.keys(keeperSpecs), ...Object.keys(loserSpecs)])].sort(
    (a, b) => a.localeCompare(b),
  );
  for (const specKey of specKeys) {
    const left = loserSpecs[specKey];
    const right = keeperSpecs[specKey];
    rows.push({
      key: SPECS_PREFIX + specKey,
      label: specKey,
      kind: "spec",
      left,
      right,
      same: sameValue(left, right),
      takeable: !isEmptyValue(left),
    });
  }
  const loserImages = imagesOf(loser);
  const extra = newImages(keeper, loser);
  if (imagesOf(keeper).length > 0 || loserImages.length > 0) {
    rows.push({
      key: IMAGES_KEY,
      label: "Photos",
      kind: "images",
      left: loserImages,
      right: imagesOf(keeper),
      same: loserImages.length > 0 && extra.length === 0,
      takeable: extra.length > 0,
    });
  }
  return rows;
}

function ValueText({
  value,
  row,
  refs,
  muted,
}: {
  value: unknown;
  row: Row;
  refs: Payload["refs"];
  muted?: boolean;
}) {
  const cls = muted ? "text-zinc-400 dark:text-zinc-500" : "text-zinc-900 dark:text-zinc-100";
  if (isEmptyValue(value)) return <span className="text-zinc-400 italic dark:text-zinc-500">empty</span>;
  if (row.kind === "boolean") return <span className={cls}>{value ? "Yes" : "No"}</span>;
  if (row.kind === "ref") {
    const id = String(value);
    const name = row.key === "systemId" ? refs.systems[id] : refs.lenses[id];
    return <span className={cls}>{name ?? `#${id}`}</span>;
  }
  if (row.kind === "longtext") {
    return (
      <div className={`max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed ${cls}`}>
        {String(value)}
      </div>
    );
  }
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^https?:\/\//.test(text)) {
    return (
      <a href={text} target="_blank" rel="noreferrer" className={`break-all underline-offset-2 hover:underline ${cls}`}>
        {text}
      </a>
    );
  }
  return <span className={`break-words ${cls}`}>{text}</span>;
}

function Thumbs({
  images,
  dim,
  highlight,
}: {
  images: ImageEntry[];
  /** Photos the other side already has. */
  dim?: Set<string>;
  /** Photos arriving with this merge. */
  highlight?: Set<string>;
}) {
  if (images.length === 0) return <span className="text-zinc-400 italic dark:text-zinc-500">none</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {images.map((img) => {
        const dimmed = dim?.has(img.src);
        const lit = highlight?.has(img.src);
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={img.src}
            src={img.src}
            alt={typeof img.alt === "string" ? img.alt : ""}
            title={dimmed ? "The keeper already has this photo" : lit ? "Arriving with this merge" : undefined}
            className={`h-16 w-16 rounded border object-cover ${
              lit
                ? "border-emerald-500 ring-2 ring-emerald-300 dark:border-emerald-400 dark:ring-emerald-700"
                : "border-zinc-200 dark:border-zinc-700"
            } ${dimmed ? "opacity-40" : ""}`}
          />
        );
      })}
    </div>
  );
}

function SourceLine({ citation }: { citation: Citation | undefined }) {
  if (!citation) return null;
  const body = citation.sourceUrl ? (
    <a href={citation.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline">
      {citation.sourceName}
    </a>
  ) : (
    citation.sourceName
  );
  return <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">via {body}</div>;
}

export default function MergeReviewPage({ flagId }: { flagId: number }) {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which of the two rows survives. The flag's target is the default, as the
  // old one-click buttons had it; a resolved flag shows whichever one did.
  const [keepSide, setKeepSide] = useState<"target" | "source">("target");
  const [take, setTake] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"confirm" | "dismiss" | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/duplicates/${flagId}`);
        const json = (await res.json()) as Payload & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? "Could not load this flag");
          return;
        }
        if (json.flag.status !== "pending" && json.target.record.mergedIntoId === json.source.record.id) {
          setKeepSide("source");
        }
        setData(json);
      } catch {
        if (!cancelled) setError("Could not load this flag");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [flagId]);

  const pending = data?.flag.status === "pending";
  const keeperSide = data ? (keepSide === "target" ? data.target : data.source) : null;
  const loserSide = data ? (keepSide === "target" ? data.source : data.target) : null;
  const keeper = keeperSide?.record ?? null;
  const loser = loserSide?.record ?? null;

  const rows = useMemo(
    () => (data && keeper && loser ? buildRows(data, keeper, loser, take) : []),
    [data, keeper, loser, take],
  );

  const resetToDefault = useCallback(() => {
    if (!data || !keeper || !loser) return;
    setTake(new Set(pending ? defaultTake(data.entityType, keeper, loser) : []));
  }, [data, keeper, loser, pending]);

  // Recompute the default whenever the pair or the keeper side changes.
  useEffect(() => {
    resetToDefault();
  }, [resetToDefault]);

  function toggle(key: string) {
    setTake((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function resolve(action: "confirm" | "dismiss") {
    if (!data || !keeper || !loser) return;
    setBusy(action);
    try {
      const res = await fetch(`/api/admin/duplicates/${flagId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "confirm"
            ? { action, keepEntityId: keeper.id, take: [...take] }
            : { action },
        ),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "That did not save");
        return;
      }
      if (action === "confirm") {
        const n = (json.taken as string[]).length;
        toast.success(
          n === 0
            ? `Merged. "${String(keeper.name)}" kept every field as it was.`
            : `Merged. "${String(keeper.name)}" took ${n} field${n === 1 ? "" : "s"}.`,
        );
      } else {
        toast.success("Dismissed. The two stay separate.");
      }
      router.push("/admin/duplicates");
    } catch {
      toast.error("That did not save");
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return (
      <div className="space-y-4 p-6">
        <BackLink />
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }
  if (!data || !keeper || !loser || !keeperSide || !loserSide) {
    return (
      <div className="space-y-4 p-6">
        <BackLink />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const active = rows.filter((r) => r.takeable && !r.same);
  const takeableKeys = active.map((r) => r.key);
  const fills = active.filter((r) => take.has(r.key) && isEmptyValue(r.right)).length;
  const replaces = active.filter((r) => take.has(r.key) && !isEmptyValue(r.right)).length;
  const nameRow = rows.find((r) => r.key === "name");
  const finalName = nameRow && take.has("name") && !nameRow.same ? String(nameRow.left) : String(keeper.name);
  const relations =
    data.entityType === "lens"
      ? "its ratings, collection and series memberships, tags and kit entries"
      : "its ratings, lens compatibility rows and kit entries";

  return (
    <div className="space-y-6 p-6">
      <BackLink />

      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          {pending ? "Merge duplicates" : "Duplicate flag"}
        </h1>
        {pending ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            The right column is what survives. Tick a row to bring that value across from the left;
            everything unticked stays as the keeper has it. The record on the left is retired behind a
            redirect, and {relations} move to the keeper either way.
          </p>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {data.flag.status === "confirmed"
              ? "This pair was merged. What each row took is in the keeper's revision history; the values shown are as they stand now."
              : "This pair was dismissed as not the same product. Both records stay as they are."}
          </p>
        )}
        {data.flag.reason && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Reason given: {data.flag.reason}</p>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <div className="min-w-[44rem]">
          {/* Column headers */}
          <div className={`${GRID} border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/60`}>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Field</div>
            <SideHeader
              title={pending ? "Retire" : data.flag.status === "confirmed" ? "Retired" : "Flagged"}
              record={loser}
              type={data.entityType}
              tone="muted"
            />
            <div />
            <SideHeader
              title={pending ? "Keep" : data.flag.status === "confirmed" ? "Kept" : "Flagged against"}
              record={keeper}
              type={data.entityType}
              tone="strong"
            />
          </div>

          {/* Toolbar */}
          {pending && (
            <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-4 py-2 text-sm dark:border-zinc-800">
              <Button
                variant="outline"
                size="xs"
                onClick={() => setKeepSide((s) => (s === "target" ? "source" : "target"))}
                disabled={busy !== null}
              >
                Swap sides
              </Button>
              <span className="mx-1 text-zinc-300 dark:text-zinc-700">|</span>
              <span className="text-zinc-500 dark:text-zinc-400">From the left, bring:</span>
              <Button variant="outline" size="xs" onClick={resetToDefault} disabled={busy !== null}>
                What the keeper lacks
              </Button>
              <Button
                variant="outline"
                size="xs"
                onClick={() => setTake(new Set(takeableKeys))}
                disabled={busy !== null}
              >
                Everything
              </Button>
              <Button variant="outline" size="xs" onClick={() => setTake(new Set())} disabled={busy !== null}>
                Nothing
              </Button>
              <span className="ml-auto text-zinc-500 dark:text-zinc-400" aria-live="polite">
                {fills} fill{fills === 1 ? "s a gap" : " gaps"}
                {replaces > 0 && (
                  <>
                    , <span className="font-medium text-amber-700 dark:text-amber-400">{replaces} replace{replaces === 1 ? "s" : ""}</span>
                  </>
                )}
                {" "}· {takeableKeys.length} on offer
              </span>
            </div>
          )}

          {rows.map((row) => {
            const taking = pending && row.takeable && !row.same && take.has(row.key);
            const replacing = taking && !isEmptyValue(row.right);
            const leftCite = row.kind === "images" ? undefined : loserSide.citations[row.key];
            const rightCite = row.kind === "images" ? undefined : keeperSide.citations[row.key];
            const inputId = `take-${row.key.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
            const canTick = pending && row.takeable && !row.same;
            return (
              <div
                key={row.key}
                className={`${GRID} border-b border-zinc-100 px-4 py-2.5 text-sm last:border-b-0 dark:border-zinc-800/60 ${
                  row.same ? "bg-zinc-50/60 dark:bg-zinc-900/30" : ""
                }`}
              >
                {canTick ? (
                  <label htmlFor={inputId} className="cursor-pointer pt-0.5 font-medium text-zinc-700 dark:text-zinc-300">
                    {row.label}
                    {row.kind === "spec" && <SpecBadge />}
                  </label>
                ) : (
                  <div className="pt-0.5 font-medium text-zinc-700 dark:text-zinc-300">
                    {row.label}
                    {row.kind === "spec" && <SpecBadge />}
                  </div>
                )}

                {/* Left: the record being retired */}
                <div className={row.same ? "opacity-60" : ""}>
                  {row.kind === "images" ? (
                    <Thumbs images={row.left as ImageEntry[]} dim={new Set(imagesOf(keeper).map((i) => i.src))} />
                  ) : (
                    <ValueText value={row.left} row={row} refs={data.refs} muted={!row.takeable} />
                  )}
                  <SourceLine citation={leftCite} />
                </div>

                {/* Middle: the control */}
                <div className="flex justify-center pt-0.5">
                  {row.same ? (
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                      <span aria-hidden>same</span>
                      <span className="sr-only">Both records agree</span>
                    </span>
                  ) : canTick ? (
                    <input
                      id={inputId}
                      type="checkbox"
                      className="size-4 cursor-pointer accent-zinc-900 dark:accent-zinc-100"
                      checked={taking}
                      onChange={() => toggle(row.key)}
                      disabled={busy !== null}
                      aria-label={`Take ${row.label} from ${String(loser.name)}`}
                    />
                  ) : (
                    <span className="text-zinc-300 dark:text-zinc-700">
                      <span aria-hidden>·</span>
                      <span className="sr-only">{row.takeable ? "Resolved" : "Nothing to take"}</span>
                    </span>
                  )}
                </div>

                {/* Right: the keeper, showing what it will hold after the merge */}
                <div>
                  {row.kind === "images" ? (
                    <Thumbs
                      images={taking ? [...(row.right as ImageEntry[]), ...newImages(keeper, loser)] : (row.right as ImageEntry[])}
                      highlight={taking ? new Set(newImages(keeper, loser).map((i) => i.src)) : undefined}
                    />
                  ) : taking ? (
                    <div className="space-y-1">
                      <div
                        className={`rounded border-l-2 px-1.5 py-0.5 ${
                          replacing
                            ? "border-amber-500 bg-amber-50 ring-1 ring-amber-200 dark:border-amber-400 dark:bg-amber-900/30 dark:ring-amber-700"
                            : "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-200 dark:border-emerald-400 dark:bg-emerald-900/40 dark:ring-emerald-600"
                        }`}
                      >
                        <ValueText value={row.left} row={row} refs={data.refs} />
                      </div>
                      {replacing && (
                        <div className="text-xs text-zinc-400 line-through dark:text-zinc-500">
                          <ValueText value={row.right} row={row} refs={data.refs} muted />
                        </div>
                      )}
                    </div>
                  ) : (
                    <ValueText value={row.right} row={row} refs={data.refs} />
                  )}
                  <SourceLine citation={taking ? leftCite : rightCite} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {pending && (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => resolve("confirm")} disabled={busy !== null}>
            {busy === "confirm" ? "Merging..." : <>Merge into &ldquo;{finalName}&rdquo;</>}
          </Button>
          <Button variant="ghost" onClick={() => resolve("dismiss")} disabled={busy !== null}>
            {busy === "dismiss" ? "Saving..." : "Not duplicates"}
          </Button>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            &ldquo;{String(loser.name)}&rdquo; will redirect to the keeper. Nothing is deleted.
            {replaces > 0 && (
              <>
                {" "}
                <span className="font-medium text-amber-700 dark:text-amber-400">
                  {replaces} value{replaces === 1 ? "" : "s"} the keeper already had will be replaced.
                </span>
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function SpecBadge() {
  return (
    <span className="ml-1 text-[10px] font-normal uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      spec
    </span>
  );
}

function BackLink() {
  return (
    <Link href="/admin/duplicates" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
      &larr; Duplicate flags
    </Link>
  );
}

function SideHeader({
  title,
  record,
  type,
  tone,
}: {
  title: string;
  record: EntityRecord;
  type: MergeEntityType;
  tone: "muted" | "strong";
}) {
  return (
    <div className="min-w-0">
      <div
        className={`text-xs font-medium uppercase tracking-wide ${
          tone === "strong" ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-500 dark:text-zinc-400"
        }`}
      >
        {title}
      </div>
      <Link
        href={entityHref(type, record.slug)}
        target="_blank"
        className="block truncate font-semibold text-zinc-900 hover:underline dark:text-zinc-100"
        title={String(record.name)}
      >
        {String(record.name)}
      </Link>
      <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
        #{String(record.id)} · /{String(record.slug)}
        {typeof record.viewCount === "number" && ` · ${record.viewCount} views`}
      </div>
    </div>
  );
}
