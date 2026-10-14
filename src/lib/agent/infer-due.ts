// Infer due dates for undated course material (pages, URLs, readings).
//
// Rule: course order is the order of work. An undated item must be finished
// before the NEXT dated item that follows it anywhere later in the course
// (the scan crosses section boundaries).
//
// Timing: undated items never share the anchor's exact deadline. We stop a
// buffer (default 2 hours) before the anchor, then walk BACKWARDS through the
// undated items in front of it, so each one is due early enough to leave room
// for the estimated work of the items that come after it.
//
//   anchor (quiz) due 18:00, buffer 2h, items A (30m) then B (60m):
//     B due 16:00   (18:00 − 2h)
//     A due 15:00   (16:00 − B's 60m)
//
// Undated items with no dated item after them stay null (nothing to anchor to).

export const DEFAULT_LEAD_BUFFER_MINUTES = 120;

export interface OrderedItem {
  id: string;
  /** Section index in the course; items are compared by (section, position). */
  section: number;
  position: number;
  dueAt: string | null;
  /** Estimated minutes of work; undefined → 30 (the estimate fallback). */
  estimatedMinutes?: number | null;
}

export interface InferredDue {
  id: string;
  dueAt: string | null;
  inferred: boolean;
  /** id of the dated item this was anchored to, if any. */
  anchorId: string | null;
}

export function inferDueDates(items: OrderedItem[], bufferMinutes = DEFAULT_LEAD_BUFFER_MINUTES): InferredDue[] {
  // Put everything in course order (section first, then position).
  const ordered = [...items].sort((a, b) => a.section - b.section || a.position - b.position);
  const out = new Map<string, InferredDue>();

  // Undated items waiting for the next dated anchor.
  let pending: OrderedItem[] = [];

  for (const item of ordered) {
    if (!item.dueAt) {
      pending.push(item);
      continue;
    }
    out.set(item.id, { id: item.id, dueAt: item.dueAt, inferred: false, anchorId: null });

    // Walk backwards from (anchor − buffer), subtracting each later item's work.
    let cursor = new Date(item.dueAt).getTime() - bufferMinutes * 60_000;
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      out.set(p.id, { id: p.id, dueAt: new Date(cursor).toISOString(), inferred: true, anchorId: item.id });
      cursor -= (p.estimatedMinutes ?? 30) * 60_000;
    }
    pending = [];
  }

  // Trailing undated items: no later deadline to anchor to.
  for (const p of pending) out.set(p.id, { id: p.id, dueAt: null, inferred: false, anchorId: null });

  return items.map((i) => out.get(i.id)!);
}
