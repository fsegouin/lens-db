"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface LensData {
  id: number;
  name: string;
  slug: string;
  url?: string | null;
  brand?: string | null;
  systemId?: number | null;
  description?: string | null;
  lensType?: string | null;
  era?: string | null;
  productionStatus?: string | null;
  focalLengthMin?: number | null;
  focalLengthMax?: number | null;
  apertureMin?: number | null;
  apertureMax?: number | null;
  weightG?: number | null;
  filterSizeMm?: number | null;
  minFocusDistanceM?: number | null;
  maxMagnification?: number | null;
  lensElements?: number | null;
  lensGroups?: number | null;
  diaphragmBlades?: number | null;
  yearIntroduced?: number | null;
  yearDiscontinued?: number | null;
  isZoom?: boolean | null;
  isMacro?: boolean | null;
  isPrime?: boolean | null;
  hasStabilization?: boolean | null;
  hasAutofocus?: boolean | null;
  specs?: unknown;
  images?: unknown;
}

interface LensFormProps {
  lens?: LensData;
  systems: { id: number; name: string }[];
}

const inputClass =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const sectionClass = "text-lg font-semibold text-zinc-900 dark:text-zinc-100";

function generateSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function LensForm({ lens, systems }: LensFormProps) {
  const router = useRouter();
  const isEdit = !!lens;

  const [name, setName] = useState(lens?.name ?? "");
  const [slug, setSlug] = useState(lens?.slug ?? "");
  const [brand, setBrand] = useState(lens?.brand ?? "");
  const [systemId, setSystemId] = useState<string>(
    lens?.systemId ? String(lens.systemId) : ""
  );
  const [url, setUrl] = useState(lens?.url ?? "");
  const [description, setDescription] = useState(lens?.description ?? "");

  const [lensType, setLensType] = useState(lens?.lensType ?? "");
  const [era, setEra] = useState(lens?.era ?? "");
  const [productionStatus, setProductionStatus] = useState(
    lens?.productionStatus ?? ""
  );

  const [focalLengthMin, setFocalLengthMin] = useState(
    lens?.focalLengthMin?.toString() ?? ""
  );
  const [focalLengthMax, setFocalLengthMax] = useState(
    lens?.focalLengthMax?.toString() ?? ""
  );
  const [apertureMin, setApertureMin] = useState(
    lens?.apertureMin?.toString() ?? ""
  );
  const [apertureMax, setApertureMax] = useState(
    lens?.apertureMax?.toString() ?? ""
  );
  const [lensElements, setLensElements] = useState(
    lens?.lensElements?.toString() ?? ""
  );
  const [lensGroups, setLensGroups] = useState(
    lens?.lensGroups?.toString() ?? ""
  );
  const [diaphragmBlades, setDiaphragmBlades] = useState(
    lens?.diaphragmBlades?.toString() ?? ""
  );

  const [weightG, setWeightG] = useState(lens?.weightG?.toString() ?? "");
  const [filterSizeMm, setFilterSizeMm] = useState(
    lens?.filterSizeMm?.toString() ?? ""
  );
  const [minFocusDistanceM, setMinFocusDistanceM] = useState(
    lens?.minFocusDistanceM?.toString() ?? ""
  );
  const [maxMagnification, setMaxMagnification] = useState(
    lens?.maxMagnification?.toString() ?? ""
  );

  const [yearIntroduced, setYearIntroduced] = useState(
    lens?.yearIntroduced?.toString() ?? ""
  );
  const [yearDiscontinued, setYearDiscontinued] = useState(
    lens?.yearDiscontinued?.toString() ?? ""
  );

  const [isZoom, setIsZoom] = useState(lens?.isZoom ?? false);
  const [isMacro, setIsMacro] = useState(lens?.isMacro ?? false);
  const [isPrime, setIsPrime] = useState(lens?.isPrime ?? false);
  const [hasStabilization, setHasStabilization] = useState(
    lens?.hasStabilization ?? false
  );
  const [hasAutofocus, setHasAutofocus] = useState(
    lens?.hasAutofocus ?? false
  );

  const [specs, setSpecs] = useState(
    lens?.specs ? JSON.stringify(lens.specs, null, 2) : ""
  );
  const [images, setImages] = useState(
    lens?.images ? JSON.stringify(lens.images, null, 2) : ""
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleNameChange(value: string) {
    setName(value);
    if (!isEdit) {
      setSlug(generateSlug(value));
    }
  }

  function parseNum(val: string): number | null {
    if (!val.trim()) return null;
    const n = Number(val);
    return isNaN(n) ? null : n;
  }

  function parseIntVal(val: string): number | null {
    if (!val.trim()) return null;
    const n = parseInt(val, 10);
    return isNaN(n) ? null : n;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    let parsedSpecs = {};
    let parsedImages: unknown[] = [];

    if (specs.trim()) {
      try {
        parsedSpecs = JSON.parse(specs);
      } catch {
        setError("Invalid JSON in specs field");
        return;
      }
    }

    if (images.trim()) {
      try {
        parsedImages = JSON.parse(images);
      } catch {
        setError("Invalid JSON in images field");
        return;
      }
    }

    const payload = {
      name,
      slug,
      url: url || null,
      brand: brand || null,
      systemId: systemId ? parseInt(systemId, 10) : null,
      description: description || null,
      lensType: lensType || null,
      era: era || null,
      productionStatus: productionStatus || null,
      focalLengthMin: parseNum(focalLengthMin),
      focalLengthMax: parseNum(focalLengthMax),
      apertureMin: parseNum(apertureMin),
      apertureMax: parseNum(apertureMax),
      weightG: parseNum(weightG),
      filterSizeMm: parseNum(filterSizeMm),
      minFocusDistanceM: parseNum(minFocusDistanceM),
      maxMagnification: parseNum(maxMagnification),
      lensElements: parseIntVal(lensElements),
      lensGroups: parseIntVal(lensGroups),
      diaphragmBlades: parseIntVal(diaphragmBlades),
      yearIntroduced: parseIntVal(yearIntroduced),
      yearDiscontinued: parseIntVal(yearDiscontinued),
      isZoom,
      isMacro,
      isPrime,
      hasStabilization,
      hasAutofocus,
      specs: parsedSpecs,
      images: parsedImages,
    };

    setSaving(true);
    try {
      const res = await fetch(
        isEdit ? `/api/admin/lenses/${lens.id}` : "/api/admin/lenses",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save");
        return;
      }

      router.push("/admin/lenses");
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!lens) return;
    if (!window.confirm("Are you sure you want to delete this lens?")) return;

    try {
      await fetch(`/api/admin/lenses/${lens.id}`, { method: "DELETE" });
      router.push("/admin/lenses");
    } catch {
      setError("Failed to delete");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Basic Info */}
      <section className="space-y-4">
        <h3 className={sectionClass}>Basic Info</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className={labelClass}>Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className={`w-full ${inputClass}`}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Slug</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className={`w-full ${inputClass}`}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Brand</label>
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className={`w-full ${inputClass}`}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>System</label>
            <select
              value={systemId}
              onChange={(e) => setSystemId(e.target.value)}
              className={`w-full ${inputClass}`}
            >
              <option value="">-- None --</option>
              {systems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className={labelClass}>URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className={`w-full ${inputClass}`}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className={labelClass}>Description</label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`w-full ${inputClass}`}
            />
          </div>
        </div>
      </section>

      {/* Classification */}
      <section className="space-y-4">
        <h3 className={sectionClass}>Classification</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <label className={labelClass}>Lens Type</label>
            <input
              type="text"
              value={lensType}
              onChange={(e) => setLensType(e.target.value)}
              className={`w-full ${inputClass}`}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Era</label>
            <input
              type="text"
              value={era}
              onChange={(e) => setEra(e.target.value)}
              className={`w-full ${inputClass}`}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Production Status</label>
            <input
              type="text"
              value={productionStatus}
              onChange={(e) => setProductionStatus(e.target.value)}
              className={`w-full ${inputClass}`}
            />
          </div>
        </div>
      </section>

      {/* Optical Specs */}
      <section className="space-y-4">
        <h3 className={sectionClass}>Optical Specs</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <label className={labelClass}>Focal Length Min</label>
            <input
              type="number"
              value={focalLengthMin}
              onChange={(e) => setFocalLengthMin(e.target.value)}
              className={`w-full ${inputClass}`}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Focal Length Max</label>
            <input
              type="number"
              value={focalLengthMax}
              onChange={(e) => setFocalLengthMax(e.target.value)}
              className={`w-full ${inputClass}`}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Aperture Min</label>
            <input
              type="number"
              step="0.1"
              value={apertureMin}
              onChange={(e) => setApertureMin(e.target.value)}
              className={`w-full ${inputClass}`}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Aperture Max</label>
            <input
              type="number"
              step="0.1"
              value={apertureMax}
              onChange={(e) => setApertureMax(e.target.value)}
              className={`w-full ${inputClass}`}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Lens Elements</label>
            <input
              type="number"
              value={lensElements}
              onChange={(e) => setLensElements(e.target.value)}
              className={`w-full ${inputClass}`}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Lens Groups</label>
            <input
              type="number"
              value={lensGroups}
              onChange={(e) => setLensGroups(e.target.value)}
              className={`w-full ${inputClass}`}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Diaphragm Blades</label>
            <input
              type="number"
              value={diaphragmBlades}
              onChange={(e) => setDiaphragmBlades(e.target.value)}
              className={`w-full ${inputClass}`}
            />
          </div>
        </div>
      </section>

      {/* Physical */}
      <section className="space-y-4">
        <h3 className={sectionClass}>Physical</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <label className={labelClass}>Weight (g)</label>
            <input
              type="number"
              value={weightG}
              onChange={(e) => setWeightG(e.target.value)}
              className={`w-full ${inputClass}`}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Filter Size (mm)</label>
            <input
              type="number"
              value={filterSizeMm}
              onChange={(e) => setFilterSizeMm(e.target.value)}
              className={`w-full ${inputClass}`}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Min Focus Distance (m)</label>
            <input
              type="number"
              step="0.01"
              value={minFocusDistanceM}
              onChange={(e) => setMinFocusDistanceM(e.target.value)}
              className={`w-full ${inputClass}`}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Max Magnification</label>
            <input
              type="number"
              step="0.01"
              value={maxMagnification}
              onChange={(e) => setMaxMagnification(e.target.value)}
              className={`w-full ${inputClass}`}
            />
          </div>
        </div>
      </section>

      {/* Production */}
      <section className="space-y-4">
        <h3 className={sectionClass}>Production</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className={labelClass}>Year Introduced</label>
            <input
              type="number"
              value={yearIntroduced}
              onChange={(e) => setYearIntroduced(e.target.value)}
              className={`w-full ${inputClass}`}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Year Discontinued</label>
            <input
              type="number"
              value={yearDiscontinued}
              onChange={(e) => setYearDiscontinued(e.target.value)}
              className={`w-full ${inputClass}`}
            />
          </div>
        </div>
      </section>

      {/* Flags */}
      <section className="space-y-4">
        <h3 className={sectionClass}>Flags</h3>
        <div className="flex flex-wrap gap-6">
          {[
            { label: "Zoom", value: isZoom, set: setIsZoom },
            { label: "Macro", value: isMacro, set: setIsMacro },
            { label: "Prime", value: isPrime, set: setIsPrime },
            { label: "Stabilization", value: hasStabilization, set: setHasStabilization },
            { label: "Autofocus", value: hasAutofocus, set: setHasAutofocus },
          ].map((flag) => (
            <label key={flag.label} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={flag.value}
                onChange={(e) => flag.set(e.target.checked)}
              />
              {flag.label}
            </label>
          ))}
        </div>
      </section>

      {/* Data */}
      <section className="space-y-4">
        <h3 className={sectionClass}>Data</h3>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className={labelClass}>Specs (JSON)</label>
            <textarea
              rows={6}
              value={specs}
              onChange={(e) => setSpecs(e.target.value)}
              className={`w-full font-mono ${inputClass}`}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Images (JSON)</label>
            <textarea
              rows={4}
              value={images}
              onChange={(e) => setImages(e.target.value)}
              className={`w-full font-mono ${inputClass}`}
            />
          </div>
        </div>
      </section>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-zinc-900 px-6 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {saving ? "Saving..." : isEdit ? "Update Lens" : "Create Lens"}
        </button>
        {isEdit && (
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
