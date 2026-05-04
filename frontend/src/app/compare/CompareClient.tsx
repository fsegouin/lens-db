"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { formatMagnification } from "@/lib/format-magnification";
import { firstImageSrc } from "@/lib/image-utils";
import { trackEvent } from "@/lib/analytics";
import { useEntitySearch, type EntityType } from "@/hooks/use-entity-search";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type ItemType = "lens" | "camera";

type Lens = {
  id: number;
  name: string;
  slug: string;
  brand: string | null;
  focalLengthMin: number | null;
  focalLengthMax: number | null;
  apertureMin: number | null;
  apertureMax: number | null;
  weightG: number | null;
  filterSizeMm: number | null;
  minFocusDistanceM: number | null;
  maxMagnification: number | null;
  lensElements: number | null;
  lensGroups: number | null;
  diaphragmBlades: number | null;
  yearIntroduced: number | null;
  isZoom: boolean | null;
  isMacro: boolean | null;
  isPrime: boolean | null;
  hasStabilization: boolean | null;
  hasAutofocus: boolean | null;
  lensType: string | null;
  era: string | null;
  productionStatus: string | null;
  specs: Record<string, string> | null;
  images: unknown;
};

type Camera = {
  id: number;
  name: string;
  slug: string;
  sensorType: string | null;
  sensorSize: string | null;
  megapixels: number | null;
  resolution: string | null;
  yearIntroduced: number | null;
  bodyType: string | null;
  weightG: number | null;
  specs: Record<string, string> | null;
  images: unknown;
};

type SelectedItem =
  | { type: "lens"; data: Lens }
  | { type: "camera"; data: Camera };

type SpecRow = {
  label: string;
  group: string;
  value1: string;
  value2: string;
  // Higher is better => "max", lower is better => "min", boolean (yes wins) => "yes", null => no winner
  preferred?: "max" | "min" | "yes";
  numeric1?: number | null;
  numeric2?: number | null;
};

const EM_DASH = "—";

function lensRows(a: Lens, b: Lens): SpecRow[] {
  const row = (
    label: string,
    group: string,
    value1: string,
    value2: string,
    preferred?: SpecRow["preferred"],
    numeric1?: number | null,
    numeric2?: number | null,
  ): SpecRow => ({ label, group, value1, value2, preferred, numeric1, numeric2 });

  const focal = (l: Lens) =>
    l.focalLengthMin
      ? l.focalLengthMin === l.focalLengthMax
        ? `${l.focalLengthMin}mm`
        : `${l.focalLengthMin}–${l.focalLengthMax}mm`
      : EM_DASH;

  return [
    row("Brand", "Identity", a.brand || EM_DASH, b.brand || EM_DASH),
    row("Type", "Identity", a.lensType || EM_DASH, b.lensType || EM_DASH),
    row("Focal length", "Optical", focal(a), focal(b)),
    row(
      "Max aperture",
      "Optical",
      a.apertureMin ? `f/${a.apertureMin}` : EM_DASH,
      b.apertureMin ? `f/${b.apertureMin}` : EM_DASH,
      "min",
      a.apertureMin,
      b.apertureMin,
    ),
    row(
      "Min aperture",
      "Optical",
      a.apertureMax ? `f/${a.apertureMax}` : EM_DASH,
      b.apertureMax ? `f/${b.apertureMax}` : EM_DASH,
      "max",
      a.apertureMax,
      b.apertureMax,
    ),
    row(
      "Lens elements",
      "Optical",
      a.lensElements?.toString() || EM_DASH,
      b.lensElements?.toString() || EM_DASH,
    ),
    row(
      "Lens groups",
      "Optical",
      a.lensGroups?.toString() || EM_DASH,
      b.lensGroups?.toString() || EM_DASH,
    ),
    row(
      "Diaphragm blades",
      "Optical",
      a.diaphragmBlades?.toString() || EM_DASH,
      b.diaphragmBlades?.toString() || EM_DASH,
      "max",
      a.diaphragmBlades,
      b.diaphragmBlades,
    ),
    row(
      "Weight",
      "Physical",
      a.weightG ? `${a.weightG}g` : EM_DASH,
      b.weightG ? `${b.weightG}g` : EM_DASH,
      "min",
      a.weightG,
      b.weightG,
    ),
    row(
      "Filter size",
      "Physical",
      a.filterSizeMm ? `${a.filterSizeMm}mm` : EM_DASH,
      b.filterSizeMm ? `${b.filterSizeMm}mm` : EM_DASH,
    ),
    row(
      "Min focus distance",
      "Physical",
      a.minFocusDistanceM ? `${a.minFocusDistanceM}m` : EM_DASH,
      b.minFocusDistanceM ? `${b.minFocusDistanceM}m` : EM_DASH,
      "min",
      a.minFocusDistanceM,
      b.minFocusDistanceM,
    ),
    row(
      "Max magnification",
      "Physical",
      formatMagnification(a.maxMagnification),
      formatMagnification(b.maxMagnification),
      "max",
      a.maxMagnification,
      b.maxMagnification,
    ),
    row("Autofocus", "Features", a.hasAutofocus ? "Yes" : "No", b.hasAutofocus ? "Yes" : "No", "yes"),
    row(
      "Stabilization",
      "Features",
      a.hasStabilization ? "Yes" : "No",
      b.hasStabilization ? "Yes" : "No",
      "yes",
    ),
    row(
      "Year",
      "Market",
      a.yearIntroduced?.toString() || EM_DASH,
      b.yearIntroduced?.toString() || EM_DASH,
      "max",
      a.yearIntroduced,
      b.yearIntroduced,
    ),
    row("Status", "Market", a.productionStatus || EM_DASH, b.productionStatus || EM_DASH),
    row("Era", "Market", a.era || EM_DASH, b.era || EM_DASH),
  ];
}

function cameraSpec(c: Camera, ...keys: string[]): string {
  const specs = (c.specs || {}) as Record<string, string>;
  for (const k of keys) {
    if (specs[k]) return specs[k];
  }
  return EM_DASH;
}

function cameraRows(a: Camera, b: Camera): SpecRow[] {
  const row = (
    label: string,
    group: string,
    value1: string,
    value2: string,
    preferred?: SpecRow["preferred"],
    numeric1?: number | null,
    numeric2?: number | null,
  ): SpecRow => ({ label, group, value1, value2, preferred, numeric1, numeric2 });

  return [
    row("Type", "Identity", cameraSpec(a, "Type"), cameraSpec(b, "Type")),
    row("Model", "Identity", cameraSpec(a, "Model"), cameraSpec(b, "Model")),
    row("Film type", "Identity", cameraSpec(a, "Film type"), cameraSpec(b, "Film type")),
    row(
      "Imaging sensor",
      "Sensor",
      cameraSpec(a, "Imaging sensor", "Imaging plane"),
      cameraSpec(b, "Imaging sensor", "Imaging plane"),
    ),
    row(
      "Sensor size",
      "Sensor",
      a.sensorSize || cameraSpec(a, "Maximum format"),
      b.sensorSize || cameraSpec(b, "Maximum format"),
    ),
    row(
      "Megapixels",
      "Sensor",
      a.megapixels ? `${a.megapixels} MP` : EM_DASH,
      b.megapixels ? `${b.megapixels} MP` : EM_DASH,
      "max",
      a.megapixels,
      b.megapixels,
    ),
    row("Resolution", "Sensor", a.resolution || EM_DASH, b.resolution || EM_DASH),
    row("Crop factor", "Sensor", cameraSpec(a, "Crop factor"), cameraSpec(b, "Crop factor")),
    row(
      "Image stabilization",
      "Body",
      cameraSpec(a, "Sensor-shift image stabilization"),
      cameraSpec(b, "Sensor-shift image stabilization"),
    ),
    row("Speeds", "Body", cameraSpec(a, "Speeds"), cameraSpec(b, "Speeds")),
    row("Exposure modes", "Body", cameraSpec(a, "Exposure modes"), cameraSpec(b, "Exposure modes")),
    row("Dimensions", "Body", cameraSpec(a, "Dimensions"), cameraSpec(b, "Dimensions")),
    row("Body type", "Body", a.bodyType || EM_DASH, b.bodyType || EM_DASH),
    row(
      "Weight",
      "Physical",
      a.weightG ? `${a.weightG}g` : EM_DASH,
      b.weightG ? `${b.weightG}g` : EM_DASH,
      "min",
      a.weightG,
      b.weightG,
    ),
    row(
      "Year",
      "Market",
      a.yearIntroduced?.toString() || EM_DASH,
      b.yearIntroduced?.toString() || EM_DASH,
      "max",
      a.yearIntroduced,
      b.yearIntroduced,
    ),
  ];
}

type WinnerSide = "a" | "b" | null;

function rowWinner(row: SpecRow): WinnerSide {
  if (!row.preferred) return null;
  if (row.value1 === EM_DASH || row.value2 === EM_DASH) return null;
  if (row.value1 === row.value2) return null;
  if (row.preferred === "yes") {
    if (row.value1 === "Yes" && row.value2 !== "Yes") return "a";
    if (row.value2 === "Yes" && row.value1 !== "Yes") return "b";
    return null;
  }
  if (row.numeric1 == null || row.numeric2 == null) return null;
  if (row.preferred === "max") {
    return row.numeric1 > row.numeric2 ? "a" : row.numeric1 < row.numeric2 ? "b" : null;
  }
  return row.numeric1 < row.numeric2 ? "a" : row.numeric1 > row.numeric2 ? "b" : null;
}

function summarizeWinners(rows: SpecRow[]) {
  let aWins = 0;
  let bWins = 0;
  let differences = 0;
  let matches = 0;
  for (const r of rows) {
    if (r.value1 === EM_DASH && r.value2 === EM_DASH) continue;
    if (r.value1 === r.value2) {
      matches++;
      continue;
    }
    differences++;
    const w = rowWinner(r);
    if (w === "a") aWins++;
    else if (w === "b") bWins++;
  }
  return { aWins, bWins, differences, matches };
}

function lensIdLabel(l: Lens): string {
  return `LDB 06-${String(l.id).padStart(5, "0")}`;
}

function cameraIdLabel(c: Camera): string {
  return `LDB 02-${String(c.id).padStart(5, "0")}`;
}

function entityIdLabel(item: SelectedItem): string {
  return item.type === "lens" ? lensIdLabel(item.data) : cameraIdLabel(item.data);
}

export default function CompareClient() {
  const [item1, setItem1] = useState<SelectedItem | null>(null);
  const [item2, setItem2] = useState<SelectedItem | null>(null);
  const trackedRef = useRef<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawType = searchParams.get("type");
  const urlType: ItemType | null =
    rawType === "lens" || rawType === "camera" ? rawType : null;
  const lockedType: ItemType | null = item1?.type ?? item2?.type ?? urlType;

  const initRef = useRef(false);

  useEffect(() => {
    if (!initRef.current) return;
    const params = new URLSearchParams();
    const type = item1?.type ?? item2?.type;
    if (type) params.set("type", type);
    if (item1) params.set("item1", item1.data.slug);
    if (item2) params.set("item2", item2.data.slug);
    const qs = params.toString();
    router.replace(qs ? `/compare?${qs}` : "/compare", { scroll: false });
  }, [item1, item2, router]);

  useEffect(() => {
    if (initRef.current) return;
    const slug1 = searchParams.get("item1") || searchParams.get("lens1");
    const slug2 = searchParams.get("item2") || searchParams.get("lens2");
    if (!slug1 && !slug2) {
      initRef.current = true;
      return;
    }
    if (!urlType) return;
    initRef.current = true;

    async function fetchBySlug(kind: ItemType, slug: string) {
      try {
        const endpoint = kind === "lens" ? "lenses" : "cameras";
        const res = await fetch(`/api/${endpoint}?slug=${encodeURIComponent(slug)}&cursor=0`);
        const data = await res.json();
        const first = data.items?.[0];
        return (kind === "lens" ? first?.lens : first?.camera) || null;
      } catch {
        return null;
      }
    }

    const toSelected = (data: unknown): SelectedItem =>
      urlType === "lens"
        ? { type: "lens", data: data as Lens }
        : { type: "camera", data: data as Camera };

    Promise.all([
      slug1 ? fetchBySlug(urlType, slug1) : null,
      slug2 ? fetchBySlug(urlType, slug2) : null,
    ]).then(([data1, data2]) => {
      if (data1) setItem1(toSelected(data1));
      if (data2) setItem2(toSelected(data2));
    });
  }, [searchParams, urlType]);

  useEffect(() => {
    if (!item1 || !item2) return;
    if (item1.type !== item2.type) {
      toast.error("Please compare two items of the same type");
      return;
    }
    const key = `${item1.type}-${Math.min(item1.data.id, item2.data.id)}-${Math.max(item1.data.id, item2.data.id)}`;
    if (trackedRef.current === key) return;
    trackedRef.current = key;

    const [slugA, slugB] =
      item1.data.id < item2.data.id
        ? [item1.data.slug, item2.data.slug]
        : [item2.data.slug, item1.data.slug];
    trackEvent("comparison_start", { entity_type: item1.type, slug_1: slugA, slug_2: slugB });

    fetch("/api/comparisons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: item1.type, id1: item1.data.id, id2: item2.data.id }),
    }).catch(() => toast.error("Could not record comparison"));
  }, [item1, item2]);

  const rows: SpecRow[] = useMemo(() => {
    if (!item1 || !item2 || item1.type !== item2.type) return [];
    if (item1.type === "lens") return lensRows(item1.data as Lens, item2.data as Lens);
    return cameraRows(item1.data as Camera, item2.data as Camera);
  }, [item1, item2]);

  const summary = useMemo(() => summarizeWinners(rows), [rows]);

  const swap = () => {
    setItem1(item2);
    setItem2(item1);
  };

  const ready = item1 && item2 && item1.type === item2.type;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-6">
        <div>
          <h1 className="text-[36px] font-medium leading-none -tracking-[0.025em]">
            Side by <em className="hero-title-em">side</em>
          </h1>
          <div className="mono mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--fg-dim)]">
            {ready ? (
              <>
                <span>
                  Comparing <span className="text-foreground">2</span>{" "}
                  {item1.type === "lens" ? "lenses" : "cameras"} across{" "}
                  <span className="text-foreground">{rows.length}</span> dimensions
                </span>
                <span className="text-[var(--fg-faint)]">·</span>
                <span>
                  <span className="text-[var(--hot)]">●</span>{" "}
                  <span className="text-foreground">{summary.differences}</span> differences
                </span>
                <span className="text-[var(--fg-faint)]">·</span>
                <span>
                  <span className="text-[var(--pos)]">●</span>{" "}
                  <span className="text-foreground">{summary.matches}</span> matches
                </span>
              </>
            ) : (
              <span>Pick two lenses or two cameras to compare them across every spec.</span>
            )}
          </div>
        </div>
        {ready && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={swap}
              className="mono rounded-lg border border-border bg-background px-3 py-2 text-[11px] uppercase tracking-[0.06em] text-[var(--fg-mid)] transition-colors hover:border-[var(--line-strong)] hover:text-foreground"
            >
              ⇄ Swap
            </button>
          </div>
        )}
      </div>

      <Bench
        item1={item1}
        item2={item2}
        lockedType={lockedType}
        onSelect1={setItem1}
        onSelect2={setItem2}
      />

      {ready && item1.type === "lens" && item2.type === "lens" && (
        <VizRow a={item1.data as Lens} b={item2.data as Lens} />
      )}
      {ready && item1.type === "camera" && item2.type === "camera" && (
        <CameraVizRow a={item1.data as Camera} b={item2.data as Camera} />
      )}

      {ready ? (
        <CompareGrid item1={item1} item2={item2} rows={rows} />
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-background py-20 text-center">
          <div className="mono mb-2 text-[10px] uppercase tracking-[0.1em] text-[var(--fg-faint)]">
            empty bench
          </div>
          <div className="text-[14px] text-[var(--fg-mid)]">
            Pick two items above to compare specs
          </div>
        </div>
      )}

      {ready && <SummaryFooter item1={item1} item2={item2} summary={summary} rows={rows} />}
    </div>
  );
}

function Bench({
  item1,
  item2,
  lockedType,
  onSelect1,
  onSelect2,
}: {
  item1: SelectedItem | null;
  item2: SelectedItem | null;
  lockedType: ItemType | null;
  onSelect1: (item: SelectedItem | null) => void;
  onSelect2: (item: SelectedItem | null) => void;
}) {
  return (
    <div className="relative grid grid-cols-1 overflow-hidden rounded-xl border border-border bg-background sm:grid-cols-[1fr_60px_1fr]">
      <BenchSlot
        pin="A"
        accent="default"
        item={item1}
        lockedType={lockedType}
        onSelect={onSelect1}
      />
      <div className="hidden flex-col items-center justify-center gap-2 sm:flex">
        <div className="flex-1 w-px bg-gradient-to-b from-transparent via-[var(--line-strong)] to-transparent" />
        <div className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--fg-faint)]">VS</div>
        <div className="flex-1 w-px bg-gradient-to-b from-transparent via-[var(--line-strong)] to-transparent" />
      </div>
      <div className="flex items-center justify-center border-y border-border py-2 sm:hidden">
        <div className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--fg-faint)]">VS</div>
      </div>
      <BenchSlot
        pin="B"
        accent="pos"
        item={item2}
        lockedType={lockedType}
        onSelect={onSelect2}
      />
    </div>
  );
}

function BenchSlot({
  pin,
  accent,
  item,
  lockedType,
  onSelect,
}: {
  pin: "A" | "B";
  accent: "default" | "pos";
  item: SelectedItem | null;
  lockedType: ItemType | null;
  onSelect: (item: SelectedItem | null) => void;
}) {
  const pinClass =
    accent === "pos"
      ? "border-[var(--pos)] text-[var(--pos)] bg-[color-mix(in_oklch,var(--pos)_15%,var(--surface-sunk))]"
      : "border-[var(--line-strong)] text-foreground bg-[var(--surface-sunk)]";

  return (
    <div className="relative flex flex-col gap-3.5 p-5">
      <div
        className={`mono absolute right-4 top-4 flex h-[22px] w-[22px] items-center justify-center rounded-full border text-[10px] font-semibold ${pinClass}`}
        aria-hidden="true"
      >
        {pin}
      </div>

      <ItemSearch lockedType={lockedType} selected={item} onSelect={onSelect} />

      {item ? (
        <div className="grid grid-cols-[110px_1fr] items-stretch gap-3.5">
          <BenchMedia item={item} />
          <QuickSpecs item={item} />
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-[var(--surface-soft)] py-12 text-center">
          <div className="mono text-[10px] uppercase tracking-[0.1em] text-[var(--fg-faint)]">
            slot empty
          </div>
        </div>
      )}
    </div>
  );
}

function QuickSpecs({ item }: { item: SelectedItem }) {
  if (item.type === "lens") {
    const l = item.data as Lens;
    const focal = l.focalLengthMin
      ? l.focalLengthMin === l.focalLengthMax
        ? `${l.focalLengthMin}`
        : `${l.focalLengthMin}–${l.focalLengthMax}`
      : "—";
    return (
      <div className="grid grid-cols-2 content-center gap-x-4">
        <BenchQS label="ƒ max" value={l.apertureMin ? `${l.apertureMin}` : "—"} />
        <BenchQS label="Focal" value={focal} unit="mm" />
        <BenchQS label="Weight" value={l.weightG ? `${l.weightG}` : "—"} unit="g" />
        <BenchQS label="Year" value={l.yearIntroduced ? `${l.yearIntroduced}` : "—"} />
      </div>
    );
  }
  const c = item.data as Camera;
  return (
    <div className="grid grid-cols-2 content-center gap-x-4">
      <BenchQS label="MP" value={c.megapixels ? `${c.megapixels}` : "—"} />
      <BenchQS
        label="Sensor"
        value={c.sensorSize ? c.sensorSize.split(" ")[0].slice(0, 6) : "—"}
      />
      <BenchQS label="Weight" value={c.weightG ? `${c.weightG}` : "—"} unit="g" />
      <BenchQS label="Year" value={c.yearIntroduced ? `${c.yearIntroduced}` : "—"} />
    </div>
  );
}

function BenchQS({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="mono flex items-baseline justify-between border-b border-dashed border-border py-[5px] text-[11px]">
      <span className="tracking-[0.04em] text-[var(--fg-faint)]">{label}</span>
      <span>
        <span className="text-[13px] font-medium text-foreground">{value}</span>
        {unit && <span className="ml-[1px] text-[10px] text-[var(--fg-dim)]">{unit}</span>}
      </span>
    </div>
  );
}

function BenchMedia({ item }: { item: SelectedItem }) {
  const src = firstImageSrc(item.data.images);
  return (
    <div className="relative flex items-center justify-center overflow-hidden rounded-lg border border-border bg-[var(--surface-soft)] p-1.5">
      {src ? (
        <Image
          src={src}
          alt={item.data.name}
          fill
          className="object-contain p-2"
          sizes="110px"
        />
      ) : item.type === "lens" ? (
        <LensSilhouette />
      ) : (
        <CameraSilhouette />
      )}
    </div>
  );
}

function LensSilhouette() {
  return (
    <svg viewBox="0 0 100 60" width="100%" height="100%" aria-hidden="true">
      <rect x="28" y="18" width="46" height="24" rx="2" fill="var(--surface-sunk)" stroke="var(--line-strong)" strokeWidth="0.8" />
      <rect x="26" y="14" width="6" height="32" fill="var(--surface-sunk)" stroke="var(--line-strong)" strokeWidth="0.6" />
      <rect x="70" y="16" width="8" height="28" fill="var(--surface-sunk)" stroke="var(--line-strong)" strokeWidth="0.6" />
      <circle cx="50" cy="30" r="8" fill="var(--line-soft)" stroke="var(--line-strong)" strokeWidth="0.6" />
    </svg>
  );
}

function CameraSilhouette() {
  return (
    <svg viewBox="0 0 100 60" width="100%" height="100%" aria-hidden="true">
      <rect x="14" y="20" width="72" height="30" rx="3" fill="var(--surface-sunk)" stroke="var(--line-strong)" strokeWidth="0.8" />
      <rect x="36" y="14" width="28" height="8" rx="2" fill="var(--surface-sunk)" stroke="var(--line-strong)" strokeWidth="0.8" />
      <circle cx="50" cy="34" r="10" fill="var(--line-soft)" stroke="var(--line-strong)" strokeWidth="0.7" />
      <circle cx="50" cy="34" r="6" fill="var(--surface-sunk)" stroke="var(--line-strong)" strokeWidth="0.5" />
      <rect x="74" y="24" width="6" height="3" fill="var(--fg-faint)" />
    </svg>
  );
}

function ItemSearch({
  lockedType,
  selected,
  onSelect,
}: {
  lockedType: ItemType | null;
  selected: SelectedItem | null;
  onSelect: (item: SelectedItem | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const types = useMemo<EntityType[]>(
    () => (lockedType ? [lockedType] : ["lens", "camera"]),
    [lockedType],
  );
  const { query, results, handleQueryChange, reset } = useEntitySearch({ types });

  const placeholder = lockedType
    ? `Search for a ${lockedType}…`
    : "Search for a lens or camera…";

  if (selected) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-[var(--surface-sunk)] px-3 py-2.5">
        <Search className="h-3.5 w-3.5 text-[var(--fg-dim)]" strokeWidth={1.75} />
        <Link
          href={`/${selected.type === "lens" ? "lenses" : "cameras"}/${selected.data.slug}`}
          className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground hover:underline"
        >
          {selected.data.name}
        </Link>
        <span className="mono shrink-0 text-[10px] text-[var(--fg-faint)]">
          {entityIdLabel(selected)}
        </span>
        <button
          type="button"
          onClick={() => {
            onSelect(null);
            reset();
          }}
          aria-label="Remove"
          className="text-[var(--fg-faint)] transition-colors hover:text-[var(--fg-mid)]"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg border border-border bg-[var(--surface-sunk)] px-3 py-2.5 text-left text-[13px] text-[var(--fg-mid)] transition-colors hover:border-[var(--line-strong)]"
          />
        }
      >
        <Search className="h-3.5 w-3.5 text-[var(--fg-dim)]" strokeWidth={1.75} />
        <span className="flex-1 truncate">{query || placeholder}</span>
        <span className="mono text-[10px] text-[var(--fg-faint)]">⏎</span>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--anchor-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={placeholder} value={query} onValueChange={handleQueryChange} />
          <CommandList>
            <CommandEmpty>
              {query.length < 2 ? "Type at least 2 characters" : "No results found."}
            </CommandEmpty>
            {(() => {
              const lensResults = results.filter((r) => r.type === "lens");
              const cameraResults = results.filter((r) => r.type === "camera");
              return (
                <>
                  {lensResults.length > 0 && (
                    <CommandGroup heading="Lenses">
                      {lensResults.map((item) => (
                        <CommandItem
                          key={`lens-${item.id}`}
                          value={`lens-${item.id}-${item.name}`}
                          onSelect={() => {
                            const raw = item.raw as { lens: Lens };
                            onSelect({ type: "lens", data: raw.lens });
                            setOpen(false);
                            reset();
                          }}
                        >
                          <span>{item.name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {item.systemName}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {cameraResults.length > 0 && (
                    <CommandGroup heading="Cameras">
                      {cameraResults.map((item) => (
                        <CommandItem
                          key={`camera-${item.id}`}
                          value={`camera-${item.id}-${item.name}`}
                          onSelect={() => {
                            const raw = item.raw as { camera: Camera };
                            onSelect({ type: "camera", data: raw.camera });
                            setOpen(false);
                            reset();
                          }}
                        >
                          <span>{item.name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {item.systemName}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </>
              );
            })()}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const FOCAL_TICKS: number[] = [14, 24, 35, 50, 85, 135, 200, 400];
const FOCAL_VIZ_MIN = 14;
const FOCAL_VIZ_MAX = 400;
const FOCAL_VIZ_LOG_RATIO = Math.log(FOCAL_VIZ_MAX / FOCAL_VIZ_MIN);

function focalToPercent(f: number): number {
  if (f <= FOCAL_VIZ_MIN) return 0;
  if (f >= FOCAL_VIZ_MAX) return 100;
  return (Math.log(f / FOCAL_VIZ_MIN) / FOCAL_VIZ_LOG_RATIO) * 100;
}

function VizRow({ a, b }: { a: Lens; b: Lens }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <FocalCoverageCard a={a} b={b} />
      <BladeMatchCard a={a} b={b} />
      <WeightDeltaCard
        aLabel="A"
        bLabel="B"
        aWeight={a.weightG}
        bWeight={b.weightG}
      />
    </div>
  );
}

function CameraVizRow({ a, b }: { a: Camera; b: Camera }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <MegapixelCompareCard a={a} b={b} />
      <WeightDeltaCard
        aLabel="A"
        bLabel="B"
        aWeight={a.weightG}
        bWeight={b.weightG}
      />
    </div>
  );
}

function VizCard({
  title,
  status,
  statusColor,
  children,
}: {
  title: string;
  status?: string;
  statusColor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border bg-[var(--surface-soft)] px-4 py-2.5">
        <span className="text-[12px] font-medium">{title}</span>
        {status && (
          <span className="mono text-[10px] uppercase tracking-[0.06em]" style={{ color: statusColor }}>
            {status}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function FocalCoverageCard({ a, b }: { a: Lens; b: Lens }) {
  const aMin = a.focalLengthMin;
  const aMax = a.focalLengthMax ?? a.focalLengthMin;
  const bMin = b.focalLengthMin;
  const bMax = b.focalLengthMax ?? b.focalLengthMin;
  const haveData = aMin && aMax && bMin && bMax;
  if (!haveData) {
    return (
      <VizCard title="Focal coverage">
        <div className="px-4 py-8 text-center text-[12px] text-[var(--fg-faint)]">
          Focal data missing
        </div>
      </VizCard>
    );
  }

  const aLeft = focalToPercent(aMin);
  const aRight = focalToPercent(aMax);
  const bLeft = focalToPercent(bMin);
  const bRight = focalToPercent(bMax);

  const overlapStart = Math.max(aMin, bMin);
  const overlapEnd = Math.min(aMax, bMax);
  const overlap = overlapEnd >= overlapStart;

  return (
    <VizCard
      title="Focal coverage · overlap"
      status={overlap ? "● overlap" : "● no overlap"}
      statusColor={overlap ? "var(--pos)" : "var(--hot)"}
    >
      <div className="px-4 py-4">
        <div className="relative h-9 rounded bg-[var(--surface-sunk)]">
          <div
            className="absolute top-0 h-1/2 rounded"
            style={{
              left: `${aLeft}%`,
              width: `${Math.max(2, aRight - aLeft)}%`,
              background: "color-mix(in oklch, var(--fg) 85%, transparent)",
            }}
          />
          <div
            className="absolute bottom-0 h-1/2 rounded"
            style={{
              left: `${bLeft}%`,
              width: `${Math.max(2, bRight - bLeft)}%`,
              background: "var(--pos)",
              opacity: 0.7,
            }}
          />
          {FOCAL_TICKS.map((tick) => (
            <div
              key={tick}
              className="absolute top-0 h-full w-px bg-[var(--line)]"
              style={{ left: `${focalToPercent(tick)}%` }}
              aria-hidden="true"
            />
          ))}
        </div>
        <div className="mono mt-2 flex justify-between text-[10px] text-[var(--fg-faint)]">
          {FOCAL_TICKS.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
        <div className="mono mt-3 flex items-center gap-4 text-[10px] text-[var(--fg-mid)]">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded" style={{ background: "var(--fg)" }} />
            A · {aMin === aMax ? `${aMin}mm` : `${aMin}–${aMax}mm`}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded" style={{ background: "var(--pos)" }} />
            B · {bMin === bMax ? `${bMin}mm` : `${bMin}–${bMax}mm`}
          </span>
        </div>
      </div>
    </VizCard>
  );
}

function BladeShape({ blades, color }: { blades: number | null; color: string }) {
  if (!blades || blades < 3) {
    return (
      <svg viewBox="0 0 100 100" width="64" height="64" aria-hidden="true">
        <circle cx="50" cy="50" r="36" fill="none" stroke="var(--line)" strokeWidth="1" strokeDasharray="3 3" />
      </svg>
    );
  }
  const points: string[] = [];
  for (let i = 0; i < blades; i++) {
    const angle = (i / blades) * Math.PI * 2 - Math.PI / 2;
    const x = 50 + Math.cos(angle) * 36;
    const y = 50 + Math.sin(angle) * 36;
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return (
    <svg viewBox="0 0 100 100" width="64" height="64" aria-hidden="true">
      <circle cx="50" cy="50" r="38" fill="none" stroke="var(--line)" strokeWidth="0.8" />
      <polygon
        points={points.join(" ")}
        fill="color-mix(in oklch, var(--fg) 8%, transparent)"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BladeMatchCard({ a, b }: { a: Lens; b: Lens }) {
  const haveData = a.diaphragmBlades && b.diaphragmBlades;
  const match = haveData && a.diaphragmBlades === b.diaphragmBlades;
  const status = haveData
    ? match
      ? `● match · ${a.diaphragmBlades}`
      : `● ${a.diaphragmBlades} vs ${b.diaphragmBlades}`
    : undefined;
  return (
    <VizCard
      title="Aperture blades · bokeh shape"
      status={status}
      statusColor={match ? "var(--pos)" : haveData ? "var(--hot)" : undefined}
    >
      <div className="flex items-center justify-around gap-3 px-4 py-3">
        <BladeShape blades={a.diaphragmBlades} color="var(--fg)" />
        <span className="mono text-[14px] tracking-[0.1em] text-[var(--fg-faint)]">
          {match ? "=" : "≠"}
        </span>
        <BladeShape blades={b.diaphragmBlades} color="var(--pos)" />
      </div>
    </VizCard>
  );
}

function WeightDeltaCard({
  aLabel,
  bLabel,
  aWeight,
  bWeight,
}: {
  aLabel: string;
  bLabel: string;
  aWeight: number | null;
  bWeight: number | null;
}) {
  const haveData = aWeight && bWeight;
  if (!haveData) {
    return (
      <VizCard title="Weight & size">
        <div className="px-4 py-8 text-center text-[12px] text-[var(--fg-faint)]">
          Weight data missing
        </div>
      </VizCard>
    );
  }
  const max = Math.max(1000, aWeight!, bWeight!);
  const aPct = (aWeight! / max) * 100;
  const bPct = (bWeight! / max) * 100;
  const delta = aWeight! - bWeight!;
  const aWins = delta < 0;
  const bWins = delta > 0;
  const deltaText = delta === 0 ? "● equal" : `● ${Math.abs(delta)}g Δ`;
  const deltaColor = delta === 0 ? "var(--pos)" : "var(--hot)";
  return (
    <VizCard title="Weight & size" status={deltaText} statusColor={deltaColor}>
      <div className="flex flex-col gap-3 px-4 py-4">
        <WeightBar
          label={`${aLabel} · ${aWeight}g`}
          pct={aPct}
          color={aWins ? "var(--pos)" : "var(--fg)"}
          tag={aWins ? "★ lighter" : bWins ? `+${delta}g` : "—"}
          tagColor={aWins ? "var(--pos)" : bWins ? "var(--fg-faint)" : undefined}
        />
        <WeightBar
          label={`${bLabel} · ${bWeight}g`}
          pct={bPct}
          color={bWins ? "var(--pos)" : "var(--fg)"}
          tag={bWins ? "★ lighter" : aWins ? `+${Math.abs(delta)}g` : "—"}
          tagColor={bWins ? "var(--pos)" : aWins ? "var(--fg-faint)" : undefined}
        />
        <div className="mono flex justify-between border-t border-[var(--line-soft)] pt-1.5 text-[9px] tracking-[0.1em] text-[var(--fg-faint)]">
          <span>0g</span>
          <span>{Math.round(max / 2)}g</span>
          <span>{max}g</span>
        </div>
      </div>
    </VizCard>
  );
}

function WeightBar({
  label,
  pct,
  color,
  tag,
  tagColor,
}: {
  label: string;
  pct: number;
  color: string;
  tag: string;
  tagColor?: string;
}) {
  return (
    <div>
      <div className="h-2 overflow-hidden rounded bg-[var(--surface-sunk)]">
        <div className="h-full rounded" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="mono mt-[3px] flex justify-between text-[10px]">
        <span>{label}</span>
        <span style={{ color: tagColor ?? "var(--fg-faint)" }}>{tag}</span>
      </div>
    </div>
  );
}

function MegapixelCompareCard({ a, b }: { a: Camera; b: Camera }) {
  const haveData = a.megapixels && b.megapixels;
  if (!haveData) {
    return (
      <VizCard title="Megapixels">
        <div className="px-4 py-8 text-center text-[12px] text-[var(--fg-faint)]">
          Megapixel data missing
        </div>
      </VizCard>
    );
  }
  const max = Math.max(60, a.megapixels!, b.megapixels!);
  const aPct = (a.megapixels! / max) * 100;
  const bPct = (b.megapixels! / max) * 100;
  const diff = a.megapixels! - b.megapixels!;
  const aWins = diff > 0;
  const bWins = diff < 0;
  const delta = Math.abs(diff).toFixed(1).replace(/\.0$/, "");
  return (
    <VizCard
      title="Megapixels"
      status={`Δ ${delta}MP`}
      statusColor={diff === 0 ? "var(--pos)" : "var(--hot)"}
    >
      <div className="flex flex-col gap-3 px-4 py-4">
        <WeightBar
          label={`A · ${a.megapixels}MP`}
          pct={aPct}
          color={aWins ? "var(--pos)" : "var(--fg)"}
          tag=""
        />
        <WeightBar
          label={`B · ${b.megapixels}MP`}
          pct={bPct}
          color={bWins ? "var(--pos)" : "var(--fg)"}
          tag=""
        />
      </div>
    </VizCard>
  );
}

type FilterChip = "all" | "diff" | "match";

function CompareGrid({
  item1,
  item2,
  rows,
}: {
  item1: SelectedItem;
  item2: SelectedItem;
  rows: SpecRow[];
}) {
  const [filter, setFilter] = useState<FilterChip>("all");

  const filteredRows = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => {
      const isMatch =
        r.value1 === r.value2 && r.value1 !== EM_DASH && r.value2 !== EM_DASH;
      return filter === "match" ? isMatch : !isMatch && r.value1 !== EM_DASH && r.value2 !== EM_DASH;
    });
  }, [filter, rows]);

  const groups = useMemo(() => {
    const out: Record<string, SpecRow[]> = {};
    for (const r of filteredRows) {
      (out[r.group] ||= []).push(r);
    }
    return out;
  }, [filteredRows]);

  const summary = summarizeWinners(rows);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
        <div className="flex flex-wrap gap-2">
          <FilterPill
            label={`All · ${rows.length}`}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          <FilterPill
            label={`Differences · ${summary.differences}`}
            dotColor="var(--hot)"
            active={filter === "diff"}
            onClick={() => setFilter("diff")}
          />
          <FilterPill
            label={`Matches · ${summary.matches}`}
            dotColor="var(--pos)"
            active={filter === "match"}
            onClick={() => setFilter("match")}
          />
        </div>
        <span className="mono hidden text-[10px] tracking-[0.06em] text-[var(--fg-faint)] md:inline">
          differences highlighted ·
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-background">
        <div className="grid grid-cols-[140px_1fr_1fr] sm:grid-cols-[180px_1fr_1fr]">
          <div className="flex flex-col justify-end border-b border-r border-border p-5">
            <div className="mono mb-2 text-[10px] uppercase tracking-[0.1em] text-[var(--fg-faint)]">
              Dimension
            </div>
            <h2 className="text-[18px] font-medium leading-[1.2] -tracking-[0.025em]">
              {item1.type === "lens" ? "Lens" : "Camera"}{" "}
              <em className="hero-title-em">comparison</em>
            </h2>
          </div>
          <CompareHeader item={item1} pin="A" />
          <CompareHeader item={item2} pin="B" lastCol />

          {Object.entries(groups).map(([group, groupRows]) => (
            <CompareGroup key={group} group={group} rows={groupRows} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FilterPill({
  label,
  active,
  dotColor,
  onClick,
}: {
  label: string;
  active: boolean;
  dotColor?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mono flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-[var(--fg-mid)] hover:border-[var(--line-strong)] hover:text-foreground"
      }`}
    >
      {dotColor && <span className="h-1.5 w-1.5 rounded-full" style={{ background: dotColor }} />}
      {label}
    </button>
  );
}

function CompareHeader({
  item,
  pin,
  lastCol,
}: {
  item: SelectedItem;
  pin: "A" | "B";
  lastCol?: boolean;
}) {
  const src = firstImageSrc(item.data.images);
  return (
    <div
      className={`flex flex-col border-b ${lastCol ? "" : "border-r"} border-border bg-[var(--surface-soft)] p-5`}
    >
      {src ? (
        <div className="relative mb-3 aspect-[4/3] w-full overflow-hidden rounded-md border border-border bg-background">
          <Image
            src={src}
            alt={item.data.name}
            fill
            className="object-contain p-3"
            sizes="(max-width: 1024px) 50vw, 360px"
          />
        </div>
      ) : (
        <div
          className="mb-3 aspect-[4/3] w-full overflow-hidden rounded-md border border-border bg-[var(--surface-sunk)]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(-45deg, transparent 0 4px, color-mix(in oklch, var(--fg) 5%, transparent) 4px 5px)",
          }}
          aria-hidden="true"
        />
      )}
      <div className="mono mb-2 text-[9px] uppercase tracking-[0.1em] text-[var(--fg-faint)]">
        {pin} · pinned
      </div>
      <Link
        href={`/${item.type === "lens" ? "lenses" : "cameras"}/${item.data.slug}`}
        className="text-[14px] font-medium -tracking-[0.01em] hover:underline"
      >
        {item.data.name}
      </Link>
      <div className="mono mt-1 text-[10px] text-[var(--fg-faint)]">
        {entityIdLabel(item)}
      </div>
    </div>
  );
}

function CompareGroup({ group, rows }: { group: string; rows: SpecRow[] }) {
  return (
    <>
      <div className="col-span-3 border-b border-t border-border bg-[var(--surface-sunk)]">
        <div className="mono px-5 py-2 text-[10px] uppercase tracking-[0.12em] text-[var(--fg-dim)]">
          {group}
        </div>
      </div>
      {rows.map((row) => (
        <CompareRow key={row.label} row={row} />
      ))}
    </>
  );
}

function CompareRow({ row }: { row: SpecRow }) {
  const winner = rowWinner(row);
  const isDiff = row.value1 !== row.value2;
  return (
    <>
      <div className="mono flex items-center border-b border-r border-[var(--line-soft)] bg-[var(--surface-soft)] px-5 py-3 text-[11px] tracking-[0.04em] text-[var(--fg-dim)]">
        {row.label}
      </div>
      <CompareCell value={row.value1} isWinner={winner === "a"} isLoser={isDiff && winner === "b"} />
      <CompareCell value={row.value2} isWinner={winner === "b"} isLoser={isDiff && winner === "a"} lastCol />
    </>
  );
}

function CompareCell({
  value,
  isWinner,
  isLoser,
  lastCol,
}: {
  value: string;
  isWinner: boolean;
  isLoser: boolean;
  lastCol?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 border-b ${lastCol ? "" : "border-r"} border-[var(--line-soft)] px-5 py-3 text-[13px] tabular-nums ${
        isWinner ? "font-medium text-foreground" : isLoser ? "text-[var(--fg-dim)]" : ""
      }`}
    >
      <span>{value}</span>
      {isWinner && <span className="h-1.5 w-1.5 rounded-full bg-[var(--pos)]" aria-hidden="true" />}
    </div>
  );
}

function SummaryFooter({
  item1,
  item2,
  summary,
  rows,
}: {
  item1: SelectedItem;
  item2: SelectedItem;
  summary: { aWins: number; bWins: number; differences: number; matches: number };
  rows: SpecRow[];
}) {
  const aName = item1.data.name.split(" ")[0];
  const bName = item2.data.name.split(" ")[0];
  const verdict =
    summary.differences === 0
      ? "These two are functionally identical across the recorded specs."
      : summary.aWins > summary.bWins
        ? `A · ${aName} edges ahead on ${summary.aWins} ${summary.aWins === 1 ? "metric" : "metrics"}.`
        : summary.bWins > summary.aWins
          ? `B · ${bName} edges ahead on ${summary.bWins} ${summary.bWins === 1 ? "metric" : "metrics"}.`
          : `Trade-offs: ${summary.aWins} for A · ${aName}, ${summary.bWins} for B · ${bName}.`;

  const diffLabels = rows
    .filter((r) => r.value1 !== r.value2 && r.value1 !== EM_DASH && r.value2 !== EM_DASH)
    .slice(0, 4)
    .map((r) => r.label.toLowerCase());

  return (
    <div className="grid grid-cols-1 gap-6 rounded-xl border border-border bg-background p-5 sm:grid-cols-[auto_1fr]">
      <div className="mono text-[10px] uppercase tracking-[0.1em] text-[var(--fg-faint)]">
        Summary
      </div>
      <div className="text-[14px] leading-[1.55] text-[var(--fg-mid)]">
        <span className="text-foreground">{verdict}</span>
        {diffLabels.length > 0 && (
          <>
            {" "}
            Notable differences:{" "}
            <span className="mono text-[12px] text-foreground">
              {diffLabels.join(" · ")}
            </span>
            .
          </>
        )}
      </div>
    </div>
  );
}
