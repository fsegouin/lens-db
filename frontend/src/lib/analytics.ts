import { track } from "@vercel/analytics";

type Primitive = string | number | boolean | null;

/**
 * Custom event names we fire. Keep this list in sync with the
 * events we actually send so dashboards stay legible.
 */
export type EventName =
  | "ebay_listing_click"
  | "ebay_view_all_click"
  | "search_submit"
  | "search_result_click"
  | "lens_filter_apply"
  | "lens_sort_change"
  | "camera_filter_apply"
  | "camera_sort_change"
  | "comparison_start";

export function trackEvent(name: EventName, props: Record<string, Primitive>): void {
  try {
    track(name, props);
  } catch {
    // analytics must never break the app
  }
}
