// @vitest-environment node

import { describe, expect, it } from "vitest";

import { generateTray } from "../../src/core/optimize";
import type { GenerationRequest } from "../../src/core/types";

function request(cellCount: number): GenerationRequest {
  const width = Math.max(120, cellCount * 18);
  return {
    outline: {
      sourceFormat: "svg",
      sourceUnit: "mm",
      sourceToMm: 1,
      outer: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: 120 }, { x: 0, y: 120 }],
      sourceDigest: `throughput-${cellCount}`,
      flattenToleranceMm: 0.02,
    },
    parameters: {
      cellCount,
      minPocketAreaMm2: 80,
      maxPocketAreaMm2: Math.max(500, width * 120 / cellCount),
      seed: `throughput-${cellCount}`,
      webWidthMm: 4,
      outerMarginMm: 6,
      qualityPreset: cellCount <= 20 ? "standard" : "extended",
    },
    evaluationBudget: cellCount === 5 ? 160 : cellCount === 20 ? 256 : 384,
  };
}

describe("bounded optimizer throughput", () => {
  it.each([
    { cellCount: 5, limitMs: 5_000 },
    { cellCount: 20, limitMs: 5_000 },
    { cellCount: 50, limitMs: 15_000 },
  ])("keeps N=$cellCount p95 runtime and evaluations inside the documented budgets", ({ cellCount, limitMs }) => {
    const input = request(cellCount);
    const samples: number[] = [];

    for (let sample = 0; sample < 20; sample += 1) {
      const startedAt = performance.now();
      const outcome = generateTray(input);
      samples.push(performance.now() - startedAt);
      expect(outcome.evaluations).toBeLessThanOrEqual(input.evaluationBudget!);
      expect(["success", "failure"]).toContain(outcome.status);
    }

    samples.sort((a, b) => a - b);
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1]!;
    console.info(`THROUGHPUT_P95 ${JSON.stringify({ cellCount, p95, limitMs, samples: samples.length })}`);
    expect(p95).toBeLessThan(limitMs);
  }, 120_000);
});
