// @vitest-environment node

import { describe, expect, it } from "vitest";

import { generateTray } from "../../src/core/optimize";
import type { GenerationRequest, Ring } from "../../src/core/types";
import { exportDxf } from "../../src/io/dxf/exportDxf";
import { verifyExportedDxf } from "../../src/verification/dxf/verifyExportedDxf";

const outlines: Readonly<Record<string, Ring>> = {
  "acute-convex": [
    { x: 0, y: 0 }, { x: 180, y: 0 }, { x: 4, y: 100 },
  ],
  "sharp-concave-notch": [
    { x: 0, y: 0 }, { x: 180, y: 0 }, { x: 180, y: 100 },
    { x: 92, y: 100 }, { x: 90, y: 24 }, { x: 88, y: 100 }, { x: 0, y: 100 },
  ],
  "concave-chevron": [
    { x: 0, y: 0 }, { x: 180, y: 0 }, { x: 180, y: 100 },
    { x: 100, y: 100 }, { x: 90, y: 40 }, { x: 80, y: 100 }, { x: 0, y: 100 },
  ],
  "needle-reflex": [
    { x: 0, y: 0 }, { x: 180, y: 0 }, { x: 180, y: 80 },
    { x: 91, y: 80 }, { x: 90, y: 140 }, { x: 89, y: 80 }, { x: 0, y: 80 },
  ],
  "deep-v-notch": [
    { x: 0, y: 0 }, { x: 180, y: 0 }, { x: 180, y: 100 },
    { x: 110, y: 100 }, { x: 90, y: 25 }, { x: 70, y: 100 }, { x: 0, y: 100 },
  ],
  star8: Array.from({ length: 16 }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI / 8;
    const radius = index % 2 === 0 ? 85 : 45;
    return { x: 100 + Math.cos(angle) * radius, y: 100 + Math.sin(angle) * radius };
  }),
};

function request(name: string, outer: Ring): GenerationRequest {
  return {
    outline: {
      sourceFormat: "svg",
      sourceUnit: "mm",
      sourceToMm: 1,
      outer,
      sourceDigest: name,
      flattenToleranceMm: 0.02,
    },
    parameters: {
      cellCount: 1,
      minPocketAreaMm2: 100,
      maxPocketAreaMm2: 50_000,
      seed: name,
      webWidthMm: 4,
      outerMarginMm: 6,
      qualityPreset: "draft",
    },
    evaluationBudget: 32,
  };
}

describe("sharp outline export", () => {
  for (const [name, outer] of Object.entries(outlines)) {
    it(`round-trips ${name}`, () => {
      const result = generateTray(request(name, outer));
      expect(result.status, JSON.stringify(result)).toBe("success");
      if (result.status !== "success") return;

      const dxf = exportDxf({
        outline: result.outline.outer,
        pockets: result.pockets.map((pocket) => ({ id: pocket.id, points: pocket.polygon.outer })),
      });
      expect(verifyExportedDxf(dxf, result)).toEqual({ ok: true });
    });
  }

  it("partitions and round-trips multiple pockets in a sharp concave outline", () => {
    const base = request("sharp-concave-multi", outlines["concave-chevron"]!);
    const result = generateTray({
      ...base,
      parameters: {
        ...base.parameters,
        cellCount: 3,
        maxPocketAreaMm2: 20_000,
        qualityPreset: "standard",
      },
      evaluationBudget: 256,
    });
    expect(result.status, JSON.stringify(result)).toBe("success");
    if (result.status !== "success") return;

    const dxf = exportDxf({
      outline: result.outline.outer,
      pockets: result.pockets.map((pocket) => ({ id: pocket.id, points: pocket.polygon.outer })),
    });
    expect(result.pockets).toHaveLength(3);
    expect(verifyExportedDxf(dxf, result)).toEqual({ ok: true });
  });

  for (const name of ["needle-reflex", "deep-v-notch"] as const) {
    it(`partitions and round-trips the ${name} regression outline`, () => {
      const base = request(name, outlines[name]!);
      const result = generateTray({
        ...base,
        outline: name === "deep-v-notch"
          ? { ...base.outline, sourceDigest: "6e68d72047c69ad629db954f8e872be156916aa61609cb28074e145d96d7b2f3" }
          : base.outline,
        parameters: {
          ...base.parameters,
          cellCount: 3,
          minPocketAreaMm2: 300,
          maxPocketAreaMm2: 5_000,
          ...(name === "deep-v-notch" ? { seed: "formfield-01", qualityPreset: "extended" as const } : {}),
        },
        evaluationBudget: name === "deep-v-notch" ? 432 : 160,
      });
      expect(result.status, JSON.stringify(result)).toBe("success");
      if (result.status !== "success") return;

      const dxf = exportDxf({
        outline: result.outline.outer,
        pockets: result.pockets.map((pocket) => ({ id: pocket.id, points: pocket.polygon.outer })),
      });
      expect(result.pockets).toHaveLength(3);
      expect(verifyExportedDxf(dxf, result)).toEqual({ ok: true });
    });
  }

  it("partitions and round-trips a high-curvature star outline", () => {
    const base = request("star8", outlines.star8!);
    const result = generateTray({
      ...base,
      parameters: {
        ...base.parameters,
        cellCount: 3,
        minPocketAreaMm2: 5,
        maxPocketAreaMm2: 50_000,
        seed: "star8-3-0",
        qualityPreset: "standard",
      },
      evaluationBudget: 240,
    });
    expect(result.status, JSON.stringify(result)).toBe("success");
    if (result.status !== "success") return;

    const dxf = exportDxf({
      outline: result.outline.outer,
      pockets: result.pockets.map((pocket) => ({ id: pocket.id, points: pocket.polygon.outer })),
    });
    expect(result.pockets).toHaveLength(3);
    expect(verifyExportedDxf(dxf, result)).toEqual({ ok: true });
  });
});
