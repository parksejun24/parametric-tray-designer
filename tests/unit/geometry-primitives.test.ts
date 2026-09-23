// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  area,
  bounds,
  centroid,
  clipRingToHalfPlane,
  containsRing,
  covarianceAxis,
  isSimpleRing,
  normalizeRing,
  perimeter,
  pointInRing,
  ringsOverlapAtInterior,
} from "../../src/core/geometry";
import type { Ring } from "../../src/core/types";

const square: Ring = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe("geometry primitives", () => {
  it("computes polygon area", () => {
    expect(area(square)).toBe(100);
  });

  it("computes polygon perimeter", () => {
    expect(perimeter(square)).toBe(40);
  });

  it("computes polygon centroid", () => {
    expect(centroid(square)).toEqual({ x: 5, y: 5 });
  });

  it("computes polygon bounds", () => {
    expect(bounds(square)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });

  it("includes a boundary point when requested", () => {
    expect(pointInRing({ x: 0, y: 5 }, square, true)).toBe(true);
  });

  it("excludes a boundary point when requested", () => {
    expect(pointInRing({ x: 0, y: 5 }, square, false)).toBe(false);
  });

  it("detects a bow-tie self-intersection", () => {
    expect(isSimpleRing([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 10, y: 0 },
    ])).toBe(false);
  });

  it("normalizes clockwise winding and redundant collinear vertices", () => {
    const normalized = normalizeRing([
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 5 },
      { x: 10, y: 0 },
    ]);

    expect(normalized).toHaveLength(4);
    expect(area(normalized)).toBe(100);
  });

  it("clips a convex ring to a half-plane", () => {
    const clipped = clipRingToHalfPlane(square, { x: 1, y: 0 }, 4);

    expect(area(clipped)).toBeCloseTo(40, 10);
    expect(bounds(clipped).maxX).toBeCloseTo(4, 10);
  });

  it("detects full containment", () => {
    const inner: Ring = [
      { x: 2, y: 2 },
      { x: 8, y: 2 },
      { x: 8, y: 8 },
      { x: 2, y: 8 },
    ];

    expect(containsRing(square, inner)).toBe(true);
  });

  it("detects interior overlap", () => {
    const shifted: Ring = square.map(({ x, y }) => ({ x: x + 5, y }));

    expect(ringsOverlapAtInterior(square, shifted)).toBe(true);
  });

  it("does not report edge contact as interior overlap", () => {
    const touching: Ring = square.map(({ x, y }) => ({ x: x + 10, y }));

    expect(ringsOverlapAtInterior(square, touching)).toBe(false);
  });

  it("reports no stable principal axis for a square", () => {
    const result = covarianceAxis(square);

    expect(result.axis).toBeNull();
    expect(result.aspectRatio).toBe(1);
  });

  it("reports the major axis of an elongated rectangle", () => {
    const result = covarianceAxis([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 4 },
      { x: 0, y: 4 },
    ]);

    expect(Math.abs(result.axis?.x ?? 0)).toBeCloseTo(1, 10);
    expect(result.aspectRatio).toBeCloseTo(5, 10);
  });
});
