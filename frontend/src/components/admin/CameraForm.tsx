"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ImageUploader from "@/components/admin/ImageUploader";

interface CameraData {
  id: number;
  name: string;
  slug: string;
  url?: string | null;
  systemId?: number | null;
  description?: string | null;
  alias?: string | null;
  sensorType?: string | null;
  sensorSize?: string | null;
  megapixels?: number | null;
  resolution?: string | null;
  yearIntroduced?: number | null;
  bodyType?: string | null;
  weightG?: number | null;
  verified?: boolean | null;
  specs?: unknown;
  images?: unknown;
}

interface CameraFormProps {
  camera?: CameraData;
  systems: { id: number; name: string }[];
}

const inputClass =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const sectionClass = "text-lg font-semibold text-zinc-900 dark:text-zinc-100";

function generateSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function CameraForm({ camera, systems }: CameraFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(camera?.name ?? "");
  const [slug, setSlug] = useState(camera?.slug ?? "");
  const [url, setUrl] = useState(camera?.url ?? "");
  const [systemId, setSystemId] = useState<number | "">(camera?.systemId ?? "");
  const [description, setDescription] = useState(camera?.description ?? "");
  const [alias, setAlias] = useState(camera?.alias ?? "");
  const [sensorType, setSensorType] = useState(camera?.sensorType ?? "");
  const [sensorSize, setSensorSize] = useState(camera?.sensorSize ?? "");
  const [megapixels, setMegapixels] = useState(camera?.megapixels?.toString() ?? "");
  const [resolution, setResolution] = useState(camera?.resolution ?? "");
  const [yearIntroduced, setYearIntroduced] = useState(camera?.yearIntroduced?.toString() ?? "");
  const [bodyType, setBodyType] = useState(camera?.bodyType ?? "");
  const [weightG, setWeightG] = useState(camera?.weightG?.toString() ?? "");
  const [specsEntries, setSpecsEntries] = useState<[string, string][]>(() => {
    if (!camera?.specs || typeof camera.specs !== "object") return [];
    return Object.entries(camera.specs as Record<string, string>).map(
      ([k, v]) => [k, String(v ?? "")]
    );
  });
  const initialImages = (Array.isArray(camera?.images) ? camera.images : []) as { src: string; alt: string }[];

  const isEdit = !!camera;

  function handleNameChange(value: string) {
    setName(value);
    if (!isEdit) {
      setSlug(generateSlug(value));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const parsedSpecs: Record<string, string> = {};
    for (const [k, v] of specsEntries) {
      const key = k.trim();
      if (key) parsedSpecs[key] = v;
    }
    const body = {
      name,
      slug,
      url: url || null,
      systemId: systemId || null,
      description: description || null,
      alias: alias || null,
      sensorType: sensorType || null,
      sensorSize: sensorSize || null,
      megapixels: megapixels ? Number(megapixels) : null,
      resolution: resolution || null,
      yearIntroduced: yearIntroduced ? Number(yearIntroduced) : null,
      bodyType: bodyType || null,
      weightG: weightG ? Number(weightG) : null,
      specs: parsedSpecs,
    };

    try {
      const res = await fetch(
        isEdit ? `/api/admin/cameras/${camera.id}` : "/api/admin/cameras",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      router.push("/admin/cameras");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this camera?")) return;

    try {
      await fetch(`/api/admin/cameras/${camera!.id}`, { method: "DELETE" });
      router.push("/admin/cameras");
    } catch {
      setError("Failed to delete");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
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
          <div className="space-y-1 sm:col-span-2">
            <label className={labelClass}>Alias (alternative name, e.g. &quot;N90&quot; for &quot;F90&quot;)</label>
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="e.g. Nikon N90"
              className={`w-full ${inputClass}`}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>System</label>
            <select
              value={systemId}
              onChange={(e) => setSystemId(e.target.value ? Number(e.target.value) : "")}
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
          <div className="space-y-1">
            <label className={labelClass}>Body Type</label>
            <input
              type="text"
              value={bodyType}
              onChange={(e) => setBodyType(e.target.value)}
              className={`w-full ${inputClass}`}
            />
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
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={`w-full ${inputClass}`}
            />
          </div>
        </div>
      </section>

      {/* Sensor & Image */}
      <section className="space-y-4">
        <h3 className={sectionClass}>Sensor & Image</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <label className={labelClass}>Sensor Type</label>
            <input
              type="text"
              value={sensorType}
              onChange={(e) => setSensorType(e.target.value)}
              className={`w-full ${inputClass}`}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Sensor Size</label>
            <input
              type="text"
              value={sensorSize}
              onChange={(e) => setSensorSize(e.target.value)}
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
              className={`w-full ${inputClass}`}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Resolution</label>
            <input
              type="text"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              className={`w-full ${inputClass}`}
            />
          </div>
        </div>
      </section>

      {/* Physical */}
      <section className="space-y-4">
        <h3 className={sectionClass}>Physical</h3>
        <div className="grid gap-4 sm:grid-cols-3">
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
            <label className={labelClass}>Year Introduced</label>
            <input
              type="number"
              value={yearIntroduced}
              onChange={(e) => setYearIntroduced(e.target.value)}
              className={`w-full ${inputClass}`}
            />
          </div>
        </div>
      </section>

      {/* Specs */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className={sectionClass}>Specs ({specsEntries.length})</h3>
          <button
            type="button"
            onClick={() => setSpecsEntries([...specsEntries, ["", ""]])}
            className="cursor-pointer rounded-md bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            + Add field
          </button>
        </div>
        {specsEntries.length > 0 ? (
          <div className="space-y-2">
            {specsEntries.map(([key, value], i) => (
              <div key={i} className="flex items-start gap-2">
                <input
                  type="text"
                  value={key}
                  onChange={(e) => {
                    const next = [...specsEntries];
                    next[i] = [e.target.value, value];
                    setSpecsEntries(next);
                  }}
                  placeholder="Key"
                  className={`w-40 shrink-0 ${inputClass}`}
                />
                <input
                  type="text"
                  value={value}
                  onChange={(e) => {
                    const next = [...specsEntries];
                    next[i] = [key, e.target.value];
                    setSpecsEntries(next);
                  }}
                  placeholder="Value"
                  className={`min-w-0 flex-1 ${inputClass}`}
                />
                <button
                  type="button"
                  onClick={() =>
                    setSpecsEntries(specsEntries.filter((_, j) => j !== i))
                  }
                  className="cursor-pointer shrink-0 rounded-md p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
                  title="Remove"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-400">No specs fields</p>
        )}
      </section>

      {/* Images */}
      <section className="space-y-4">
        <h3 className={sectionClass}>Images</h3>
        {camera?.id ? (
          <ImageUploader
            entityType="cameras"
            entityId={camera.id}
            entityName={camera?.name || ""}
            initialImages={initialImages}
          />
        ) : (
          <p className="text-sm text-zinc-500">Save the camera first to enable image uploads.</p>
        )}
      </section>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-zinc-900 px-6 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {saving ? "Saving..." : isEdit ? "Update Camera" : "Create Camera"}
        </button>

        {isEdit && (
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
