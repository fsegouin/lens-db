import { useState } from "react";
import type { FocusEvent } from "react";

/**
 * A typed filter is counted on leaving the field, once per value entered. The
 * value the field held on focus is the baseline, so tabbing through a filled
 * field sends nothing, and a value set some other way (the URL, a clear-all, a
 * clicked cell) is not counted as typed.
 */
export function createTypedFilterTracker() {
  const atFocus = new Map<string, string>();
  return {
    focus(filter: string, raw: string): void {
      atFocus.set(filter, raw.trim());
    },
    /** The trimmed value to send, or null when there is nothing new. */
    blur(filter: string, raw: string): string | null {
      const value = raw.trim();
      const before = atFocus.get(filter);
      atFocus.delete(filter);
      return value && value !== before ? value : null;
    },
  };
}

/** onFocus and onBlur for a typed filter input; `send` gets each new value once. */
export function useTypedFilterTracking(send: (filter: string, value: string) => void) {
  const [tracker] = useState(createTypedFilterTracker);
  return (filter: string) => ({
    onFocus: (e: FocusEvent<HTMLInputElement>) => tracker.focus(filter, e.target.value),
    onBlur: (e: FocusEvent<HTMLInputElement>) => {
      const value = tracker.blur(filter, e.target.value);
      if (value) send(filter, value);
    },
  });
}
