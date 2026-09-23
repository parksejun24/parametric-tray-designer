// @vitest-environment node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { importDxf } from "../../src/io/dxf/importDxf";

const fixture = (name: string): string => readFileSync(
  fileURLToPath(new URL(`../fixtures/dxf/${name}`, import.meta.url)),
  "utf8",
);

describe("importDxf", () => {
  it("imports a closed millimetre LWPOLYLINE", () => {
    const result = importDxf(fixture("rectangle-mm.dxf"), "rectangle-mm.dxf");

    expect(result.sourceUnit).toBe("mm");
    expect(result.sourceToMm).toBe(1);
    expect(result.points).toHaveLength(4);
    expect(result.physicalWidthMm).toBe(100);
    expect(result.physicalHeightMm).toBe(60);
  });

  it("keeps unitless geometry blocked behind scale confirmation", () => {
    const result = importDxf(fixture("rectangle-unitless.dxf"), "rectangle-unitless.dxf");

    expect(result.sourceUnit).toBeNull();
    expect(result.sourceToMm).toBeNull();
    expect(result.warnings).toHaveLength(1);
  });

  it("rejects an open LWPOLYLINE with a stable reason", () => {
    const open = fixture("rectangle-mm.dxf").replace("70\n1\n10\n0", "70\n0\n10\n0");

    expect(() => importDxf(open, "open.dxf")).toThrowError(
      expect.objectContaining({ code: "GEOM_OPEN_CONTOUR" }),
    );
  });

  it("flattens a closed LWPOLYLINE bulge segment", () => {
    const bulged = fixture("rectangle-mm.dxf").replace("20\n0\n10\n100", "20\n0\n42\n0.25\n10\n100");

    expect(importDxf(bulged, "bulged.dxf").points.length).toBeGreaterThan(4);
  });

  it("imports a closed legacy POLYLINE", () => {
    const entities = "0\nPOLYLINE\n70\n1\n" + [
      [0, 0], [100, 0], [100, 60], [0, 60],
    ].map(([x, y]) => `0\nVERTEX\n10\n${x}\n20\n${y}\n`).join("") + "0\nSEQEND\n";
    const legacy = fixture("rectangle-mm.dxf").replace(/0\nLWPOLYLINE[\s\S]*?(?=0\nENDSEC)/, entities);

    expect(importDxf(legacy, "legacy.dxf").points).toHaveLength(4);
  });

  it("assembles a closed LINE chain", () => {
    const lines = [
      [0, 0, 100, 0], [100, 0, 100, 60], [100, 60, 0, 60], [0, 60, 0, 0],
    ].map(([x1, y1, x2, y2]) => `0\nLINE\n10\n${x1}\n20\n${y1}\n11\n${x2}\n21\n${y2}\n`).join("");
    const chained = fixture("rectangle-mm.dxf").replace(/0\nLWPOLYLINE[\s\S]*?(?=0\nENDSEC)/, lines);

    expect(importDxf(chained, "lines.dxf").points).toHaveLength(4);
  });

  it("assembles a closed mixed LINE and ARC chain", () => {
    const chain = "0\nARC\n10\n0\n20\n0\n40\n10\n50\n0\n51\n180\n"
      + "0\nLINE\n10\n-10\n20\n0\n11\n10\n21\n0\n";
    const mixed = fixture("rectangle-mm.dxf").replace(/0\nLWPOLYLINE[\s\S]*?(?=0\nENDSEC)/, chain);

    expect(importDxf(mixed, "mixed-chain.dxf").points.length).toBeGreaterThan(16);
  });
});
