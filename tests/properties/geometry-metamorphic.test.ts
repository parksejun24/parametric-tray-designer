// @vitest-environment node

import { describe, expect, it } from "vitest";

import { area, centroid, perimeter } from "../../src/core/geometry";
import type { Ring } from "../../src/core/types";

const base: Ring = [
  { x: 0, y: 0 },
  { x: 18, y: 1 },
  { x: 15, y: 9 },
  { x: 3, y: 12 },
];

const deterministicScales = [0.25, 0.5, 1, 2, 7.5] as const;

describe("geometry metamorphic properties", () => {
  it.each(deterministicScales)("uniform scale %s scales area quadratically", (factor) => {
    const scaled = base.map(({ x, y }) => ({ x: x * factor, y: y * factor }));

    expect(area(scaled)).toBeCloseTo(area(base) * factor ** 2, 9);
  });

  it.each(deterministicScales)("uniform scale %s scales perimeter linearly", (factor) => {
    const scaled = base.map(({ x, y }) => ({ x: x * factor, y: y * factor }));

    expect(perimeter(scaled)).toBeCloseTo(perimeter(base) * factor, 9);
  });

  it("translation preserves area and perimeter", () => {
    const translated = base.map(({ x, y }) => ({ x: x + 12_345.5, y: y - 98_765.25 }));

    expect(area(translated)).toBeCloseTo(area(base), 6);
    expect(perimeter(translated)).toBeCloseTo(perimeter(base), 9);
  });

  it("translation moves the centroid by the same vector", () => {
    const translation = { x: 37, y: -19 };
    const translated = base.map(({ x, y }) => ({ x: x + translation.x, y: y + translation.y }));
    const before = centroid(base);
    const after = centroid(translated);

    expect(after.x).toBeCloseTo(before.x + translation.x, 10);
    expect(after.y).toBeCloseTo(before.y + translation.y, 10);
  });

  it("rotation preserves area and perimeter", () => {
    const angle = 1.234;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rotated = base.map(({ x, y }) => ({ x: x * cos - y * sin, y: x * sin + y * cos }));

    expect(area(rotated)).toBeCloseTo(area(base), 9);
    expect(perimeter(rotated)).toBeCloseTo(perimeter(base), 9);
  });
});
