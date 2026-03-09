"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

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
    <div className="relative">
      <label className="sr-only" htmlFor="search-input">
        Search
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id="search-input"
        type="text"
        placeholder="Search for lenses, cameras, systems..."
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        className="pl-10"
        autoFocus
      />
    </div>
  );
}
