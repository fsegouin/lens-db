"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function SearchInput({ defaultValue }: { defaultValue?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue || "");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  function handleChange(v: string) {
    setValue(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (v.trim()) params.set("q", v.trim());
      const qs = params.toString();
      router.push(qs ? `/search?${qs}` : "/search");
    }, 400);
  }

  return (
    <input
      type="text"
      placeholder="Search for lenses, cameras, systems..."
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      autoFocus
    />
  );
}
