// Empty announcements must always become exactly one "View announcement"
// step, on every planning path, without ever calling the model.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import { supabase } from "@/integrations/supabase/client";
import {
  EMPTY_ANNOUNCEMENT_MINUTES,
  emptyAnnouncementPlan,
  isBlankDescription,
  isEmptyAnnouncement,
} from "./empty-announcement";
import { decompose } from "./decompose";
import { planAssignment } from "./agent-estimate-client";
import { estimate, refineEstimate } from "./estimate";

const invoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;

beforeEach(() => invoke.mockReset());

describe("isBlankDescription", () => {
  it.each(["", "   ", "<p></p>", "<p>&nbsp;</p>", "<p><br/></p>", "​", "<p><img src=\"x.png\" alt=\"\"/></p>"])(
    "treats %j as empty",
    (html) => {
      expect(isBlankDescription(html)).toBe(true);
    },
  );
  it("treats real text as non-empty", () => {
    expect(isBlankDescription("<p>Read this before Friday's quiz.</p>")).toBe(false);
  });
});

describe("isEmptyAnnouncement", () => {
  it("needs BOTH an announcement type and an empty description", () => {
    expect(isEmptyAnnouncement({ title: "Week 3 news", type: "post", description: "<p>&nbsp;</p>" })).toBe(true);
    expect(isEmptyAnnouncement({ title: "Announcement: office hours", type: "other", description: "" })).toBe(true);
    expect(isEmptyAnnouncement({ title: "Essay 1", type: "paper", description: "" })).toBe(false);
    expect(isEmptyAnnouncement({ title: "Week 3 news", type: "post", description: "Bring your notes." })).toBe(false);
  });
});

describe("deterministic fallback planner", () => {
  it("plans an empty announcement as exactly one 5-minute step", () => {
    const steps = decompose({
      title: "Announcement: week 3",
      type: "post",
      estimatedMinutes: 120,
      dueAt: null,
      description: "<p>&nbsp;</p>",
    });
    expect(steps).toHaveLength(1);
    expect(steps[0]).toEqual({
      order_index: 0,
      title: "View announcement",
      timebox_minutes: EMPTY_ANNOUNCEMENT_MINUTES,
      done_criteria: ["Announcement read — no action needed"],
    });
  });

  it("still gives a non-empty announcement multiple steps", () => {
    const steps = decompose({
      title: "Announcement: project teams",
      type: "post",
      estimatedMinutes: 120,
      dueAt: null,
      description: "Post your team preferences and reply to two classmates.",
    });
    expect(steps.length).toBeGreaterThanOrEqual(4);
  });

  it("leaves normal assignments unchanged", () => {
    expect(decompose({ title: "Essay", type: "paper", estimatedMinutes: 120, dueAt: null }).length).toBeGreaterThanOrEqual(4);
    expect(decompose({ title: "Quiz 2", type: "quiz", estimatedMinutes: 150, dueAt: null }).length).toBeGreaterThanOrEqual(4);
    const reading = decompose({ title: "Ch. 4", type: "reading", estimatedMinutes: 23, dueAt: null });
    expect(reading.reduce((s, x) => s + x.timebox_minutes, 0)).toBe(23);
    const video = decompose({ title: "Classical Conditioning", type: "video", estimatedMinutes: 4, dueAt: null });
    expect(video).toHaveLength(1);
    expect(video[0]!.timebox_minutes).toBe(4);
  });
});

describe("AI plan path (agent-estimate, plan mode)", () => {
  it("returns the single step WITHOUT calling the function", async () => {
    const r = await planAssignment({
      title: "Announcement: reading week",
      type: "post",
      due_at: null,
      description: "<p><br/></p>",
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(r.steps).toEqual(emptyAnnouncementPlan());
    expect(r.source).toBe("fallback");
    expect(r.note).toBeNull();
  });

  it("still calls the function for a non-empty announcement", async () => {
    invoke.mockResolvedValue({
      data: { steps: [{ title: "Read the announcement", timebox_minutes: 10, done_criteria: ["Read it"] }] },
      error: null,
    });
    const r = await planAssignment({
      title: "Announcement: project teams",
      type: "post",
      due_at: null,
      description: "Post your team preferences and reply to two classmates.",
    });
    expect(invoke).toHaveBeenCalledOnce();
    expect(r.source).toBe("ai");
    expect(r.steps).toHaveLength(1);
  });
});

describe("AI refine path", () => {
  it("returns 5 minutes and one step WITHOUT calling the model", async () => {
    const refineFn = vi.fn();
    const base = estimate({ kind: "other" }); // low-confidence fallback: would normally refine
    const r = await refineEstimate(
      base,
      { title: "Announcement: week 3", type: "post", introHtml: "<p>&nbsp;</p>" },
      refineFn,
    );
    expect(refineFn).not.toHaveBeenCalled();
    expect(r.minutes).toBe(EMPTY_ANNOUNCEMENT_MINUTES);
    expect(r.aiRefined).toBe(false);
    expect(r.steps).toEqual(emptyAnnouncementPlan());
  });

  it("still refines a non-empty announcement", async () => {
    const refineFn = vi.fn(async () => ({
      minutes: 25,
      confidence: "medium" as const,
      steps: [{ order_index: 0, title: "Read and reply", timebox_minutes: 25, done_criteria: ["Replied"] }],
    }));
    const r = await refineEstimate(
      estimate({ kind: "other" }),
      { title: "Announcement: project teams", type: "post", introHtml: "Post your team preferences." },
      refineFn,
    );
    expect(refineFn).toHaveBeenCalledOnce();
    expect(r.minutes).toBe(25);
  });
});
