// @vitest-environment node

import { describe, expect, it } from "vitest";

import { generateTray } from "../../src/core/optimize";
import type { GenerationParameters, GenerationRequest } from "../../src/core/types";
import { exportDxf } from "../../src/io/dxf/exportDxf";
import { verifyExportedDxf } from "../../src/verification/dxf/verifyExportedDxf";

const vectorOutline: GenerationRequest["outline"] = {
  sourceFormat: "svg",
  sourceUnit: "user-unit",
  sourceToMm: 1,
  outer: [
    { x: 0.5, y: 21.536 },
    { x: 0.5, y: 159.536 },
    { x: 307.5, y: 189.536 },
    { x: 315.5, y: 0.53598 },
  ],
  sourceDigest: "9fa4b7254da4348c62cbf00f6bccc38de2de2296306714b8334e41c0aa69e5b0",
  flattenToleranceMm: 0.02,
};

const baseParameters: GenerationParameters = {
  cellCount: 6,
  minPocketAreaMm2: 900,
  maxPocketAreaMm2: 2_600,
  seed: "formfield-01",
  webWidthMm: 4,
  outerMarginMm: 6,
  qualityPreset: "standard",
};

describe("Vector 1.svg example", () => {
  it("explains why the default area interval cannot be reached", () => {
    const outcome = generateTray({
      outline: vectorOutline,
      parameters: baseParameters,
    });

    expect(outcome.status).toBe("failure");
    if (outcome.status !== "failure") return;
    expect(outcome.reason).toBe("SEARCH_AREA_INTERVAL_NOT_REACHED");
    expect(outcome.details?.bestHardViolationCount).toBe(6);
  });

  it("generates six valid pockets with the documented parameters", () => {
    const outcome = generateTray({
      outline: vectorOutline,
      parameters: {
        ...baseParameters,
        maxPocketAreaMm2: 10_000,
        qualityPreset: "extended",
      },
    });

    expect(outcome.status).toBe("success");
    if (outcome.status !== "success") return;
    expect(outcome.pockets).toHaveLength(6);
    expect(outcome.pockets.every((pocket) => pocket.areaMm2 >= 900 && pocket.areaMm2 <= 10_000)).toBe(true);
    expect(outcome.utilization).toBeGreaterThan(0.94);
    const dxf = exportDxf({
      outline: outcome.outline.outer,
      pockets: outcome.pockets.map((pocket) => ({ id: pocket.id, points: pocket.polygon.outer })),
    });
    expect(verifyExportedDxf(dxf, outcome)).toEqual({ ok: true });
  });
});
