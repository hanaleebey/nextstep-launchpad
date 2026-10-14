import { describe, expect, it } from "vitest";
import { inferDueDates } from "./infer-due";

const QUIZ = "2026-10-20T18:00:00.000Z";

describe("inferDueDates", () => {
  it("chains undated readings backwards from the next quiz minus a 2h buffer", () => {
    const r = inferDueDates([
      { id: "A", section: 1, position: 0, dueAt: null, estimatedMinutes: 30 },
      { id: "B", section: 1, position: 1, dueAt: null, estimatedMinutes: 60 },
      { id: "Q", section: 1, position: 2, dueAt: QUIZ },
    ]);
    expect(r.find((x) => x.id === "B")!.dueAt).toBe("2026-10-20T16:00:00.000Z");
    expect(r.find((x) => x.id === "A")!.dueAt).toBe("2026-10-20T15:00:00.000Z");
    expect(r.find((x) => x.id === "Q")!.inferred).toBe(false);
  });

  it("scans across sections for the next dated item", () => {
    const r = inferDueDates([
      { id: "Q", section: 2, position: 0, dueAt: QUIZ },
      { id: "R", section: 1, position: 0, dueAt: null, estimatedMinutes: 20 },
    ]);
    expect(r[1]).toMatchObject({ dueAt: "2026-10-20T16:00:00.000Z", inferred: true, anchorId: "Q" });
  });

  it("leaves trailing undated items without a date", () => {
    const r = inferDueDates([
      { id: "Q", section: 1, position: 0, dueAt: QUIZ },
      { id: "Z", section: 2, position: 0, dueAt: null },
    ]);
    expect(r[1]).toMatchObject({ dueAt: null, inferred: false });
  });
});
