// Empty-announcement detection and its fixed one-step plan.
//
// An announcement with no real text is not work to plan — reading it is the
// whole task. So every planning path (AI plan, AI refine, deterministic
// fallback, rebuild/plan-all) must produce the SAME single step and never
// call the model for it.
//
// The check runs on the CURRENT content each time something is planned:
// if real text is added to the announcement in Moodle later, the next
// sync/rebuild stops matching and the item gets a normal plan.

import type { DecomposedStep } from "./decompose";
import type { EstimateResult } from "./estimate";

export const EMPTY_ANNOUNCEMENT_MINUTES = 5;
export const EMPTY_ANNOUNCEMENT_TITLE = "View announcement";
export const EMPTY_ANNOUNCEMENT_CRITERION = "Announcement read — no action needed";

/**
 * True when a description has no real content: only HTML tags, &nbsp;,
 * whitespace, or zero-width characters. "", "   ", "<p></p>",
 * "<p>&nbsp;</p>", "<p><br/></p>" and an image-only tag all count as empty.
 * (Self-contained on purpose — importing stripHtml from estimate.ts would
 * create a circular import, since estimate.ts uses this file.)
 */
export function isBlankDescription(html: string | null | undefined): boolean {
  if (!html) return true;
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ") // all tags, including <img>
    .replace(/&nbsp;/gi, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, " ") // any other entity
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, "") // zero-width characters
    .replace(/\s+/g, " ")
    .trim();
  return text.length === 0;
}

/**
 * True for announcement/discussion work: Moodle forum news (item_type
 * 'post'), forum/discussion types, or a title containing "Announcement".
 */
export function isAnnouncementType(type: string | null | undefined, title: string): boolean {
  const t = (type ?? "").toLowerCase();
  if (["post", "forum", "announcement", "news", "discussion"].includes(t)) return true;
  return /announcement/i.test(title);
}

/** The one rule every planning path shares: announcement type AND empty text. */
export function isEmptyAnnouncement(a: {
  title: string;
  type?: string | null;
  description?: string | null;
}): boolean {
  return isAnnouncementType(a.type, a.title) && isBlankDescription(a.description);
}

/** The fixed plan: exactly one step, 5 minutes, one done-criterion. */
export function emptyAnnouncementPlan(): DecomposedStep[] {
  return [
    {
      order_index: 0,
      title: EMPTY_ANNOUNCEMENT_TITLE,
      timebox_minutes: EMPTY_ANNOUNCEMENT_MINUTES,
      done_criteria: [EMPTY_ANNOUNCEMENT_CRITERION],
    },
  ];
}

/** The matching estimate, logged like any other so the activity feed stays consistent. */
export function emptyAnnouncementEstimate(): EstimateResult {
  return {
    minutes: EMPTY_ANNOUNCEMENT_MINUTES,
    confidence: "high",
    signals: ["empty announcement — reading it is the whole task"],
  };
}
