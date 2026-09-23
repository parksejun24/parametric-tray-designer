// @vitest-environment node

import { describe, expect, it } from "vitest";

import { exportDxf } from "../../src/io/dxf/exportDxf";

interface ParsedPolyline {
  readonly layer: string;
  readonly closed: boolean;
  readonly points: readonly { x: number; y: number }[];
}

// Deliberately test-owned: this parser shares no code with the production importer.
function independentlyParsePolylines(text: string): readonly ParsedPolyline[] {
  const lines = text.replace(/\r/g, "").trimEnd().split("\n");
  const pairs = Array.from({ length: Math.floor(lines.length / 2) }, (_, index) => ({
    code: Number(lines[index * 2]!.trim()),
    value: lines[index * 2 + 1]!.trim(),
  }));
  const output: ParsedPolyline[] = [];
  for (let cursor = 0; cursor < pairs.length; cursor += 1) {
    if (pairs[cursor]!.code !== 0 || pairs[cursor]!.value !== "LWPOLYLINE") continue;
    let end = cursor + 1;
    while (end < pairs.length && pairs[end]!.code !== 0) end += 1;
    const entity = pairs.slice(cursor + 1, end);
    const points: { x: number; y: number }[] = [];
    for (let index = 0; index < entity.length; index += 1) {
      if (entity[index]!.code !== 10) continue;
      const y = entity.slice(index + 1).find((pair) => pair.code === 20);
      points.push({ x: Number(entity[index]!.value), y: Number(y!.value) });
    }
    output.push({
      layer: entity.find((pair) => pair.code === 8)!.value,
      closed: (Number(entity.find((pair) => pair.code === 70)!.value) & 1) === 1,
      points,
    });
  }
  return output;
}

function polygonArea(points: readonly { x: number; y: number }[]): number {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return Math.abs(twiceArea) / 2;
}

const input = {
  outline: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }],
  pockets: [
    { id: "pocket-b", points: [{ x: 55, y: 5 }, { x: 95, y: 5 }, { x: 95, y: 55 }, { x: 55, y: 55 }] },
    { id: "pocket-a", points: [{ x: 5, y: 5 }, { x: 45, y: 5 }, { x: 45, y: 55 }, { x: 5, y: 55 }] },
  ],
} as const;

describe("independent DXF verification", () => {
  it("writes a structurally complete DXF document", () => {
    const output = exportDxf(input);

    expect(output).toContain("0\nSECTION\n2\nHEADER\n");
    expect(output).toContain("9\n$INSUNITS\n70\n4\n");
    expect(output.endsWith("0\nEOF\n")).toBe(true);
  });

  it("writes one outline and the exact requested pocket count", () => {
    const parsed = independentlyParsePolylines(exportDxf(input));

    expect(parsed.filter((entity) => entity.layer === "OUTLINE")).toHaveLength(1);
    expect(parsed.filter((entity) => entity.layer === "POCKET")).toHaveLength(2);
  });

  it("writes every exported contour as a closed LWPOLYLINE", () => {
    expect(independentlyParsePolylines(exportDxf(input)).every((entity) => entity.closed)).toBe(true);
  });

  it("preserves pocket areas through independent parsing", () => {
    const pockets = independentlyParsePolylines(exportDxf(input)).filter((entity) => entity.layer === "POCKET");

    expect(pockets.map((pocket) => polygonArea(pocket.points))).toEqual([2_000, 2_000]);
  });

  it("produces byte-stable output regardless of pocket input order", () => {
    const reversed = { ...input, pockets: [...input.pockets].reverse() };

    expect(exportDxf(reversed)).toBe(exportDxf(input));
  });

  it("does not export raw territory layers", () => {
    expect(independentlyParsePolylines(exportDxf(input)).some((entity) => /territory/i.test(entity.layer))).toBe(false);
  });
});
