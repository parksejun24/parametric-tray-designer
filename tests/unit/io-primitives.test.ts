// @vitest-environment node

import { describe, expect, it } from "vitest";

import { boundsOf, ImportError, normalizeRing, signedArea } from "../../src/io/types";
import { parseTransform, transformPoint } from "../../src/io/svg/transforms";
import { DXF_INSUNITS, parseSvgLength, unitToMm } from "../../src/io/units";

describe("unit conversion", () => {
  it.each([
    ["mm", 1],
    ["cm", 10],
    ["in", 25.4],
    ["px", 25.4 / 96],
  ])("converts %s to millimetres", (unit, expected) => {
    expect(unitToMm(unit)).toBeCloseTo(expected, 12);
  });

  it("returns null for an unknown physical unit", () => {
    expect(unitToMm("furlong")).toBeNull();
  });

  it("parses an SVG scientific-notation length", () => {
    expect(parseSvgLength("1.2e2 mm")).toEqual({ value: 120, unit: "mm" });
  });

  it("rejects a percentage SVG length", () => {
    expect(parseSvgLength("50%" )).toBeNull();
  });

  it("maps DXF INSUNITS code 4 to millimetres", () => {
    expect(DXF_INSUNITS[4]).toEqual({ name: "mm", toMm: 1 });
  });

  it("does not assign a physical unit to DXF INSUNITS code 0", () => {
    expect(DXF_INSUNITS[0]).toBeUndefined();
  });
});

describe("SVG transforms", () => {
  it("applies translation to a point", () => {
    expect(transformPoint(parseTransform("translate(5 7)"), { x: 1, y: 2 })).toEqual({ x: 6, y: 9 });
  });

  it("uses the x scale for y when one scale operand is provided", () => {
    expect(transformPoint(parseTransform("scale(2)"), { x: 3, y: 4 })).toEqual({ x: 6, y: 8 });
  });

  it("rotates around an explicit centre", () => {
    const result = transformPoint(parseTransform("rotate(90 10 10)"), { x: 12, y: 10 });

    expect(result.x).toBeCloseTo(10, 12);
    expect(result.y).toBeCloseTo(12, 12);
  });

  it("composes transform functions in SVG declaration order", () => {
    const result = transformPoint(parseTransform("translate(10 0) scale(2)"), { x: 1, y: 1 });

    expect(result).toEqual({ x: 12, y: 2 });
  });

  it("rejects unsupported transform functions", () => {
    expect(() => parseTransform("perspective(2)" )).toThrow("Unsupported transform");
  });

  it("rejects unmatched trailing transform text", () => {
    expect(() => parseTransform("translate(2) garbage")).toThrow();
  });
});

describe("ring primitives", () => {
  const clockwiseSquare = [
    { x: 0, y: 0 },
    { x: 0, y: 10 },
    { x: 10, y: 10 },
    { x: 10, y: 0 },
  ] as const;

  it("computes signed area with winding", () => {
    expect(signedArea(clockwiseSquare)).toBe(-100);
  });

  it("normalizes an outer ring to counter-clockwise winding", () => {
    expect(signedArea(normalizeRing(clockwiseSquare))).toBe(100);
  });

  it("removes a duplicate closing vertex", () => {
    const normalized = normalizeRing([...clockwiseSquare, clockwiseSquare[0]]);

    expect(normalized).toHaveLength(4);
  });

  it("removes a redundant collinear vertex", () => {
    const normalized = normalizeRing([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);

    expect(normalized).toHaveLength(4);
  });

  it("computes finite bounds", () => {
    expect(boundsOf(clockwiseSquare)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });

  it("rejects a non-finite coordinate with a stable reason", () => {
    expect(() => boundsOf([{ x: Number.NaN, y: 0 }])).toThrowError(
      expect.objectContaining<Partial<ImportError>>({ code: "GEOM_NON_FINITE_COORDINATE" }),
    );
  });

  it("rejects a zero-area ring with a stable reason", () => {
    expect(() => normalizeRing([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }])).toThrowError(
      expect.objectContaining<Partial<ImportError>>({ code: "GEOM_ZERO_OR_NEGLIGIBLE_AREA" }),
    );
  });
});
