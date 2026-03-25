"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { useEntitySearch } from "@/hooks/use-entity-search";

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
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [targetName, setTargetName] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { query, results, handleQueryChange, reset: resetSearch } = useEntitySearch({
    types: [entityType],
    excludeId: entityId,
    maxResults: 10,
  });

  const placeholder = `Search ${entityType === "lens" ? "lenses" : "cameras"}...`;

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
          targetEntityId: targetId,
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
      setTargetId(null);
      setTargetName("");
      setReason("");
      resetSearch();
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
                <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                  <PopoverTrigger render={<Button variant="outline" className="w-full justify-between" />}>
                    {targetName || placeholder}
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
                        {results.length > 0 && (
                          <CommandGroup heading={entityType === "lens" ? "Lenses" : "Cameras"}>
                            {results.map((item) => (
                              <CommandItem
                                key={item.id}
                                value={`${item.type}-${item.id}-${item.name}`}
                                onSelect={() => {
                                  setTargetId(item.id);
                                  setTargetName(item.name);
                                  setPopoverOpen(false);
                                  resetSearch();
                                }}
                              >
                                <span>{item.name}</span>
                                {item.systemName && (
                                  <span className="ml-2 text-xs text-muted-foreground">{item.systemName}</span>
                                )}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
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
