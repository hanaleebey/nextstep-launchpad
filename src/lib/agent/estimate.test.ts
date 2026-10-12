import { describe, expect, it } from "vitest";
import {
  confidenceFromSignals, estimate, estimateQuiz, estimateReading, estimateVideo, estimateWriting, FALLBACK_MINUTES,
} from "./estimate";

describe("video", () => {
  it("uses duration × 1.0", () => {
    const r = estimateVideo({ durationSeconds: 754 });
    expect(r.minutes).toBe(13);
    expect(r.confidence).toBe("medium");
  });
  it("is high with oEmbed confirmation", () => {
    expect(estimateVideo({ durationSeconds: 600, oembedTitle: "Lecture 3" }).confidence).toBe("high");
  });
  it("falls back without duration", () => {
    expect(estimateVideo({}).minutes).toBe(FALLBACK_MINUTES);
  });
});

describe("reading", () => {
  it("uses word count / 200", () => {
    const r = estimateReading({ wordCount: 4000 });
    expect(r.minutes).toBe(20);
    expect(r.confidence).toBe("medium");
  });
  it("is high with page count too", () => {
    expect(estimateReading({ wordCount: 4000, pageCount: 12 }).confidence).toBe("high");
  });
  it("falls back without word count", () => {
    expect(estimateReading({ pageCount: 5 }).confidence).toBe("low");
  });
});

describe("quiz", () => {
  it("uses the time limit with high confidence", () => {
    const r = estimateQuiz({ timeLimitSeconds: 1800, questionCount: 40 });
    expect(r.minutes).toBe(30);
    expect(r.confidence).toBe("high");
  });
  it("treats timelimit 0 as untimed and uses question count × 1.5", () => {
    const r = estimateQuiz({ timeLimitSeconds: 0, questionCount: 15 });
    expect(r.minutes).toBe(23);
    expect(r.confidence).toBe("medium");
  });
  it("falls back with neither", () => {
    expect(estimateQuiz({}).minutes).toBe(FALLBACK_MINUTES);
  });
});

describe("writing", () => {
  it("uses target words / 250 + 20%", () => {
    const r = estimateWriting({ targetWords: 2500 });
    expect(r.minutes).toBe(12);
    expect(r.confidence).toBe("medium");
  });
  it("is high with a rubric", () => {
    expect(estimateWriting({ targetWords: 1000, hasRubric: true }).confidence).toBe("high");
  });
});

describe("fallback & confidence", () => {
  it("unknown type → 30 min, low", () => {
    const r = estimate({ kind: "other" });
    expect(r).toMatchObject({ minutes: 30, confidence: "low" });
    expect(r.signals.length).toBe(1);
  });
  it("maps signal counts", () => {
    expect(confidenceFromSignals(0)).toBe("low");
    expect(confidenceFromSignals(1)).toBe("medium");
    expect(confidenceFromSignals(3)).toBe("high");
  });
});
