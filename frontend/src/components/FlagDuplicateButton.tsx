"use client";

import { useState } from "react";
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

export default function FlagDuplicateButton({
  entityType,
  entityId,
  entityName,
  isLoggedIn,
}: {
  entityType: "lens" | "camera";
  entityId: number;
  entityName: string;
  isLoggedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: number; name: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSearch(query: string) {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const endpoint = entityType === "lens" ? "/api/lenses" : "/api/cameras";
      const res = await fetch(`${endpoint}?search=${encodeURIComponent(query)}&limit=10`);
      const data = await res.json();
      setSearchResults(
        (data.items || [])
          .filter((item: { id: number }) => item.id !== entityId)
          .map((item: { id: number; name: string }) => ({
            id: item.id,
            name: item.name,
          }))
      );
    } catch {
      // ignore
    } finally {
      setSearching(false);
    }
  }

  async function handleSubmit() {
    if (!targetId) {
      setError("Please select the duplicate target");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceEntityType: entityType,
          sourceEntityId: entityId,
          targetEntityType: entityType,
          targetEntityId: parseInt(targetId, 10),
          reason,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to submit flag");
        return;
      }
      setSuccess(true);
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpen(isOpen: boolean) {
    if (isOpen) {
      setTargetId("");
      setReason("");
      setSearchQuery("");
      setSearchResults([]);
      setError(null);
      setSuccess(false);
    }
    setOpen(isOpen);
  }

  if (!isLoggedIn) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger
        render={<Button variant="ghost" size="xs" />}
      >
        Flag duplicate
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {success ? (
          <DialogHeader>
            <DialogTitle>Flag submitted</DialogTitle>
            <DialogDescription>
              An admin will review your duplicate report. Thank you!
            </DialogDescription>
          </DialogHeader>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Flag as duplicate</DialogTitle>
              <DialogDescription>
                Report that &ldquo;{entityName}&rdquo; is a duplicate of another {entityType}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Search for the duplicate target
                </label>
                <Input
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder={`Search ${entityType === "lens" ? "lenses" : `${entityType}s`}...`}
                />
                {searchResults.length > 0 && (
                  <div className="mt-1 max-h-40 overflow-y-auto rounded border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
                    {searchResults.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setTargetId(String(item.id));
                          setSearchQuery(item.name);
                          setSearchResults([]);
                        }}
                        className="block w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                )}
                {searching && (
                  <p className="mt-1 text-xs text-muted-foreground">Searching...</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Reason (optional)
                </label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain why these are duplicates..."
                  rows={2}
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}
            </div>

            <DialogFooter>
              <Button onClick={handleSubmit} disabled={submitting || !targetId}>
                {submitting ? "Submitting..." : "Submit flag"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
