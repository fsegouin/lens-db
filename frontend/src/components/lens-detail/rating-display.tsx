"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type Props =
  | { lensId: number; cameraId?: never; averageRating: number | null; ratingCount: number | null; label?: string }
  | { cameraId: number; lensId?: never; averageRating: number | null; ratingCount: number | null; label?: string };

export function RatingDisplay(props: Props) {
  const type = props.lensId != null ? "lens" : "camera";
  const entityId = props.lensId ?? props.cameraId!;
  const label = props.label ?? "community rating";

  const [avg, setAvg] = useState<number | null>(props.averageRating);
  const [count, setCount] = useState<number>(props.ratingCount ?? 0);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [hovering, setHovering] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadedUserRating, setLoadedUserRating] = useState(false);

  useEffect(() => {
    fetch(`/api/ratings?type=${type}&entityId=${entityId}`)
      .then((r) => r.json())
      .then((data) => {
        setAvg(data.averageRating);
        setCount(data.ratingCount);
        setUserRating(data.userRating);
        setLoadedUserRating(true);
      })
      .catch(() => {
        // leave SSR values in place
      });
  }, [type, entityId]);

  const submit = useCallback(
    async (rating: number) => {
      if (submitting) return;
      setSubmitting(true);
      try {
        const res = await fetch("/api/ratings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, entityId, rating }),
        });
        if (!res.ok) {
          toast.error("Could not save rating");
          return;
        }
        const data = await res.json();
        setAvg(data.averageRating);
        setCount(data.ratingCount);
        setUserRating(rating);
        toast.success(`Rated ${rating}/10`);
      } catch {
        toast.error("Could not save rating");
      } finally {
        setSubmitting(false);
      }
    },
    [type, entityId, submitting],
  );

  const removeRating = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/ratings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, entityId }),
      });
      if (!res.ok) {
        toast.error("Could not remove rating");
        return;
      }
      const data = await res.json();
      setAvg(data.averageRating);
      setCount(data.ratingCount);
      setUserRating(null);
      toast.success("Rating removed");
    } catch {
      toast.error("Could not remove rating");
    } finally {
      setSubmitting(false);
    }
  }, [type, entityId, submitting]);

  const hasRating = avg != null && count > 0;
  const displayValue = hasRating ? avg.toFixed(1) : "—";
  const baseFilled = hasRating ? Math.round(avg) : 0;
  const preview = hovering ?? userRating ?? baseFilled;
  const showingYours = hovering != null || userRating != null;

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-5 rounded-[10px] border border-border bg-background p-4">
      <div>
        <div className="text-[36px] font-medium leading-none -tracking-[0.03em]">
          {displayValue}
          {hasRating && (
            <span className="mono ml-0.5 align-baseline text-[12px] font-normal text-[var(--fg-dim)]">
              /10
            </span>
          )}
        </div>
        <div className="mono mt-1 text-[10px] uppercase tracking-[0.06em] text-[var(--fg-dim)]">
          {hasRating
            ? `${count.toLocaleString()} vote${count === 1 ? "" : "s"}`
            : "no ratings yet"}
        </div>
      </div>

      <div
        className="min-w-0"
        onMouseLeave={() => setHovering(null)}
      >
        <div
          className="flex h-8 items-end gap-[3px]"
          role="group"
          aria-label="Rate this item from 1 to 10"
        >
          {Array.from({ length: 10 }).map((_, i) => {
            const level = i + 1;
            const on = level <= preview;
            const height = `${25 + i * 7.5}%`;
            const isUserLevel = userRating === level;
            const isHovering = hovering != null && level <= hovering;
            return (
              <button
                key={i}
                type="button"
                disabled={submitting}
                onClick={() => submit(level)}
                onMouseEnter={() => setHovering(level)}
                aria-label={`Rate ${level} out of 10`}
                title={`Rate ${level}/10`}
                className={`flex-1 rounded-[2px] transition-colors ${
                  on
                    ? showingYours || isHovering
                      ? "bg-[var(--hot)]"
                      : "bg-foreground"
                    : "bg-[var(--line)] hover:bg-[var(--line-strong)]"
                } ${submitting ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${
                  isUserLevel && hovering == null ? "ring-1 ring-[var(--hot)]" : ""
                }`}
                style={{ height }}
              />
            );
          })}
        </div>
        <div className="mono mt-1.5 flex min-h-[14px] items-center justify-between text-[10px] text-[var(--fg-faint)]">
          <span>1</span>
          <span className="flex items-center gap-2 text-center">
            {hovering != null ? (
              <span className="text-[var(--hot)]">Rate {hovering}/10</span>
            ) : userRating != null ? (
              <>
                <span className="text-[var(--hot)]">your rating · {userRating}</span>
                <button
                  type="button"
                  onClick={removeRating}
                  disabled={submitting}
                  className="text-[var(--fg-dim)] underline decoration-[var(--line-strong)] underline-offset-2 hover:text-foreground disabled:cursor-not-allowed"
                >
                  remove
                </button>
              </>
            ) : loadedUserRating ? (
              <span>{label}</span>
            ) : (
              <span>{label}</span>
            )}
          </span>
          <span>10</span>
        </div>
      </div>
    </div>
  );
}
