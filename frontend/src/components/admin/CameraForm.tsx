"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface CameraData {
  id: number;
  name: string;
  slug: string;
  url?: string | null;
  systemId?: number | null;
  description?: string | null;
  sensorType?: string | null;
  sensorSize?: string | null;
  megapixels?: number | null;
  resolution?: string | null;
  yearIntroduced?: number | null;
  bodyType?: string | null;
  weightG?: number | null;
  specs?: unknown;
  images?: unknown;
}

interface CameraFormProps {
  camera?: CameraData;
  systems: { id: number; name: string }[];
}

const inputClass =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

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
  const [sensorType, setSensorType] = useState(camera?.sensorType ?? "");
  const [sensorSize, setSensorSize] = useState(camera?.sensorSize ?? "");
  const [megapixels, setMegapixels] = useState(camera?.megapixels?.toString() ?? "");
  const [resolution, setResolution] = useState(camera?.resolution ?? "");
  const [yearIntroduced, setYearIntroduced] = useState(camera?.yearIntroduced?.toString() ?? "");
  const [bodyType, setBodyType] = useState(camera?.bodyType ?? "");
  const [weightG, setWeightG] = useState(camera?.weightG?.toString() ?? "");
  const [specs, setSpecs] = useState(camera?.specs ? JSON.stringify(camera.specs, null, 2) : "");
  const [images, setImages] = useState(camera?.images ? JSON.stringify(camera.images, null, 2) : "");

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

    let parsedSpecs = {};
    let parsedImages: unknown[] = [];

    if (specs.trim()) {
      try {
        parsedSpecs = JSON.parse(specs);
      } catch {
        setError("Invalid JSON in specs");
        setSaving(false);
        return;
      }
    }

    if (images.trim()) {
      try {
        parsedImages = JSON.parse(images);
      } catch {
        setError("Invalid JSON in images");
        setSaving(false);
        return;
      }
    }

    const body = {
      name,
      slug,
      url: url || null,
      systemId: systemId || null,
      description: description || null,
      sensorType: sensorType || null,
      sensorSize: sensorSize || null,
      megapixels: megapixels ? Number(megapixels) : null,
      resolution: resolution || null,
      yearIntroduced: yearIntroduced ? Number(yearIntroduced) : null,
      bodyType: bodyType || null,
      weightG: weightG ? Number(weightG) : null,
      specs: parsedSpecs,
      images: parsedImages,
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
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-1">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Name *
        </label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          className={`w-full ${inputClass}`}
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Slug
        </label>
        <input
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className={`w-full ${inputClass}`}
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          System
        </label>
        <select
          value={systemId}
          onChange={(e) => setSystemId(e.target.value ? Number(e.target.value) : "")}
          className={`w-full ${inputClass}`}
        >
          <option value="">— None —</option>
          {systems.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          URL
        </label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className={`w-full ${inputClass}`}
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className={`w-full ${inputClass}`}
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Sensor Type
        </label>
        <input
          type="text"
          value={sensorType}
          onChange={(e) => setSensorType(e.target.value)}
          className={`w-full ${inputClass}`}
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Sensor Size
        </label>
        <input
          type="text"
          value={sensorSize}
          onChange={(e) => setSensorSize(e.target.value)}
          className={`w-full ${inputClass}`}
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Megapixels
        </label>
        <input
          type="number"
          step="0.1"
          value={megapixels}
          onChange={(e) => setMegapixels(e.target.value)}
          className={`w-full ${inputClass}`}
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Resolution
        </label>
        <input
          type="text"
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          className={`w-full ${inputClass}`}
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Year Introduced
        </label>
        <input
          type="number"
          value={yearIntroduced}
          onChange={(e) => setYearIntroduced(e.target.value)}
          className={`w-full ${inputClass}`}
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Body Type
        </label>
        <input
          type="text"
          value={bodyType}
          onChange={(e) => setBodyType(e.target.value)}
          className={`w-full ${inputClass}`}
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Weight (g)
        </label>
        <input
          type="number"
          value={weightG}
          onChange={(e) => setWeightG(e.target.value)}
          className={`w-full ${inputClass}`}
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Specs (JSON)
        </label>
        <textarea
          value={specs}
          onChange={(e) => setSpecs(e.target.value)}
          rows={6}
          className={`w-full font-mono ${inputClass}`}
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Images (JSON)
        </label>
        <textarea
          value={images}
          onChange={(e) => setImages(e.target.value)}
          rows={4}
          className={`w-full font-mono ${inputClass}`}
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
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
