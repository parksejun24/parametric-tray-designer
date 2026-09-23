// @vitest-environment node

import { describe, expect, it } from "vitest";

import { initialState, reducer } from "../../src/app/reducer";
import type { GenerationProgress } from "../../src/core/types";

const progress: GenerationProgress = {
  phase: "searching",
  evaluations: 10,
  evaluationBudget: 100,
  bestHardViolationCount: 0,
  bestCost: 0.25,
};

describe("application reducer job isolation", () => {
  it("accepts progress for the active job", () => {
    const running = reducer(initialState, { type: "generation/started", jobId: "current" });

    expect(reducer(running, { type: "generation/progress", jobId: "current", progress }).progress).toBe(progress);
  });

  it("ignores progress from a stale job", () => {
    const running = reducer(initialState, { type: "generation/started", jobId: "current" });

    expect(reducer(running, { type: "generation/progress", jobId: "stale", progress })).toBe(running);
  });

  it("ignores completion from a stale job", () => {
    const running = reducer(initialState, { type: "generation/started", jobId: "current" });

    expect(reducer(running, {
      type: "generation/completed",
      jobId: "stale",
      outcome: { status: "cancelled", evaluations: 10 },
    })).toBe(running);
  });

  it("cancels only the active job", () => {
    const running = reducer(initialState, { type: "generation/started", jobId: "current" });
    const cancelled = reducer(running, { type: "generation/cancelled", jobId: "current" });

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.activeJobId).toBeNull();
  });
});
