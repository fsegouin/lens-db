"use client";

import { useCallback, useEffect, useState } from "react";

export default function RatingWidget({ lensId }: { lensId: number }) {
  const [avg, setAvg] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [hovering, setHovering] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/ratings?lensId=${lensId}`)
      .then((r) => r.json())
      .then((data) => {
        setAvg(data.averageRating);
        setCount(data.ratingCount);
        setUserRating(data.userRating);
      })
      .catch(() => {});
  }, [lensId]);

  const submit = useCallback(
    async (rating: number) => {
      if (submitting) return;
      setSubmitting(true);
      try {
        const res = await fetch("/api/ratings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lensId, rating }),
        });
        const data = await res.json();
        setAvg(data.averageRating);
        setCount(data.ratingCount);
        setUserRating(rating);
      } catch {
        // ignore
      } finally {
        setSubmitting(false);
      }
    },
    [lensId, submitting]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const filled = n <= (hovering ?? userRating ?? 0);
          return (
            <button
              key={n}
              onClick={() => submit(n)}
              onMouseEnter={() => setHovering(n)}
              onMouseLeave={() => setHovering(null)}
              disabled={submitting}
              className={`flex h-8 w-8 items-center justify-center rounded text-sm font-medium transition-colors ${
                filled
                  ? "bg-amber-500 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-amber-100 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-amber-900/30"
              } ${submitting ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
              title={`Rate ${n}/10`}
            >
              {n}
            </button>
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
              onClick={async () => {
                if (submitting) return;
                setSubmitting(true);
                try {
                  const res = await fetch("/api/ratings", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ lensId }),
                  });
                  const data = await res.json();
                  setAvg(data.averageRating);
                  setCount(data.ratingCount);
                  setUserRating(null);
                } catch {
                  // ignore
                } finally {
                  setSubmitting(false);
                }
              }}
              disabled={submitting}
              className="ml-2 text-xs text-zinc-400 underline hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              Remove
            </button>
          </>
        )}
      </p>
    </div>
  );
}
