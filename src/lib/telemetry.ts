"use client";

import { track } from "@vercel/analytics";

type EventName = "fridge_opened" | "reason_selected" | "opening_undone" | "csv_exported" | "result_shared" | "achievement_unlocked" | "chart_viewed" | "theme_changed";

/** Never send record IDs, timestamps, or full local history. */
export function trackAction(name: EventName, properties?: Record<string, string | number | boolean>) {
  try {
    track(name, properties);
  } catch {
    // Tracking is optional: a blocked analytics script must never block recording.
  }
}
