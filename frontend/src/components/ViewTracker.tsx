"use client";

import { useEffect } from "react";

export default function ViewTracker({ type, id }: { type: "lens" | "camera" | "system"; id: number }) {
  useEffect(() => {
    // Deduplicate: only track once per session per item
    const key = `viewed:${type}:${id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // sessionStorage unavailable (e.g. bots) - skip tracking
      return;
    }

    fetch("/api/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id }),
    }).catch(() => {});
  }, [type, id]);

  return null;
}
