"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";

type RatingWidgetProps =
  | { lensId: number; cameraId?: never }
  | { cameraId: number; lensId?: never };

export default function RatingWidget(props: RatingWidgetProps) {
  const type = props.lensId != null ? "lens" : "camera";
  const entityId = props.lensId ?? props.cameraId!;

  const [avg, setAvg] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [hovering, setHovering] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/ratings?type=${type}&entityId=${entityId}`)
      .then((r) => r.json())
      .then((data) => {
        setAvg(data.averageRating);
        setCount(data.ratingCount);
        setUserRating(data.userRating);
      })
      .catch(() => {
        toast.error("Could not load ratings");
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
          toast.error("Something went wrong");
          return;
        }

        const data = await res.json();
        setAvg(data.averageRating);
        setCount(data.ratingCount);
        setUserRating(rating);
        toast.success("Rating submitted");
      } catch {
        toast.error("Something went wrong");
      } finally {
        setSubmitting(false);
      }
    },
    [type, entityId, submitting]
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
        toast.error("Something went wrong");
        return;
      }

      const data = await res.json();
      setAvg(data.averageRating);
      setCount(data.ratingCount);
      setUserRating(null);
      toast.success("Rating removed");
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }, [type, entityId, submitting]);

  return (
    <div className="space-y-2 min-h-[4.5rem]">
      <div className="flex flex-wrap items-center gap-1.5">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const filled = n <= (hovering ?? userRating ?? 0);
          return (
            <motion.button
              key={n}
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => submit(n)}
              onMouseEnter={() => setHovering(n)}
              onMouseLeave={() => setHovering(null)}
              disabled={submitting}
              aria-label={`Rate ${n} out of 10`}
              className={`flex h-10 w-10 items-center justify-center rounded text-sm font-medium transition-colors ${
                filled
                  ? "bg-amber-500 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-amber-100 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-amber-900/30"
              } ${submitting ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
              title={`Rate ${n}/10`}
            >
              {n}
            </motion.button>
          );
        })}
      </div>
      <p className="text-sm text-zinc-500">
        {avg != null ? (
          <>
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {avg.toFixed(1)}/10
            </span>{" "}
            ({count} {count === 1 ? "rating" : "ratings"})
          </>
        ) : (
          "No ratings yet"
        )}
        {userRating && (
          <>
            <span className="ml-2 text-amber-600 dark:text-amber-400">
              Your rating: {userRating}/10
            </span>
            <button
              onClick={removeRating}
              disabled={submitting}
              className="ml-2 text-xs text-zinc-400 underline hover:text-zinc-600 disabled:cursor-not-allowed dark:hover:text-zinc-300"
            >
              Remove
            </button>
          </>
        )}
      </p>
    </div>
  );
}
