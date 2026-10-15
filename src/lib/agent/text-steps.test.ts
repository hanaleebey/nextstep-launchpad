import { describe, expect, it } from "vitest";
import { extractInstructions, stepsFromText } from "./text-steps";

describe("stepsFromText", () => {
  it("keeps a plain video as one Watch step with exact minutes", () => {
    const steps = stepsFromText("Classical conditioning", "video", 4, "");
    expect(steps).toHaveLength(1);
    expect(steps[0]!.title).toContain("Watch");
    expect(steps[0]!.title).toContain("Classical conditioning");
    expect(steps[0]!.timebox_minutes).toBe(4);
  });

  it("breaks a paper with no description into outline/draft/revise steps", () => {
    const steps = stepsFromText("Essay on operant conditioning", "paper", 120, "");
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(steps[0]!.title).toContain("Essay on operant conditioning");
    expect(steps.some((s) => /draft/i.test(s.title))).toBe(true);
    expect(steps.some((s) => /submit/i.test(s.title))).toBe(true);
    expect(steps.reduce((a, s) => a + s.timebox_minutes, 0)).toBe(120);
  });

  it("breaks a reading with no page range into multiple named parts", () => {
    const steps = stepsFromText("Chapter 4: Memory", "reading", 60, "");
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(steps.every((s) => s.title.includes("Chapter 4: Memory"))).toBe(true);
  });

  it("chunks a reading with a page range by pages", () => {
    const steps = stepsFromText("Textbook reading", "reading", 75, "Read pages 1-60 before class.");
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps[0]!.title).toMatch(/pages 1–/);
  });

  it("turns each instruction in the description into its own step", () => {
    const desc = "Summarize the two main theories. Compare them using one example from the lecture. Submit as a PDF.";
    const steps = stepsFromText("Theory comparison", "paper", 90, desc);
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps.some((s) => /Summarize the two main theories/.test(s.title))).toBe(true);
  });

  it("gives a quiz a review step and a take step", () => {
    const steps = stepsFromText("Week 3 quiz", "quiz", 30, "");
    expect(steps).toHaveLength(2);
    expect(steps[1]!.title).toContain("Take the quiz");
  });

  it("gives a discussion post read/draft/post steps", () => {
    const steps = stepsFromText("Discussion: reinforcement", "discussion", 45, "");
    expect(steps.length).toBe(3);
    expect(steps[2]!.title).toContain("Post your response");
  });

  it("caps timeboxes at 50 minutes by adding steps", () => {
    const steps = stepsFromText("Big research paper", "paper", 300, "");
    expect(steps.every((s) => s.timebox_minutes <= 50)).toBe(true);
    expect(steps.reduce((a, s) => a + s.timebox_minutes, 0)).toBe(300);
  });
});

describe("extractInstructions", () => {
  it("splits sentences and numbered items", () => {
    const parts = extractInstructions("1. Read the chapter. 2. Answer the questions. Submit your work online.");
    expect(parts.length).toBeGreaterThanOrEqual(3);
  });

  it("returns nothing for empty text", () => {
    expect(extractInstructions("")).toEqual([]);
  });
});
