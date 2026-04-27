"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const current = mounted ? resolvedTheme : undefined;

  return (
    <div
      className="grid grid-cols-2 gap-0.5 rounded-lg border border-border bg-[var(--surface-soft)] p-0.5"
      role="tablist"
      aria-label="Color theme"
    >
      <button
        type="button"
        role="tab"
        aria-selected={current === "light"}
        data-active={current === "light"}
        onClick={() => setTheme("light")}
        className="mono flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[10px] uppercase tracking-[0.08em] text-[var(--fg-dim)] transition-colors data-[active=true]:bg-card data-[active=true]:text-foreground data-[active=true]:shadow-[var(--shadow-panel)]"
      >
        <Sun className="size-3" />
        Light
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={current === "dark"}
        data-active={current === "dark"}
        onClick={() => setTheme("dark")}
        className="mono flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[10px] uppercase tracking-[0.08em] text-[var(--fg-dim)] transition-colors data-[active=true]:bg-card data-[active=true]:text-foreground data-[active=true]:shadow-[var(--shadow-panel)]"
      >
        <Moon className="size-3" />
        Dark
      </button>
    </div>
  );
}
