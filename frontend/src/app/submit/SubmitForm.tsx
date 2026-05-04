"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";

type SystemOption = { id: number; name: string };

type FieldDef = {
  name: string;
  label: string;
  type: "text" | "number" | "textarea" | "boolean" | "select" | "coverage";
  required?: boolean;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  group: string;
};

const lensFields: FieldDef[] = [
  { name: "name", label: "Name", type: "text", required: true, placeholder: "e.g. Sony FE 85mm F1.4 GM II", group: "Identity" },
  { name: "brand", label: "Brand", type: "text", placeholder: "Sony, Canon, Nikon…", group: "Identity" },
  { name: "systemId", label: "Mount system", type: "select", group: "Identity" },
  { name: "description", label: "Description", type: "textarea", placeholder: "Manufacturer copy or short overview…", group: "Identity" },
  { name: "url", label: "Reference URL", type: "text", placeholder: "https://…", group: "Identity" },
  { name: "coverage", label: "Coverage", type: "coverage", group: "Identity" },
  { name: "focalLengthMin", label: "Focal min", type: "number", suffix: "mm", group: "Optical" },
  { name: "focalLengthMax", label: "Focal max", type: "number", suffix: "mm", group: "Optical" },
  { name: "apertureMin", label: "Max aperture", type: "number", prefix: "ƒ/", group: "Optical" },
  { name: "apertureMax", label: "Min aperture", type: "number", prefix: "ƒ/", group: "Optical" },
  { name: "lensElements", label: "Elements", type: "number", group: "Optical" },
  { name: "lensGroups", label: "Groups", type: "number", group: "Optical" },
  { name: "diaphragmBlades", label: "Diaphragm blades", type: "number", group: "Optical" },
  { name: "minFocusDistanceM", label: "Min focus distance", type: "number", suffix: "m", group: "Optical" },
  { name: "maxMagnification", label: "Max magnification", type: "number", group: "Optical" },
  { name: "lensType", label: "Lens type", type: "text", placeholder: "Standard, Wide angle, Telephoto", group: "Optical" },
  { name: "weightG", label: "Weight", type: "number", suffix: "g", group: "Physical" },
  { name: "filterSizeMm", label: "Filter size", type: "number", suffix: "mm", group: "Physical" },
  { name: "yearIntroduced", label: "Year introduced", type: "number", group: "Physical" },
  { name: "yearDiscontinued", label: "Year discontinued", type: "number", group: "Physical" },
  { name: "era", label: "Era", type: "text", placeholder: "Modern, Vintage", group: "Physical" },
  { name: "productionStatus", label: "Status", type: "text", placeholder: "Current, Discontinued", group: "Physical" },
  { name: "hasAutofocus", label: "AF", type: "boolean", group: "Features" },
  { name: "hasStabilization", label: "Stabilized", type: "boolean", group: "Features" },
  { name: "isZoom", label: "Zoom", type: "boolean", group: "Features" },
  { name: "isPrime", label: "Prime", type: "boolean", group: "Features" },
  { name: "isMacro", label: "Macro", type: "boolean", group: "Features" },
];

const cameraFields: FieldDef[] = [
  { name: "name", label: "Name", type: "text", required: true, placeholder: "e.g. Sony α7R V", group: "Identity" },
  { name: "alias", label: "Alias", type: "text", placeholder: "ILCE-7RM5", group: "Identity" },
  { name: "systemId", label: "Mount system", type: "select", group: "Identity" },
  { name: "description", label: "Description", type: "textarea", group: "Identity" },
  { name: "url", label: "Reference URL", type: "text", placeholder: "https://…", group: "Identity" },
  { name: "sensorType", label: "Sensor type", type: "text", placeholder: "CMOS, CCD", group: "Sensor" },
  { name: "sensorSize", label: "Sensor size", type: "text", placeholder: "Full frame, APS-C", group: "Sensor" },
  { name: "megapixels", label: "Megapixels", type: "number", group: "Sensor" },
  { name: "resolution", label: "Resolution", type: "text", placeholder: "8000×5320", group: "Sensor" },
  { name: "bodyType", label: "Body type", type: "text", placeholder: "Mirrorless, SLR, Rangefinder", group: "Body" },
  { name: "weightG", label: "Weight", type: "number", suffix: "g", group: "Body" },
  { name: "yearIntroduced", label: "Year introduced", type: "number", group: "Body" },
];

function ApertureBladeViz({ blades }: { blades: number | null }) {
  if (!blades || blades < 3) {
    return (
      <svg viewBox="0 0 100 100" width="34" height="34" aria-hidden="true">
        <circle cx="50" cy="50" r="38" fill="none" stroke="var(--line)" strokeDasharray="3 3" />
      </svg>
    );
  }
  const points: string[] = [];
  for (let i = 0; i < blades; i++) {
    const angle = (i / blades) * Math.PI * 2 - Math.PI / 2;
    const x = 50 + Math.cos(angle) * 38;
    const y = 50 + Math.sin(angle) * 38;
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return (
    <svg viewBox="0 0 100 100" width="34" height="34" aria-hidden="true">
      <polygon
        points={points.join(" ")}
        fill="color-mix(in oklch, var(--fg) 8%, transparent)"
        stroke="var(--fg)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
  const draftId = useMemo(
    () => `DFT-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    [],
  );

  const groups = useMemo(() => {
    const out: Record<string, FieldDef[]> = {};
    for (const f of fields) {
      (out[f.group] ||= []).push(f);
    }
    return out;
  }, [fields]);

  const requiredFields = fields.filter((f) => f.required);
  const filledRequired = requiredFields.filter((f) => formData[f.name]).length;
  const totalFilled = fields.filter((f) => formData[f.name] != null && formData[f.name] !== "").length;
  const ready = filledRequired === requiredFields.length && summary.trim().length >= 3;

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
      <div className="rounded-xl border border-[color-mix(in_oklch,var(--pos)_40%,var(--border))] bg-[color-mix(in_oklch,var(--pos)_8%,var(--background))] p-6">
        <div className="mono mb-2 text-[10px] uppercase tracking-[0.1em] text-[var(--pos)]">
          ● {result.pending ? "queued for review" : "published"}
        </div>
        <h2 className="mb-2 text-[20px] font-medium -tracking-[0.015em]">
          {result.pending ? "Submitted for review" : "Entry created"}
        </h2>
        <p className="mb-5 text-[14px] leading-[1.55] text-[var(--fg-mid)]">
          {result.pending
            ? "Your submission has been queued for admin review. It will appear in the public index once approved."
            : `Your ${result.entityType} has been added to the database.`}
        </p>
        <div className="flex flex-wrap gap-2">
          {!result.pending && result.slug && (
            <button
              type="button"
              onClick={() =>
                router.push(
                  result.entityType === "lens"
                    ? `/lenses/${result.slug}`
                    : `/cameras/${result.slug}`,
                )
              }
              className="mono rounded-md bg-foreground px-3 py-1.5 text-[12px] font-medium text-background hover:opacity-90"
            >
              View entry →
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setFormData({});
              setSummary("");
              setResult(null);
            }}
            className="mono rounded-md border border-border bg-background px-3 py-1.5 text-[12px] text-[var(--fg-mid)] hover:border-[var(--line-strong)] hover:text-foreground"
          >
            Submit another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-8 lg:grid-cols-[1fr_280px]">
      <div className="min-w-0 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row">
          <EntityToggle
            active={entityType === "lens"}
            onClick={() => handleTypeChange("lens")}
            tag="A"
            label="Lens"
            count={lensFields.length}
            icon={<LensIcon />}
          />
          <EntityToggle
            active={entityType === "camera"}
            onClick={() => handleTypeChange("camera")}
            tag="B"
            label="Camera"
            count={cameraFields.length}
            icon={<CameraIcon />}
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-background">
          {Object.entries(groups).map(([groupName, groupFields], idx) => (
            <FormSection
              key={groupName}
              step={idx + 1}
              total={Object.keys(groups).length + 1}
              title={groupName}
              fields={groupFields}
              formData={formData}
              updateField={updateField}
              systems={systems}
            />
          ))}

          <div className="border-t border-border">
            <SectionHead step={Object.keys(groups).length + 1} total={Object.keys(groups).length + 1} title="Edit summary" />
            <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-[180px_1fr]">
              <label className="mono mt-1 flex items-center gap-2 text-[11px] tracking-[0.04em] text-[var(--fg-dim)]">
                <span className="rounded border border-border bg-[var(--surface-soft)] px-1 py-[1px] text-[9px] tracking-[0.1em] text-[var(--fg-faint)]">
                  {String(Object.keys(groups).reduce((acc, g) => acc + groups[g].length, 0) + 1).padStart(2, "0")}
                </span>
                Summary
                <span className="text-[var(--hot)]">*</span>
              </label>
              <input
                type="text"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Brief description of what you're adding"
                maxLength={500}
                required
                className="rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none transition-colors focus:border-[var(--line-strong)]"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-border bg-[var(--surface-soft)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="mono text-[11px] text-[var(--fg-dim)]">
              <span className="text-[var(--fg-faint)]">valid</span>{" "}
              <span className="text-foreground">
                {totalFilled} / {fields.length}
              </span>{" "}
              fields ·{" "}
              <span style={{ color: ready ? "var(--pos)" : "var(--fg-faint)" }}>
                {ready ? "● ready to submit" : "○ summary required"}
              </span>
            </div>
            <button
              type="submit"
              disabled={submitting || !ready}
              className="mono rounded-md bg-foreground px-3.5 py-2 text-[12px] font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {submitting ? "Submitting…" : "Submit for review →"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mono rounded-md border border-[color-mix(in_oklch,var(--hot)_40%,var(--border))] bg-[color-mix(in_oklch,var(--hot)_8%,var(--background))] px-3 py-2 text-[12px] text-[var(--hot)]">
            ● {error}
          </div>
        )}
      </div>

      <PreviewSidebar
        entityType={entityType}
        formData={formData}
        systems={systems}
        draftId={draftId}
      />
    </form>
  );
}

function EntityToggle({
  active,
  onClick,
  tag,
  label,
  count,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  tag: string;
  label: string;
  count: number;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition-all ${
        active
          ? "border-[var(--line-strong)] bg-[var(--surface-soft)]"
          : "border-border bg-background hover:border-[var(--line-strong)] hover:bg-[var(--surface-soft)]"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={active ? "text-foreground" : "text-[var(--fg-dim)]"}>{icon}</span>
        <div>
          <div className="mono text-[9px] uppercase tracking-[0.12em] text-[var(--fg-faint)]">
            entity type {tag}
          </div>
          <div className="text-[15px] font-medium -tracking-[0.01em]">{label}</div>
        </div>
      </div>
      <span className="mono text-[10px] text-[var(--fg-faint)]">{count} fields</span>
    </button>
  );
}

function LensIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7l2-3h4l2 3" />
      <circle cx="12" cy="13.5" r="3.5" />
    </svg>
  );
}

function SectionHead({
  step,
  total,
  title,
  count,
}: {
  step: number;
  total: number;
  title: string;
  count?: string;
}) {
  return (
    <div className="flex items-center gap-3.5 border-b border-border bg-[var(--surface-soft)] px-5 py-2.5">
      <span className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--fg-faint)]">
        Step {step}/{total}
      </span>
      <h3 className="text-[14px] font-medium">{title}</h3>
      {count && (
        <span className="mono ml-auto text-[10px] tracking-[0.04em] text-[var(--fg-faint)]">
          {count}
        </span>
      )}
    </div>
  );
}

function FormSection({
  step,
  total,
  title,
  fields,
  formData,
  updateField,
  systems,
}: {
  step: number;
  total: number;
  title: string;
  fields: FieldDef[];
  formData: Record<string, unknown>;
  updateField: (name: string, value: unknown) => void;
  systems: SystemOption[];
}) {
  const reqCount = fields.filter((f) => f.required).length;
  const count = reqCount > 0 ? `${reqCount} required` : `${fields.length} fields`;

  return (
    <div className={step === 1 ? "" : "border-t border-border"}>
      <SectionHead step={step} total={total} title={title} count={count} />
      <div className="grid gap-3 px-5 py-4">
        {title === "Features" ? (
          <FeatureToggleRow fields={fields} formData={formData} updateField={updateField} startIdx={fieldStartIdx(step, fields)} />
        ) : (
          fields.map((field, i) => (
            <FormRow
              key={field.name}
              field={field}
              idx={fieldStartIdx(step, fields, i)}
              value={formData[field.name]}
              onChange={(v) => updateField(field.name, v)}
              systems={systems}
            />
          ))
        )}
      </div>
    </div>
  );
}

function fieldStartIdx(step: number, _fields: FieldDef[], offset = 0): number {
  // Just use a per-section running counter — we don't know cross-section; this is purely visual
  return offset + 1 + (step - 1) * 100;
}

function FormRow({
  field,
  idx,
  value,
  onChange,
  systems,
}: {
  field: FieldDef;
  idx: number;
  value: unknown;
  onChange: (v: unknown) => void;
  systems: SystemOption[];
}) {
  const idxLabel = String(idx % 100).padStart(2, "0");
  return (
    <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[180px_1fr] sm:items-center">
      <label
        htmlFor={field.name}
        className="mono flex items-center gap-2 text-[11px] tracking-[0.04em] text-[var(--fg-dim)]"
      >
        <span className="rounded border border-border bg-[var(--surface-soft)] px-1 py-[1px] text-[9px] tracking-[0.1em] text-[var(--fg-faint)]">
          {idxLabel}
        </span>
        <span>{field.label}</span>
        {field.required && <span className="text-[var(--hot)]">*</span>}
      </label>
      <FieldInput field={field} value={value} onChange={onChange} systems={systems} />
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  systems,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  systems: SystemOption[];
}) {
  const baseClass =
    "w-full min-w-0 rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none transition-colors focus:border-[var(--line-strong)]";

  if (field.type === "textarea") {
    return (
      <textarea
        id={field.name}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        rows={3}
        className={`${baseClass} resize-y`}
      />
    );
  }
  if (field.type === "select") {
    return (
      <select
        id={field.name}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className={baseClass}
      >
        <option value="">Select…</option>
        {systems.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "coverage") {
    return (
      <select
        id={field.name}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className={baseClass}
      >
        <option value="">Select…</option>
        <option value="full-frame">Full frame</option>
        <option value="aps-c">APS-C</option>
        <option value="micro-four-thirds">Micro four thirds</option>
        <option value="medium-format">Medium format</option>
      </select>
    );
  }
  if (field.type === "boolean") {
    // Used inside FeatureToggleRow only; render a no-op fallback if reached directly
    return (
      <label className="flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        Yes
      </label>
    );
  }
  // text or number — with optional prefix/suffix and inline blade viz for diaphragm blades
  const showBladeViz = field.name === "diaphragmBlades";
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 items-center gap-2 rounded-md border border-border bg-background px-3 py-2 transition-colors focus-within:border-[var(--line-strong)]">
        {field.prefix && (
          <span className="mono text-[11px] text-[var(--fg-faint)]">{field.prefix}</span>
        )}
        <input
          id={field.name}
          type={field.type}
          value={(value as string) ?? ""}
          onChange={(e) =>
            onChange(
              field.type === "number" && e.target.value !== ""
                ? Number(e.target.value)
                : e.target.value || null,
            )
          }
          placeholder={field.placeholder}
          required={field.required}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-[var(--fg-faint)]"
        />
        {field.suffix && (
          <span className="mono text-[11px] text-[var(--fg-faint)]">{field.suffix}</span>
        )}
      </div>
      {showBladeViz && (
        <ApertureBladeViz blades={typeof value === "number" ? value : null} />
      )}
    </div>
  );
}

function FeatureToggleRow({
  fields,
  formData,
  updateField,
  startIdx,
}: {
  fields: FieldDef[];
  formData: Record<string, unknown>;
  updateField: (name: string, value: unknown) => void;
  startIdx: number;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[180px_1fr]">
      <div className="mono mt-1 flex items-center gap-2 text-[11px] tracking-[0.04em] text-[var(--fg-dim)]">
        <span className="rounded border border-border bg-[var(--surface-soft)] px-1 py-[1px] text-[9px] tracking-[0.1em] text-[var(--fg-faint)]">
          {String(startIdx % 100).padStart(2, "0")}
        </span>
        Features
      </div>
      <div className="flex flex-wrap gap-1.5">
        {fields.map((f) => {
          const on = !!formData[f.name];
          return (
            <button
              key={f.name}
              type="button"
              onClick={() => updateField(f.name, !on)}
              className={`mono rounded-full border px-3 py-1 text-[11px] transition-colors ${
                on
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-[var(--fg-mid)] hover:border-[var(--line-strong)] hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PreviewSidebar({
  entityType,
  formData,
  systems,
  draftId,
}: {
  entityType: "lens" | "camera";
  formData: Record<string, unknown>;
  systems: SystemOption[];
  draftId: string;
}) {
  const name = (formData.name as string) ?? "";
  const brand = (formData.brand as string) ?? "";
  const systemId = formData.systemId as number | null;
  const systemName = systemId ? systems.find((s) => s.id === systemId)?.name : null;

  const titleParts = useMemo(() => {
    if (!name.trim()) return null;
    const trimmed = name.trim();
    const spaceIdx = trimmed.lastIndexOf(" ");
    if (spaceIdx > 0) return { main: trimmed.slice(0, spaceIdx + 1), em: trimmed.slice(spaceIdx + 1) };
    return { main: "", em: trimmed };
  }, [name]);

  return (
    <aside className="lg:sticky lg:top-[80px] lg:self-start">
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-border bg-background">
          <div className="flex items-center justify-between border-b border-border bg-[var(--surface-soft)] px-4 py-2.5">
            <h3 className="text-[12px] font-medium">Preview</h3>
            <span className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--fg-faint)]">
              live
            </span>
          </div>
          <div className="space-y-3 p-4">
            <div className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--fg-faint)]">
              {entityType === "lens" ? "LDB 06-" : "LDB 02-"}
              <span className="text-[var(--hot)]">PROV</span> · {draftId}
            </div>
            {titleParts ? (
              <div className="text-[18px] font-medium leading-[1.2] -tracking-[0.015em]">
                {titleParts.main}
                <em className="hero-title-em">{titleParts.em}</em>
              </div>
            ) : (
              <div className="text-[14px] text-[var(--fg-faint)]">Name pending…</div>
            )}
            <div className="flex flex-wrap gap-1">
              {brand && <PreviewTag>{brand.toUpperCase()}</PreviewTag>}
              {systemName && <PreviewTag>{systemName.toUpperCase()}</PreviewTag>}
              {entityType === "lens" && formData.isPrime ? (
                <PreviewTag>PRIME</PreviewTag>
              ) : entityType === "lens" && formData.isZoom ? (
                <PreviewTag>ZOOM</PreviewTag>
              ) : null}
              {entityType === "lens" && Boolean(formData.isMacro) && <PreviewTag>MACRO</PreviewTag>}
            </div>
            <div className="h-px bg-border" />
            <div className="mono grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[11px] text-[var(--fg-dim)]">
              {entityType === "lens" ? (
                <>
                  <PreviewSpec label="focal" value={formatFocal(formData)} />
                  <PreviewSpec label="ƒ max" value={formData.apertureMin ? `ƒ/${formData.apertureMin}` : null} />
                  <PreviewSpec label="weight" value={formData.weightG ? `${formData.weightG}g` : null} />
                  <PreviewSpec label="blades" value={formData.diaphragmBlades ? `${formData.diaphragmBlades}` : null} />
                  <PreviewSpec label="year" value={formData.yearIntroduced ? `${formData.yearIntroduced}` : null} />
                </>
              ) : (
                <>
                  <PreviewSpec label="sensor" value={(formData.sensorSize as string) || null} />
                  <PreviewSpec label="MP" value={formData.megapixels ? `${formData.megapixels}` : null} />
                  <PreviewSpec label="weight" value={formData.weightG ? `${formData.weightG}g` : null} />
                  <PreviewSpec label="year" value={formData.yearIntroduced ? `${formData.yearIntroduced}` : null} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function PreviewTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="mono rounded border border-border bg-[var(--surface-soft)] px-2 py-0.5 text-[10px] uppercase tracking-[0.06em] text-[var(--fg-dim)]">
      {children}
    </span>
  );
}

function PreviewSpec({ label, value }: { label: string; value: string | null }) {
  return (
    <>
      <span className="text-[var(--fg-faint)]">{label}</span>
      <span className={value ? "text-foreground" : "text-[var(--fg-faint)]"}>
        {value ?? "—"}
      </span>
    </>
  );
}

function formatFocal(formData: Record<string, unknown>): string | null {
  const min = formData.focalLengthMin as number | null;
  const max = formData.focalLengthMax as number | null;
  if (!min) return null;
  if (max && max !== min) return `${min}–${max}mm`;
  return `${min}mm`;
}
