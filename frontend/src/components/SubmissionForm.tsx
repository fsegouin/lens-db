"use client";

import { useState } from "react";
import ComboboxInput from "@/components/admin/ComboboxInput";

interface SubmissionFormProps {
  systems: { id: number; name: string }[];
  tags: { brands: string[]; lensTypes: string[]; eras: string[]; productionStatuses: string[] };
}

const inputClass =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const sectionClass = "text-lg font-semibold text-zinc-900 dark:text-zinc-100";

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

export default function SubmissionForm({ systems, tags }: SubmissionFormProps) {
  const [mode, setMode] = useState<"lens" | "camera">("lens");

  // Shared fields
  const [name, setName] = useState("");
  const [systemId, setSystemId] = useState("");
  const [description, setDescription] = useState("");

  // Lens fields
  const [brand, setBrand] = useState("");
  const [lensType, setLensType] = useState("");
  const [era, setEra] = useState("");
  const [productionStatus, setProductionStatus] = useState("");
  const [focalLengthMin, setFocalLengthMin] = useState("");
  const [focalLengthMax, setFocalLengthMax] = useState("");
  const [apertureMin, setApertureMin] = useState("");
  const [apertureMax, setApertureMax] = useState("");
  const [lensElements, setLensElements] = useState("");
  const [lensGroups, setLensGroups] = useState("");
  const [diaphragmBlades, setDiaphragmBlades] = useState("");
  const [lensWeightG, setLensWeightG] = useState("");
  const [filterSizeMm, setFilterSizeMm] = useState("");
  const [minFocusDistanceM, setMinFocusDistanceM] = useState("");
  const [maxMagnification, setMaxMagnification] = useState("");
  const [lensYearIntroduced, setLensYearIntroduced] = useState("");
  const [yearDiscontinued, setYearDiscontinued] = useState("");
  const [isZoom, setIsZoom] = useState(false);
  const [isMacro, setIsMacro] = useState(false);
  const [isPrime, setIsPrime] = useState(false);
  const [hasStabilization, setHasStabilization] = useState(false);
  const [hasAutofocus, setHasAutofocus] = useState(false);

  // Camera fields
  const [alias, setAlias] = useState("");
  const [bodyType, setBodyType] = useState("");
  const [sensorType, setSensorType] = useState("");
  const [sensorSize, setSensorSize] = useState("");
  const [megapixels, setMegapixels] = useState("");
  const [resolution, setResolution] = useState("");
  const [cameraWeightG, setCameraWeightG] = useState("");
  const [cameraYearIntroduced, setCameraYearIntroduced] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ slug: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(null);
    setSaving(true);

    try {
      const payload: Record<string, unknown> = { entityType: mode };

      if (mode === "lens") {
        Object.assign(payload, {
          name,
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
          weightG: parseNum(lensWeightG),
          filterSizeMm: parseNum(filterSizeMm),
          minFocusDistanceM: parseNum(minFocusDistanceM),
          maxMagnification: parseNum(maxMagnification),
          lensElements: parseIntVal(lensElements),
          lensGroups: parseIntVal(lensGroups),
          diaphragmBlades: parseIntVal(diaphragmBlades),
          yearIntroduced: parseIntVal(lensYearIntroduced),
          yearDiscontinued: parseIntVal(yearDiscontinued),
          isZoom,
          isMacro,
          isPrime,
          hasStabilization,
          hasAutofocus,
        });
      } else {
        Object.assign(payload, {
          name,
          systemId: systemId ? parseInt(systemId, 10) : null,
          description: description || null,
          alias: alias || null,
          bodyType: bodyType || null,
          sensorType: sensorType || null,
          sensorSize: sensorSize || null,
          megapixels: parseNum(megapixels),
          resolution: resolution || null,
          weightG: parseNum(cameraWeightG),
          yearIntroduced: parseIntVal(cameraYearIntroduced),
        });
      }

      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 201) {
        const data = await res.json();
        setSuccess({ slug: data.slug });
        return;
      }

      if (res.status === 429) {
        setError(
          "You've reached the daily submission limit (5 per day). Please try again tomorrow."
        );
        return;
      }

      if (res.status === 403) {
        setError("Submission blocked by bot protection. Please reload and try again.");
        return;
      }

      const data = await res.json();
      setError(data.error || "Something went wrong");
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  if (success) {
    const path = mode === "lens" ? `/lenses/${success.slug}` : `/cameras/${success.slug}`;
    return (
      <div className="rounded-lg border border-green-300 bg-green-50 px-6 py-8 text-center dark:border-green-800 dark:bg-green-950">
        <h3 className="text-lg font-semibold text-green-800 dark:text-green-300">
          Submission received!
        </h3>
        <p className="mt-2 text-sm text-green-700 dark:text-green-400">
          Your {mode} has been added with an &ldquo;Unverified&rdquo; badge. An admin will review it
          shortly.
        </p>
        <a
          href={path}
          className="mt-4 inline-block rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-500"
        >
          View {mode === "lens" ? "Lens" : "Camera"} Page
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="flex rounded-lg border border-zinc-300 dark:border-zinc-700 w-fit">
        <button
          type="button"
          onClick={() => setMode("lens")}
          className={`cursor-pointer px-5 py-2 text-sm font-medium rounded-l-lg transition-colors ${
            mode === "lens"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
        >
          Lens
        </button>
        <button
          type="button"
          onClick={() => setMode("camera")}
          className={`cursor-pointer px-5 py-2 text-sm font-medium rounded-r-lg transition-colors ${
            mode === "camera"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
        >
          Camera
        </button>
      </div>

      {/* Info banner */}
      <div className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
        Your submission will appear with an &ldquo;Unverified&rdquo; badge until reviewed by an
        admin.
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}

        {mode === "lens" ? (
          <>
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
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Canon RF 50mm F1.8 STM"
                    className={`w-full ${inputClass}`}
                  />
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Brand</label>
                  <ComboboxInput
                    value={brand}
                    onChange={setBrand}
                    options={tags.brands}
                    placeholder="e.g. Canon"
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
                    <option value="">Select a system</option>
                    {systems.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className={labelClass}>Description</label>
                  <textarea
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Add any useful context, history, or specs you know."
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
                  <ComboboxInput
                    value={lensType}
                    onChange={setLensType}
                    options={tags.lensTypes}
                    placeholder="e.g. Standard prime"
                    className={`w-full ${inputClass}`}
                  />
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Era</label>
                  <ComboboxInput
                    value={era}
                    onChange={setEra}
                    options={tags.eras}
                    placeholder="e.g. Modern"
                    className={`w-full ${inputClass}`}
                  />
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Production Status</label>
                  <ComboboxInput
                    value={productionStatus}
                    onChange={setProductionStatus}
                    options={tags.productionStatuses}
                    placeholder="e.g. In production"
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
                    placeholder="50"
                    className={`w-full ${inputClass}`}
                  />
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Focal Length Max</label>
                  <input
                    type="number"
                    value={focalLengthMax}
                    onChange={(e) => setFocalLengthMax(e.target.value)}
                    placeholder="70"
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
                    placeholder="1.8"
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
                    placeholder="16"
                    className={`w-full ${inputClass}`}
                  />
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Lens Elements</label>
                  <input
                    type="number"
                    value={lensElements}
                    onChange={(e) => setLensElements(e.target.value)}
                    placeholder="8"
                    className={`w-full ${inputClass}`}
                  />
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Lens Groups</label>
                  <input
                    type="number"
                    value={lensGroups}
                    onChange={(e) => setLensGroups(e.target.value)}
                    placeholder="6"
                    className={`w-full ${inputClass}`}
                  />
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Diaphragm Blades</label>
                  <input
                    type="number"
                    value={diaphragmBlades}
                    onChange={(e) => setDiaphragmBlades(e.target.value)}
                    placeholder="9"
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
                    value={lensWeightG}
                    onChange={(e) => setLensWeightG(e.target.value)}
                    placeholder="390"
                    className={`w-full ${inputClass}`}
                  />
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Filter Size (mm)</label>
                  <input
                    type="number"
                    value={filterSizeMm}
                    onChange={(e) => setFilterSizeMm(e.target.value)}
                    placeholder="67"
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
                    placeholder="0.45"
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
                    placeholder="0.21"
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
                    value={lensYearIntroduced}
                    onChange={(e) => setLensYearIntroduced(e.target.value)}
                    placeholder="2021"
                    className={`w-full ${inputClass}`}
                  />
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Year Discontinued</label>
                  <input
                    type="number"
                    value={yearDiscontinued}
                    onChange={(e) => setYearDiscontinued(e.target.value)}
                    placeholder="Leave blank if current"
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
                  <label
                    key={flag.label}
                    className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"
                  >
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
          </>
        ) : (
          <>
            {/* Camera: Basic Info */}
            <section className="space-y-4">
              <h3 className={sectionClass}>Basic Info</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className={labelClass}>Name *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Nikon Zf"
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
                    <option value="">Select a system</option>
                    {systems.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className={labelClass}>Alias</label>
                  <input
                    type="text"
                    value={alias}
                    onChange={(e) => setAlias(e.target.value)}
                    placeholder="e.g. Nikon Z f"
                    className={`w-full ${inputClass}`}
                  />
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Body Type</label>
                  <input
                    type="text"
                    value={bodyType}
                    onChange={(e) => setBodyType(e.target.value)}
                    placeholder="e.g. Mirrorless rangefinder-style"
                    className={`w-full ${inputClass}`}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className={labelClass}>Description</label>
                  <textarea
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Add any useful context, positioning, or notable features."
                    className={`w-full ${inputClass}`}
                  />
                </div>
              </div>
            </section>

            {/* Camera: Sensor */}
            <section className="space-y-4">
              <h3 className={sectionClass}>Sensor & Image</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <label className={labelClass}>Sensor Type</label>
                  <input
                    type="text"
                    value={sensorType}
                    onChange={(e) => setSensorType(e.target.value)}
                    placeholder="e.g. CMOS"
                    className={`w-full ${inputClass}`}
                  />
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Sensor Size</label>
                  <input
                    type="text"
                    value={sensorSize}
                    onChange={(e) => setSensorSize(e.target.value)}
                    placeholder="e.g. Full frame"
                    className={`w-full ${inputClass}`}
                  />
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Megapixels</label>
                  <input
                    type="number"
                    step="0.1"
                    value={megapixels}
                    onChange={(e) => setMegapixels(e.target.value)}
                    placeholder="24.5"
                    className={`w-full ${inputClass}`}
                  />
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Resolution</label>
                  <input
                    type="text"
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    placeholder="e.g. 6048 x 4032"
                    className={`w-full ${inputClass}`}
                  />
                </div>
              </div>
            </section>

            {/* Camera: Physical */}
            <section className="space-y-4">
              <h3 className={sectionClass}>Physical</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className={labelClass}>Weight (g)</label>
                  <input
                    type="number"
                    value={cameraWeightG}
                    onChange={(e) => setCameraWeightG(e.target.value)}
                    placeholder="710"
                    className={`w-full ${inputClass}`}
                  />
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Year Introduced</label>
                  <input
                    type="number"
                    value={cameraYearIntroduced}
                    onChange={(e) => setCameraYearIntroduced(e.target.value)}
                    placeholder="2023"
                    className={`w-full ${inputClass}`}
                  />
                </div>
              </div>
            </section>
          </>
        )}

        {/* Submit button */}
        <div>
          <button
            type="submit"
            disabled={saving}
            className="cursor-pointer rounded-lg bg-zinc-900 px-6 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {saving ? "Submitting..." : mode === "lens" ? "Submit Lens" : "Submit Camera"}
          </button>
        </div>
      </form>
    </div>
  );
}
