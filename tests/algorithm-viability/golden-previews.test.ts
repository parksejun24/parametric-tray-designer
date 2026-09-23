// @vitest-environment node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { generateTray } from "../../src/core/optimize";
import type { Ring } from "../../src/core/types";
import { exportSvg } from "../../src/io/svg/exportSvg";

function render(name: string, outer: Ring): string {
  const outcome = generateTray({
    outline: { sourceFormat: "svg", sourceUnit: "mm", sourceToMm: 1, outer, sourceDigest: name, flattenToleranceMm: 0.02 },
    parameters: { cellCount: 3, minPocketAreaMm2: 300, maxPocketAreaMm2: 5_000, seed: `viability-${name}`, webWidthMm: 4, outerMarginMm: 6, qualityPreset: "draft" },
    evaluationBudget: 160,
  });
  if (outcome.status !== "success") throw new Error(`${name}: ${outcome.status}`);
  return exportSvg({ outline: outcome.outline.outer, pockets: outcome.pockets.map((pocket) => ({ id: pocket.id, points: pocket.polygon.outer })) });
}

function golden(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../docs/verification/golden-previews/${name}.svg`, import.meta.url)), "utf8");
}

describe("golden preview determinism", () => {
  it("regenerates the long-diagonal preview byte-for-byte", () => {
    expect(render("long-diagonal", [{ x: 0, y: 25 }, { x: 25, y: 0 }, { x: 180, y: 55 }, { x: 155, y: 80 }])).toBe(golden("long-diagonal"));
  });

  it("regenerates the tapered preview byte-for-byte", () => {
    expect(render("tapered", [{ x: 0, y: 15 }, { x: 170, y: 0 }, { x: 180, y: 65 }, { x: 0, y: 50 }])).toBe(golden("tapered"));
  });
});
