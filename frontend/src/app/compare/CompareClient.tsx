"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
  CAMERA_SPEC_ROWS,
  EMPTY,
  LENS_SPEC_ROWS,
  type ComparableCamera,
  type ComparableLens,
} from "@/lib/compare-rows";
import { trackEvent } from "@/lib/analytics";
import { useEntitySearch, type EntityType } from "@/hooks/use-entity-search";
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

type Lens = ComparableLens;
type Camera = ComparableCamera;

type SelectedItem =
  | { type: "lens"; data: Lens }
  | { type: "camera"; data: Camera };

function capitalizeFirstLetter(value: string) {
  return value.replace(/^([a-z])/, (match) => match.toUpperCase());
}

function formatCellValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === EMPTY) return trimmed;
  const separator = trimmed.includes(";") ? /;\s*/ : /,\s+/;
  const parts = trimmed.split(separator).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return capitalizeFirstLetter(trimmed);
  return (
    <ul className="space-y-1">
      {parts.map((item, i) => (
        <li key={i}>{capitalizeFirstLetter(item)}</li>
      ))}
    </ul>
  );
}

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
  const [open, setOpen] = useState(false);
  const labelId = useId();

  const types = useMemo<EntityType[]>(
    () => lockedType ? [lockedType] : ["lens", "camera"],
    [lockedType]
  );

  const { query, results, handleQueryChange, reset } = useEntitySearch({ types });

  if (selected) {
    return (
      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-medium text-zinc-900 dark:text-zinc-100">{selected.data.name}</p>
            <span className="text-xs text-muted-foreground">{selected.type === "lens" ? "Lens" : "Camera"}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onSelect(null);
              reset();
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
      <p id={labelId} className="text-xs text-muted-foreground">{label}</p>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button variant="outline" className="w-full justify-between" aria-describedby={labelId} />}>
          {query || placeholder}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent className="w-[var(--anchor-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={placeholder}
              value={query}
              onValueChange={handleQueryChange}
            />
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
                              const raw = item.raw as { lens: Lens; system: { name: string } | null };
                              onSelect({ type: "lens", data: raw.lens });
                              setOpen(false);
                              reset();
                            }}
                          >
                            <span>{item.name}</span>
                            <span className="ml-2 text-xs text-muted-foreground">{item.systemName}</span>
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
                              const raw = item.raw as { camera: Camera; system: { name: string } | null };
                              onSelect({ type: "camera", data: raw.camera });
                              setOpen(false);
                              reset();
                            }}
                          >
                            <span>{item.name}</span>
                            <span className="ml-2 text-xs text-muted-foreground">{item.systemName}</span>
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
    </div>
  );
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
  const lockedType: ItemType | null = item1?.type || item2?.type || urlType;

  const initRef = useRef(false);

  // Sync URL as items are selected/cleared
  useEffect(() => {
    if (!initRef.current) return; // skip until init load completes
    const params = new URLSearchParams();
    const type = item1?.type || item2?.type;
    if (type) params.set("type", type);
    if (item1) params.set("item1", item1.data.slug);
    if (item2) params.set("item2", item2.data.slug);
    const qs = params.toString();
    const newUrl = qs ? `/compare?${qs}` : "/compare";
    router.replace(newUrl, { scroll: false });
  }, [item1, item2, router]);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const slug1 = searchParams.get("item1") || searchParams.get("lens1");
    const slug2 = searchParams.get("item2") || searchParams.get("lens2");
    if (!slug1 && !slug2) return;
    if (!urlType) return;

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

    const toSelected = (data: unknown): SelectedItem =>
      urlType === "lens" ? { type: "lens", data: data as Lens } : { type: "camera", data: data as Camera };

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

    const [slugA, slugB] = item1.data.id < item2.data.id
      ? [item1.data.slug, item2.data.slug]
      : [item2.data.slug, item1.data.slug];
    trackEvent("comparison_start", { entity_type: item1.type, slug_1: slugA, slug_2: slugB });

    fetch("/api/comparisons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: item1.type, id1: item1.data.id, id2: item2.data.id }),
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
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Spec</TableHead>
                <TableHead scope="col" className="text-sm normal-case text-foreground">
                  <Link href={`/${item1.type === "lens" ? "lenses" : "cameras"}/${item1.data.slug}`} className="hover:underline">
                    {item1.data.name}
                  </Link>
                </TableHead>
                <TableHead scope="col" className="text-sm normal-case text-foreground">
                  <Link href={`/${item2.type === "lens" ? "lenses" : "cameras"}/${item2.data.slug}`} className="hover:underline">
                    {item2.data.name}
                  </Link>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ label, v1, v2 }) => {
                const isDiff = v1 !== v2 && v1 !== EMPTY && v2 !== EMPTY;
                return (
                  <TableRow key={label} className={isDiff ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}>
                    <TableCell className="font-medium text-muted-foreground">{label}</TableCell>
                    <TableCell className={isDiff ? "border-l-2 border-amber-400 font-semibold" : ""}>{formatCellValue(v1)}</TableCell>
                    <TableCell className={isDiff ? "border-l-2 border-amber-400 font-semibold" : ""}>{formatCellValue(v2)}</TableCell>
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
