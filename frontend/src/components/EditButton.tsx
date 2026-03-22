"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";

type FieldConfig = {
  name: string;
  label: string;
  type: "text" | "number" | "textarea" | "boolean";
};

export default function EditButton({
  entityType,
  entityId,
  entitySlug,
  currentValues,
  fields,
  isLoggedIn,
}: {
  entityType: string;
  entityId: number;
  entitySlug: string;
  currentValues: Record<string, unknown>;
  fields: FieldConfig[];
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [summary, setSummary] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  function handleOpen(isOpen: boolean) {
    if (isOpen) {
      // Initialize form with current values
      const init: Record<string, unknown> = {};
      for (const field of fields) {
        init[field.name] = currentValues[field.name] ?? "";
      }
      setValues(init);
      setSummary("");
      setError(null);
      setSuccess(false);
    }
    setOpen(isOpen);
  }

  function computeChanges(): Record<string, unknown> {
    const changes: Record<string, unknown> = {};
    for (const field of fields) {
      const oldVal = currentValues[field.name];
      const newVal = values[field.name];
      // Compare as strings to handle number/null coercion
      const oldStr = oldVal == null ? "" : String(oldVal);
      const newStr = newVal == null ? "" : String(newVal);
      if (oldStr !== newStr) {
        changes[field.name] = field.type === "boolean" ? Boolean(newVal) : newVal;
      }
    }
    return changes;
  }

  async function handleSubmit() {
    const changes = computeChanges();
    if (Object.keys(changes).length === 0) {
      setError("No changes were made");
      return;
    }
    if (summary.trim().length < 3) {
      setError("Please provide an edit summary (at least 3 characters)");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/edits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          entityId,
          summary: summary.trim(),
          changes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to submit edit");
        return;
      }

      setSuccess(true);
      setSuccessMessage(
        data.pending
          ? "Your edit has been submitted for review. An admin will approve it shortly."
          : "Your changes have been saved. Thank you for contributing!"
      );
      setTimeout(() => {
        setOpen(false);
        if (!data.pending) router.refresh();
      }, 2000);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const historyUrl = `/history/${entityType}/${entityId}`;

  return (
    <div className="flex items-center gap-2">
      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogTrigger
          render={<Button variant="outline" size="sm" />}
        >
          Edit
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          {!isLoggedIn ? (
            <>
              <DialogHeader>
                <DialogTitle>Sign in to edit</DialogTitle>
                <DialogDescription>
                  You need an account to suggest edits. Your changes will be
                  reviewed by other editors.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Link href="/login">
                  <Button>Sign in</Button>
                </Link>
                <Link href="/register">
                  <Button variant="outline">Create account</Button>
                </Link>
              </DialogFooter>
            </>
          ) : success ? (
            <DialogHeader>
              <DialogTitle>Edit submitted</DialogTitle>
              <DialogDescription>
                {successMessage}
              </DialogDescription>
            </DialogHeader>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Edit this entry</DialogTitle>
                <DialogDescription>
                  Make corrections or add missing information. All edits are
                  tracked in the revision history.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                {fields.map((field) => (
                  <div key={field.name}>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      {field.label}
                    </label>
                    {field.type === "textarea" ? (
                      <Textarea
                        value={String(values[field.name] ?? "")}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [field.name]: e.target.value }))
                        }
                        rows={3}
                      />
                    ) : field.type === "boolean" ? (
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={Boolean(values[field.name])}
                          onChange={(e) =>
                            setValues((v) => ({ ...v, [field.name]: e.target.checked }))
                          }
                          className="rounded border-zinc-300 dark:border-zinc-600"
                        />
                        {field.label}
                      </label>
                    ) : (
                      <Input
                        type={field.type}
                        value={String(values[field.name] ?? "")}
                        onChange={(e) =>
                          setValues((v) => ({
                            ...v,
                            [field.name]:
                              field.type === "number" && e.target.value !== ""
                                ? Number(e.target.value)
                                : e.target.value,
                          }))
                        }
                      />
                    )}
                  </div>
                ))}

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Edit summary *
                  </label>
                  <Input
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="Briefly describe your changes"
                    maxLength={200}
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                )}
              </div>

              <DialogFooter>
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting ? "Saving..." : "Save changes"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Link
        href={historyUrl}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        View history
      </Link>
    </div>
  );
}
