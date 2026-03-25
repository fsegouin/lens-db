"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type SystemOption = { id: number; name: string };

const lensFields = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "brand", label: "Brand", type: "text" },
  { name: "description", label: "Description", type: "textarea" },
  { name: "systemId", label: "Mount System", type: "select" },
  { name: "url", label: "Reference URL", type: "text" },
  { name: "lensType", label: "Lens Type", type: "text", placeholder: "e.g. Standard, Wide Angle, Telephoto" },
  { name: "era", label: "Era", type: "text", placeholder: "e.g. Modern, Vintage" },
  { name: "productionStatus", label: "Production Status", type: "text", placeholder: "e.g. Current, Discontinued" },
  { name: "focalLengthMin", label: "Focal Length Min (mm)", type: "number" },
  { name: "focalLengthMax", label: "Focal Length Max (mm)", type: "number" },
  { name: "apertureMin", label: "Max Aperture (f/)", type: "number" },
  { name: "apertureMax", label: "Min Aperture (f/)", type: "number" },
  { name: "weightG", label: "Weight (g)", type: "number" },
  { name: "filterSizeMm", label: "Filter Size (mm)", type: "number" },
  { name: "minFocusDistanceM", label: "Min Focus Distance (m)", type: "number" },
  { name: "maxMagnification", label: "Max Magnification", type: "number" },
  { name: "lensElements", label: "Lens Elements", type: "number" },
  { name: "lensGroups", label: "Lens Groups", type: "number" },
  { name: "diaphragmBlades", label: "Diaphragm Blades", type: "number" },
  { name: "yearIntroduced", label: "Year Introduced", type: "number" },
  { name: "yearDiscontinued", label: "Year Discontinued", type: "number" },
  { name: "hasAutofocus", label: "Has Autofocus", type: "boolean" },
  { name: "hasStabilization", label: "Has Stabilization", type: "boolean" },
  { name: "isZoom", label: "Zoom Lens", type: "boolean" },
  { name: "isMacro", label: "Macro Lens", type: "boolean" },
  { name: "isPrime", label: "Prime Lens", type: "boolean" },
] as const;

const cameraFields = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "description", label: "Description", type: "textarea" },
  { name: "systemId", label: "Mount System", type: "select" },
  { name: "url", label: "Reference URL", type: "text" },
  { name: "alias", label: "Alias", type: "text" },
  { name: "sensorType", label: "Sensor Type", type: "text", placeholder: "e.g. CMOS, CCD" },
  { name: "sensorSize", label: "Sensor Size", type: "text", placeholder: "e.g. Full Frame, APS-C" },
  { name: "megapixels", label: "Megapixels", type: "number" },
  { name: "resolution", label: "Resolution", type: "text", placeholder: "e.g. 6000x4000" },
  { name: "yearIntroduced", label: "Year Introduced", type: "number" },
  { name: "bodyType", label: "Body Type", type: "text", placeholder: "e.g. SLR, Mirrorless, Rangefinder" },
  { name: "weightG", label: "Weight (g)", type: "number" },
] as const;

export default function SubmitForm({ systems }: { systems: SystemOption[] }) {
  const router = useRouter();
  const [entityType, setEntityType] = useState<"lens" | "camera">("lens");
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    pending: boolean;
    slug?: string;
    entityType?: string;
  } | null>(null);

  const fields = entityType === "lens" ? lensFields : cameraFields;

  function handleTypeChange(type: "lens" | "camera") {
    setEntityType(type);
    setFormData({});
    setSummary("");
    setError("");
    setResult(null);
  }

  function updateField(name: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          data: formData,
          summary: summary.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Submission failed");
        return;
      }

      setResult({
        pending: data.pending,
        slug: data.slug,
        entityType: data.entityType,
      });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-6 dark:border-emerald-800/50 dark:bg-emerald-950/20">
        <h2 className="mb-2 text-lg font-semibold text-emerald-800 dark:text-emerald-200">
          {result.pending ? "Submitted for Review" : "Entry Created"}
        </h2>
        <p className="mb-4 text-sm text-emerald-700 dark:text-emerald-300">
          {result.pending
            ? "Your submission has been queued for admin review. You'll see it appear once approved."
            : `Your ${result.entityType} has been added to the database.`}
        </p>
        <div className="flex gap-2">
          {!result.pending && result.slug && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                router.push(
                  result.entityType === "lens"
                    ? `/lenses/${result.slug}`
                    : `/cameras/${result.slug}`
                )
              }
            >
              View Entry
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFormData({});
              setSummary("");
              setResult(null);
            }}
          >
            Submit Another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Entity type toggle */}
      <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
        <button
          type="button"
          onClick={() => handleTypeChange("lens")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            entityType === "lens"
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          Lens
        </button>
        <button
          type="button"
          onClick={() => handleTypeChange("camera")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            entityType === "camera"
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          Camera
        </button>
      </div>

      {/* Form fields */}
      <div className="space-y-4">
        {fields.map((field) => (
          <div key={field.name}>
            <label
              htmlFor={field.name}
              className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              {field.label}
              {"required" in field && field.required && (
                <span className="ml-1 text-red-500">*</span>
              )}
            </label>

            {field.type === "textarea" ? (
              <Textarea
                id={field.name}
                value={(formData[field.name] as string) ?? ""}
                onChange={(e) => updateField(field.name, e.target.value)}
                placeholder={"placeholder" in field ? (field.placeholder as string) : undefined}
                rows={3}
              />
            ) : field.type === "select" ? (
              <select
                id={field.name}
                value={(formData[field.name] as string) ?? ""}
                onChange={(e) =>
                  updateField(
                    field.name,
                    e.target.value ? Number(e.target.value) : null
                  )
                }
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                <option value="">Select...</option>
                {systems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : field.type === "boolean" ? (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!formData[field.name]}
                  onChange={(e) => updateField(field.name, e.target.checked)}
                  className="size-4 rounded border-zinc-300 dark:border-zinc-600"
                />
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  Yes
                </span>
              </label>
            ) : (
              <Input
                id={field.name}
                type={field.type}
                value={(formData[field.name] as string) ?? ""}
                onChange={(e) => updateField(field.name, e.target.value)}
                placeholder={"placeholder" in field ? (field.placeholder as string) : undefined}
                required={"required" in field && field.required}
              />
            )}
          </div>
        ))}
      </div>

      {/* Summary */}
      <div>
        <label
          htmlFor="summary"
          className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Edit Summary <span className="ml-1 text-red-500">*</span>
        </label>
        <Input
          id="summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Brief description of this submission"
          required
          maxLength={500}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Briefly describe what you&apos;re adding (3-500 characters)
        </p>
      </div>

      {error && (
        <p className="text-sm font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <Button type="submit" disabled={submitting}>
        {submitting ? "Submitting..." : "Submit"}
      </Button>
    </form>
  );
}
