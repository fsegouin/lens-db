"use client";

import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";

interface SpecsTableProps {
  rows: [string, string][];
  entityType: string;
  entityId: number;
  entityName: string;
  entitySlug: string;
}

export default function SpecsTable({
  rows,
  entityType,
  entityId,
  entityName,
  entitySlug,
}: SpecsTableProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [suggestedValue, setSuggestedValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const editingRow = useMemo(
    () => rows.find(([label]) => label === editingField),
    [rows, editingField]
  );

  function parseListItems(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const separator = trimmed.includes(";") ? /;\s*/ : /,\s+/;
    const parts = trimmed.split(separator).map((part) => part.trim()).filter(Boolean);
    return parts.length > 1 ? parts : null;
  }

  function capitalizeFirstLetter(value: string) {
    return value.replace(/^([a-z])/, (match) => match.toUpperCase());
  }

  function openCorrection(label: string) {
    setEditingField(label);
    setSuggestedValue("");
    setSending(false);
    setError("");
  }

  function closeModal() {
    setEditingField(null);
    setSuggestedValue("");
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRow || !suggestedValue.trim()) return;
    setSending(true);
    setError("");

    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          entityId,
          entityName,
          entitySlug,
          fieldName: editingRow[0],
          oldValue: editingRow[1],
          suggestedValue: suggestedValue.trim(),
          message: `Correction for "${editingRow[0]}": "${editingRow[1]}" -> "${suggestedValue.trim()}"`,
        }),
      });

      if (!res.ok) {
        if (res.status === 400) {
          const data = await res.json();
          setError(data.error || "Invalid correction");
        } else {
          setError("Something went wrong. Please try again later.");
        }
        return;
      }

      toast.success("Thanks for the correction!");
      closeModal();
    } catch {
      setError("Network error");
      toast.error("Could not submit correction");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Table>
        <TableBody>
          {rows.map(([label, value]) => (
            <TableRow key={label} className="group">
              <TableCell className="w-1/3 font-medium text-zinc-500 dark:text-zinc-400">
                {label}
              </TableCell>
              <TableCell>
                {(() => {
                  const items = parseListItems(value);
                  if (!items) return capitalizeFirstLetter(value);
                  return (
                    <ul className="space-y-1">
                      {items.map((item, i) => (
                        <li key={`${label}-${i}`}>{capitalizeFirstLetter(item)}</li>
                      ))}
                    </ul>
                  );
                })()}
              </TableCell>
              <TableCell className="w-10 text-right">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => openCorrection(label)}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label={`Suggest a correction for ${label}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!editingField} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Suggest a correction</DialogTitle>
            <DialogDescription>
              for <span className="font-medium">{entityName}</span>
            </DialogDescription>
          </DialogHeader>

          {editingRow && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-500">Field</label>
                <p className="text-sm font-medium">{editingRow[0]}</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-500">Current value</label>
                <p className="rounded-md bg-muted px-3 py-2 text-sm">{editingRow[1]}</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-500" htmlFor="suggested-value">
                  Suggested value
                </label>
                <Input
                  id="suggested-value"
                  type="text"
                  value={suggestedValue}
                  onChange={(e) => setSuggestedValue(e.target.value)}
                  placeholder="Enter the correct value..."
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeModal}>
                  Cancel
                </Button>
                <Button type="submit" disabled={sending || !suggestedValue.trim()}>
                  {sending ? "Sending..." : "Submit correction"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
