// @vitest-environment node

import { describe, expect, it } from "vitest";

import { generateTray } from "../../src/core/optimize";
import type { GenerationRequest, Ring } from "../../src/core/types";

function request(name: string, outer: Ring): GenerationRequest {
  return {
    outline: { sourceFormat: "svg", sourceUnit: "mm", sourceToMm: 1, outer, sourceDigest: name, flattenToleranceMm: 0.02 },
    parameters: {
      cellCount: 1,
      minPocketAreaMm2: 100,
      maxPocketAreaMm2: 20_000,
      seed: `aspect-${name}`,
      webWidthMm: 4,
      outerMarginMm: 6,
      qualityPreset: "draft",
    },
    evaluationBudget: 32,
  };
}

describe("extreme-aspect anti-gaming", () => {
  it("charges a larger shape cost instead of rewarding a highly elongated pocket for flow alone", () => {
    const moderate = generateTray(request("moderate", [
      { x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 80 }, { x: 0, y: 80 },
    ]));
    const extreme = generateTray(request("extreme", [
      { x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 35 }, { x: 0, y: 35 },
    ]));

    expect(moderate.status).toBe("success");
    expect(extreme.status).toBe("success");
    if (moderate.status !== "success" || extreme.status !== "success") return;
    expect(extreme.pockets[0]!.warnings).toContain("HIGH_ASPECT_RATIO");
    expect(extreme.score.flowCost).toBeLessThanOrEqual(moderate.score.flowCost);
    expect(extreme.score.shapeCost).toBeGreaterThan(moderate.score.shapeCost);
    expect(extreme.score.totalCost).toBeGreaterThan(moderate.score.totalCost);
  });
});
