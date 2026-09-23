// @vitest-environment node

import { describe, expect, it } from "vitest";

import { generateTray } from "../../src/core/optimize";
import type { GenerationRequest } from "../../src/core/types";
import { exportDxf } from "../../src/io/dxf/exportDxf";
import { verifyExportedDxf } from "../../src/verification/dxf/verifyExportedDxf";

const request: GenerationRequest = {
  outline: { sourceFormat: "svg", sourceUnit: "mm", sourceToMm: 1, outer: [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 80 }, { x: 0, y: 80 }], sourceDigest: "verify", flattenToleranceMm: 0.02 },
  parameters: { cellCount: 1, minPocketAreaMm2: 100, maxPocketAreaMm2: 8_000, seed: "verify", webWidthMm: 4, outerMarginMm: 6, qualityPreset: "draft" },
  evaluationBudget: 32,
};

function success() {
  const result = generateTray(request);
  if (result.status !== "success") throw new Error(`fixture generation failed: ${result.status}`);
  return result;
}

describe("verifyExportedDxf", () => {
  it("accepts an untampered exported success result", () => {
    const result = success();
    const text = exportDxf({ outline: result.outline.outer, pockets: result.pockets.map((pocket) => ({ id: pocket.id, points: pocket.polygon.outer })) });

    expect(verifyExportedDxf(text, result)).toEqual({ ok: true });
  });

  it("rejects a pocket outside the usable domain even when inside a larger coordinate plane", () => {
    const result = success();
    const text = exportDxf({
      outline: result.outline.outer,
      pockets: result.pockets.map((pocket) => ({ id: pocket.id, points: pocket.polygon.outer.map(({ x, y }) => ({ x: x + 1000, y })) })),
    });

    expect(verifyExportedDxf(text, result).reason).toBe("EXPORT_ROUNDTRIP_CONTAINMENT_FAILED");
  });

  it("rejects a real boundary excursion larger than kernel quantization noise", () => {
    const result = success();
    const text = exportDxf({
      outline: result.outline.outer,
      pockets: result.pockets.map((pocket) => ({
        id: pocket.id,
        points: pocket.polygon.outer.map(({ x, y }) => ({ x: x + 0.001, y })),
      })),
    });

    expect(verifyExportedDxf(text, result).reason).toBe("EXPORT_ROUNDTRIP_CONTAINMENT_FAILED");
  });

  it("rejects a pocket edge that crosses outside a concave usable domain", () => {
    const original = success();
    const pocketRing = [{ x: 2, y: 8 }, { x: 8, y: 8 }, { x: 5, y: 2 }];
    const usableRing = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 6, y: 10 },
      { x: 6, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 10 }, { x: 0, y: 10 },
    ];
    const result = {
      ...original,
      parameters: { ...original.parameters, minPocketAreaMm2: 1, maxPocketAreaMm2: 100 },
      usableDomain: { outer: usableRing, holes: [] },
      pockets: [{ ...original.pockets[0]!, polygon: { outer: pocketRing, holes: [] }, areaMm2: 18 }],
    };
    const text = exportDxf({ outline: result.outline.outer, pockets: [{ id: result.pockets[0]!.id, points: pocketRing }] });

    expect(verifyExportedDxf(text, result).reason).toBe("EXPORT_ROUNDTRIP_CONTAINMENT_FAILED");
  });

  it("rejects overlapping exported pockets", () => {
    const original = success();
    const pocket = original.pockets[0]!;
    const result = {
      ...original,
      parameters: { ...original.parameters, cellCount: 2 },
      pockets: [{ ...pocket, id: "a" }, { ...pocket, id: "b" }],
    };
    const text = exportDxf({ outline: result.outline.outer, pockets: result.pockets.map((item) => ({ id: item.id, points: item.polygon.outer })) });

    expect(verifyExportedDxf(text, result).reason).toBe("EXPORT_ROUNDTRIP_OVERLAP_DETECTED");
  });
});
