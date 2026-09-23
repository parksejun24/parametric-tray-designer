// @vitest-environment node

import { bench, describe } from "vitest";

import { generateTray } from "../../src/core/optimize";
import type { GenerationRequest } from "../../src/core/types";

const request: GenerationRequest = {
  outline: {
    sourceFormat: "svg",
    sourceUnit: "mm",
    sourceToMm: 1,
    outer: [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 80 }, { x: 0, y: 80 }],
    sourceDigest: "benchmark-rectangle",
    flattenToleranceMm: 0.02,
  },
  parameters: {
    cellCount: 1,
    minPocketAreaMm2: 100,
    maxPocketAreaMm2: 8_000,
    seed: "benchmark",
    webWidthMm: 4,
    outerMarginMm: 6,
    qualityPreset: "draft",
  },
  evaluationBudget: 32,
};

function sizedRequest(cellCount: number, evaluationBudget: number): GenerationRequest {
  const width = Math.max(120, cellCount * 18);
  const height = 120;
  return {
    ...request,
    outline: {
      ...request.outline,
      outer: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }],
      sourceDigest: `benchmark-${cellCount}`,
    },
    parameters: {
      ...request.parameters,
      cellCount,
      minPocketAreaMm2: 80,
      maxPocketAreaMm2: Math.max(500, (width * height) / Math.max(1, cellCount)),
      seed: `benchmark-${cellCount}`,
    },
    evaluationBudget,
  };
}

describe("optimizer benchmark", () => {
  bench("generates one deterministic pocket", () => {
    generateTray(request);
  }, { iterations: 10, warmupIterations: 2 });

  bench("completes a bounded N=5 search", () => {
    generateTray(sizedRequest(5, 160));
  }, { iterations: 5, warmupIterations: 1 });

  bench("completes a bounded N=20 search", () => {
    generateTray(sizedRequest(20, 256));
  }, { iterations: 3, warmupIterations: 1 });

  bench("completes a bounded N=50 search", () => {
    generateTray(sizedRequest(50, 384));
  }, { iterations: 2, warmupIterations: 1 });
});
