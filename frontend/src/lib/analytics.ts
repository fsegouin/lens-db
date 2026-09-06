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
  | "comparison_start"
  // The membership funnel. Until these existed the site could count searches
  // and filter clicks but not a single sign-up, so "why do so few visitors
  // join" had no answer. Fire them in order: prompt -> started -> registered
  // -> verified -> signed_in, then the first thing a member does.
  | "signup_prompt_click"
  | "register_started"
  | "registered"
  | "email_verified"
  | "signed_in"
  | "verification_resent"
  | "password_reset_requested"
  | "password_reset_done"
  | "kit_add"
  | "kit_remove"
  | "kit_published"
  | "kit_paid_shared"
  | "rating_submit"
  | "rating_kit_nudge_click"
  | "edit_submitted"
  | "digest_opt_in";

export function trackEvent(name: EventName, props: Record<string, Primitive>): void {
  try {
    track(name, props);
  } catch {
    // analytics must never break the app
  }
}
