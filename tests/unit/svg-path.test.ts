// @vitest-environment node

import { describe, expect, it } from "vitest";

import { parsePathData } from "../../src/io/svg/parsePathData";
import { maxSingularValue, parseTransform, transformPoint } from "../../src/io/svg/transforms";

describe("parsePathData", () => {
  it("parses a closed path with absolute line commands", () => {
    expect(parsePathData("M0 0 L10 0 L10 10 L0 10 Z")).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
  });

  it("parses relative horizontal and vertical line commands", () => {
    expect(parsePathData("m1 2 h4 v3 h-4 z")).toEqual([
      { x: 1, y: 2 },
      { x: 5, y: 2 },
      { x: 5, y: 5 },
      { x: 1, y: 5 },
    ]);
  });

  it("flattens a quadratic curve to the requested tolerance", () => {
    const points = parsePathData("M0 0 Q5 10 10 0 L0 0 Z", 0.1);

    expect(points.length).toBeGreaterThan(4);
    expect(points.at(-2)).toEqual({ x: 10, y: 0 });
  });

  it("flattens a cubic curve to the requested tolerance", () => {
    const points = parsePathData("M0 0 C0 10 10 10 10 0 L0 0 Z", 0.1);

    expect(points.length).toBeGreaterThan(4);
    expect(points.at(-2)).toEqual({ x: 10, y: 0 });
  });

  it("flattens an elliptical arc and retains its endpoint", () => {
    const points = parsePathData("M0 0 A10 5 0 0 1 20 0 L0 0 Z", 0.1);

    expect(points.length).toBeGreaterThan(4);
    expect(points.at(-2)?.x).toBeCloseTo(20, 10);
    expect(points.at(-2)?.y).toBeCloseTo(0, 10);
  });

  it("rejects an open path", () => {
    expect(() => parsePathData("M0 0 L10 0 L10 10")).toThrow("explicitly closed");
  });

  it("rejects multiple subpaths", () => {
    expect(() => parsePathData("M0 0 L10 0 Z M20 20 L30 20 Z")).toThrow("Multiple subpaths");
  });

  it("rejects an unsupported path command", () => {
    expect(() => parsePathData("M0 0 R10 10 Z")).toThrow("Unsupported path command");
  });

  it("keeps transformed quadratic chord deviation within physical tolerance", () => {
    const transform = parseTransform("scale(12 3) skewX(20)");
    const physicalTolerance = 0.02;
    const sourceTolerance = physicalTolerance / maxSingularValue(transform);
    const polyline = parsePathData("M0 0 Q5 10 10 0 L0 0 Z", sourceTolerance)
      .slice(0, -1)
      .map((point) => transformPoint(transform, point));
    const distanceToSegment = (point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
    };
    let worstDeviation = 0;
    for (let sample = 0; sample <= 1_000; sample += 1) {
      const t = sample / 1_000;
      const source = { x: 10 * t, y: 20 * (1 - t) * t };
      const point = transformPoint(transform, source);
      const nearest = Math.min(...polyline.slice(0, -1).map((start, index) => distanceToSegment(point, start, polyline[index + 1]!)));
      worstDeviation = Math.max(worstDeviation, nearest);
    }

    expect(worstDeviation).toBeLessThanOrEqual(physicalTolerance);
  });
});
