// @vitest-environment node

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { generateTray } from "../../src/core/optimize";
import type { GenerationParameters, GenerationRequest, Ring } from "../../src/core/types";
import { exportDxf } from "../../src/io/dxf/exportDxf";
import { verifyExportedDxf } from "../../src/verification/dxf/verifyExportedDxf";

function ellipseRing(): Ring {
  const cx = 193;
  const cy = 62.5;
  const rx = 193;
  const ry = 62.5;
  const tolerance = 0.02;
  const step = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tolerance / Math.max(rx, ry))));
  const segments = Math.max(24, Math.ceil((Math.PI * 2) / Math.max(step, Math.PI / 90)));
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
  });
}

const ellipseOutline: GenerationRequest["outline"] = {
  sourceFormat: "svg",
  sourceUnit: "user-unit",
  sourceToMm: 1,
  outer: ellipseRing(),
  sourceDigest: createHash("sha256").update(JSON.stringify(ellipseRing())).digest("hex"),
  flattenToleranceMm: 0.02,
};

const parameters: GenerationParameters = {
  cellCount: 6,
  minPocketAreaMm2: 900,
  maxPocketAreaMm2: 10_000,
  seed: "formfield-01",
  webWidthMm: 4,
  outerMarginMm: 6,
  qualityPreset: "extended",
};

describe("Ellipse 1.svg example", () => {
  it("exports generated pockets that pass independent DXF containment verification", () => {
    const outcome = generateTray({ outline: ellipseOutline, parameters });

    expect(outcome.status).toBe("success");
    if (outcome.status !== "success") return;
    const dxf = exportDxf({
      outline: outcome.outline.outer,
      pockets: outcome.pockets.map((pocket) => ({ id: pocket.id, points: pocket.polygon.outer })),
    });

    expect(verifyExportedDxf(dxf, outcome)).toEqual({ ok: true });
  });
});
