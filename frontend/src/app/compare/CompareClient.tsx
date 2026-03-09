"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUpDown, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { formatMagnification } from "@/lib/format-magnification";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
};

type SelectedItem =
  | { type: "lens"; data: Lens }
  | { type: "camera"; data: Camera };

type SearchResultItem =
  | { type: "lens"; lens: Lens; system: { name: string } | null }
  | { type: "camera"; camera: Camera; system: { name: string } | null };

const LENS_SPEC_ROWS: { label: string; getValue: (l: Lens) => string }[] = [
  { label: "Brand", getValue: (l) => l.brand || "\u2014" },
  { label: "Type", getValue: (l) => l.lensType || "\u2014" },
  {
    label: "Focal Length",
    getValue: (l) =>
      l.focalLengthMin
        ? l.focalLengthMin === l.focalLengthMax
          ? `${l.focalLengthMin}mm`
          : `${l.focalLengthMin}-${l.focalLengthMax}mm`
        : "\u2014",
  },
  {
    label: "Max Aperture",
    getValue: (l) => (l.apertureMin ? `f/${l.apertureMin}` : "\u2014"),
  },
  {
    label: "Min Aperture",
    getValue: (l) => (l.apertureMax && l.apertureMax !== l.apertureMin ? `f/${l.apertureMax}` : "\u2014"),
  },
  { label: "Weight", getValue: (l) => (l.weightG ? `${l.weightG}g` : "\u2014") },
  { label: "Filter Size", getValue: (l) => (l.filterSizeMm ? `${l.filterSizeMm}mm` : "\u2014") },
  { label: "Lens Elements", getValue: (l) => l.lensElements?.toString() || "\u2014" },
  { label: "Lens Groups", getValue: (l) => l.lensGroups?.toString() || "\u2014" },
  { label: "Diaphragm Blades", getValue: (l) => l.diaphragmBlades?.toString() || "\u2014" },
  {
    label: "Min Focus Distance",
    getValue: (l) => (l.minFocusDistanceM ? `${l.minFocusDistanceM}m` : "\u2014"),
  },
  {
    label: "Max Magnification",
    getValue: (l) => formatMagnification(l.maxMagnification),
  },
  { label: "Autofocus", getValue: (l) => (l.hasAutofocus ? "Yes" : "No") },
  { label: "Stabilization", getValue: (l) => (l.hasStabilization ? "Yes" : "No") },
  { label: "Year Introduced", getValue: (l) => l.yearIntroduced?.toString() || "\u2014" },
  { label: "Status", getValue: (l) => l.productionStatus || "\u2014" },
  { label: "Era", getValue: (l) => l.era || "\u2014" },
  {
    label: "Lens Hood",
    getValue: (l) => (l.specs as Record<string, string>)?.["Lens hood"] || "\u2014",
  },
];

function cameraSpec(c: Camera, ...keys: string[]): string {
  const specs = (c.specs || {}) as Record<string, string>;
  for (const k of keys) {
    if (specs[k]) return specs[k];
  }
  return "\u2014";
}

const CAMERA_SPEC_ROWS: { label: string; getValue: (c: Camera) => string }[] = [
  { label: "Type", getValue: (c) => cameraSpec(c, "Type") },
  { label: "Model", getValue: (c) => cameraSpec(c, "Model") },
  { label: "Film Type", getValue: (c) => cameraSpec(c, "Film type") },
  { label: "Imaging Sensor", getValue: (c) => cameraSpec(c, "Imaging sensor", "Imaging plane") },
  { label: "Sensor Size", getValue: (c) => c.sensorSize || cameraSpec(c, "Maximum format") },
  { label: "Megapixels", getValue: (c) => (c.megapixels ? `${c.megapixels} MP` : "\u2014") },
  { label: "Resolution", getValue: (c) => c.resolution || "\u2014" },
  { label: "Crop Factor", getValue: (c) => cameraSpec(c, "Crop factor") },
  { label: "Image Stabilization", getValue: (c) => cameraSpec(c, "Sensor-shift image stabilization") },
  { label: "Speeds", getValue: (c) => cameraSpec(c, "Speeds") },
  { label: "Exposure Modes", getValue: (c) => cameraSpec(c, "Exposure modes") },
  { label: "Exposure Metering", getValue: (c) => cameraSpec(c, "Exposure metering") },
  { label: "Dimensions", getValue: (c) => cameraSpec(c, "Dimensions") },
  { label: "Year Introduced", getValue: (c) => c.yearIntroduced?.toString() || "\u2014" },
  { label: "Weight", getValue: (c) => (c.weightG ? `${c.weightG}g` : "\u2014") },
  { label: "Body Type", getValue: (c) => c.bodyType || "\u2014" },
];

function ItemSearch({
  label,
  lockedType,
  selected,
  onSelect,
}: {
  label: string;
  lockedType: ItemType | null;
  selected: SelectedItem | null;
  onSelect: (item: SelectedItem | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const search = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        setResults([]);
        return;
      }

      try {
        const items: SearchResultItem[] = [];

        if (!lockedType || lockedType === "lens") {
          const res = await fetch(`/api/lenses?q=${encodeURIComponent(q)}&cursor=0`);
          const data = await res.json();
          for (const item of data.items || []) {
            items.push({ type: "lens", lens: item.lens, system: item.system });
          }
        }

        if (!lockedType || lockedType === "camera") {
          const res = await fetch(`/api/cameras?q=${encodeURIComponent(q)}&cursor=0`);
          const data = await res.json();
          for (const item of data.items || []) {
            items.push({ type: "camera", camera: item.camera, system: item.system });
          }
        }

        setResults(items.slice(0, 20));
      } catch {
        setResults([]);
      }
    },
    [lockedType]
  );

  function handleQuery(value: string) {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  }

  if (selected) {
    return (
      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="font-medium text-zinc-900 dark:text-zinc-100">{selected.data.name}</p>
            <span className="text-xs text-zinc-400">{selected.type === "lens" ? "Lens" : "Camera"}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onSelect(null);
              setQuery("");
              setResults([]);
            }}
          >
            Change
          </Button>
        </div>
      </div>
    );
  }

  const placeholder = lockedType ? `Search for a ${lockedType}...` : "Search for a lens or camera...";

  return (
    <div className="space-y-1">
      <p className="text-xs text-zinc-500">{label}</p>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button variant="outline" className="w-full justify-between" />}>
          {query || placeholder}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent className="w-[var(--anchor-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={placeholder}
              value={query}
              onValueChange={handleQuery}
            />
            <CommandList>
              <CommandEmpty>
                {query.length < 2 ? "Type at least 2 characters" : "No results found."}
              </CommandEmpty>
              <CommandGroup>
                {results.map((item) => {
                  const isLens = item.type === "lens";
                  const data = isLens ? item.lens : item.camera;
                  return (
                    <CommandItem
                      key={`${item.type}-${data.id}`}
                      value={`${item.type}-${data.id}-${data.name}`}
                      onSelect={() => {
                        onSelect(isLens ? { type: "lens", data: item.lens } : { type: "camera", data: item.camera });
                        setOpen(false);
                        setQuery("");
                        setResults([]);
                      }}
                    >
                      <span>{data.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{item.system?.name || (isLens ? "Lens" : "Camera")}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function CompareClient() {
  const [item1, setItem1] = useState<SelectedItem | null>(null);
  const [item2, setItem2] = useState<SelectedItem | null>(null);
  const trackedRef = useRef<string | null>(null);
  const searchParams = useSearchParams();
  const rawType = searchParams.get("type");
  const urlType: ItemType | null =
    rawType === "lens" || rawType === "camera" ? rawType : null;
  const lockedType: ItemType | null = item1?.type || item2?.type || urlType;

  useEffect(() => {
    const slug1 = searchParams.get("item1") || searchParams.get("lens1");
    const slug2 = searchParams.get("item2") || searchParams.get("lens2");

    async function fetchBySlug<T>(kind: ItemType, slug: string): Promise<T | null> {
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

    if (slug1 && !item1 && (urlType === "lens" || urlType === "camera")) {
      fetchBySlug(urlType, slug1).then((data) => {
        if (!data) return;
        setItem1(urlType === "lens" ? { type: "lens", data: data as Lens } : { type: "camera", data: data as Camera });
      });
    }

    if (slug2 && !item2 && (urlType === "lens" || urlType === "camera")) {
      fetchBySlug(urlType, slug2).then((data) => {
        if (!data) return;
        setItem2(urlType === "lens" ? { type: "lens", data: data as Lens } : { type: "camera", data: data as Camera });
      });
    }
  }, [searchParams, item1, item2, urlType]);

  useEffect(() => {
    if (!item1 || !item2) return;
    if (item1.type !== item2.type) {
      toast.error("Please compare two items of the same type");
      return;
    }

    if (item1.type !== "lens") return;

    const key = `${Math.min(item1.data.id, item2.data.id)}-${Math.max(item1.data.id, item2.data.id)}`;
    if (trackedRef.current === key) return;
    trackedRef.current = key;

    fetch("/api/comparisons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lensId1: item1.data.id, lensId2: item2.data.id }),
    }).catch(() => {
      toast.error("Could not record comparison");
    });
  }, [item1, item2]);

  const rows =
    item1 && item2 && item1.type === item2.type
      ? item1.type === "lens"
        ? LENS_SPEC_ROWS.map(({ label, getValue }) => ({
            label,
            v1: getValue(item1.data as Lens),
            v2: getValue(item2.data as Lens),
          }))
        : CAMERA_SPEC_ROWS.map(({ label, getValue }) => ({
            label,
            v1: getValue(item1.data as Camera),
            v2: getValue(item2.data as Camera),
          }))
      : [];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <ItemSearch label="Item 1" lockedType={lockedType} selected={item1} onSelect={setItem1} />
        <ItemSearch label="Item 2" lockedType={lockedType} selected={item2} onSelect={setItem2} />
      </div>

      {item1 && item2 && item1.type === item2.type ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Spec</TableHead>
                <TableHead scope="col">
                  <Link href={`/${item1.type === "lens" ? "lenses" : "cameras"}/${item1.data.slug}`} className="hover:underline">
                    {item1.data.name}
                  </Link>
                </TableHead>
                <TableHead scope="col">
                  <Link href={`/${item2.type === "lens" ? "lenses" : "cameras"}/${item2.data.slug}`} className="hover:underline">
                    {item2.data.name}
                  </Link>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ label, v1, v2 }) => {
                const isDiff = v1 !== v2 && v1 !== "\u2014" && v2 !== "\u2014";
                return (
                  <TableRow key={label} className={isDiff ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}>
                    <TableCell className="font-medium text-zinc-500 dark:text-zinc-400">{label}</TableCell>
                    <TableCell className={isDiff ? "border-l-2 border-amber-400 font-semibold" : ""}>{v1}</TableCell>
                    <TableCell className={isDiff ? "border-l-2 border-amber-400 font-semibold" : ""}>{v2}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <ArrowUpDown className="h-10 w-10" />
          <p>Select two items above to compare specs</p>
        </div>
      )}
    </div>
  );
}
