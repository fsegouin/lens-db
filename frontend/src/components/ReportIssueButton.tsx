"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ReportIssueButtonProps {
  entityType: string;
  entityId: number;
  entityName: string;
  entitySlug: string;
}

export default function ReportIssueButton({
  entityType,
  entityId,
  entityName,
  entitySlug,
}: ReportIssueButtonProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
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
          message: message.trim(),
        }),
      });

      if (!res.ok) {
        if (res.status === 400) {
          const data = await res.json();
          setError(data.error || "Invalid report");
        } else {
          setError("Something went wrong. Please try again later.");
        }
        return;
      }

      toast.success("Thanks for the report!");
      setOpen(false);
      setMessage("");
    } catch {
      setError("Network error");
      toast.error("Could not send report");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Flag className="mr-1.5 h-4 w-4" />
        Report an issue
      </Button>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report an issue</DialogTitle>
          <DialogDescription>
            Something wrong with <span className="font-medium">{entityName}</span>?
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe what's wrong..."
            rows={4}
            required
            autoFocus
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
          />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={sending || message.trim().length < 10}>
              {sending ? "Sending..." : "Send report"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
