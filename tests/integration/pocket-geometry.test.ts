// @vitest-environment node

import { describe, expect, it } from "vitest";

import { area, asPolygon, containsRing } from "../../src/core/geometry";
import { ClipperTsKernel, polygonsOf } from "../../src/core/kernel";
import { PocketGeometryService } from "../../src/core/pocketGeometry";
import type { Ring } from "../../src/core/types";

const outer: Ring = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 60 },
  { x: 0, y: 60 },
];

describe("PocketGeometryService with ClipperTsKernel", () => {
  const kernel = new ClipperTsKernel(6);
  const service = new PocketGeometryService(kernel, 0.02);

  it("builds usable and territory domains from Pocket Mode distances", () => {
    const domains = service.buildDomains(outer, 6, 4);

    expect(domains).not.toBeNull();
    expect(area(domains!.usableDomain.outer)).toBeCloseTo(88 * 48, 3);
    expect(area(domains!.territoryDomain.outer)).toBeCloseTo(92 * 52, 3);
  });

  it("uses the documented round-inset arc tolerance", () => {
    const domains = service.buildDomains(outer, 6, 4);

    expect(domains?.arcToleranceMm).toBe(0.02);
  });

  it("constructs a final pocket inside both its raw territory and usable domain", () => {
    const domains = service.buildDomains(outer, 6, 4)!;
    const result = service.roundInset(domains.territoryDomain, domains);

    expect(result.state).toBe("present");
    expect(result.containmentValid).toBe(true);
    expect(containsRing(domains.territoryDomain.outer, result.polygon!.outer)).toBe(true);
    expect(containsRing(domains.usableDomain.outer, result.polygon!.outer)).toBe(true);
  });

  it("measures erosion loss from actual raw and final geometry", () => {
    const domains = service.buildDomains(outer, 6, 4)!;
    const result = service.roundInset(domains.territoryDomain, domains);

    expect(result.measuredLossMm2).toBeCloseTo(result.rawAreaMm2 - result.finalAreaMm2, 10);
  });

  it("classifies a territory that disappears under inset as absent", () => {
    const domains = service.buildDomains(outer, 6, 4)!;
    const tiny = asPolygon([
      { x: 10, y: 10 },
      { x: 11, y: 10 },
      { x: 11, y: 11 },
      { x: 10, y: 11 },
    ]);

    expect(service.roundInset(tiny, domains).state).toBe("absent");
  });

  it("preserves multiple components returned by a negative offset", () => {
    const dumbbell = asPolygon([
      { x: 10, y: 10 },
      { x: 30, y: 10 },
      { x: 30, y: 19 },
      { x: 50, y: 19 },
      { x: 50, y: 10 },
      { x: 70, y: 10 },
      { x: 70, y: 30 },
      { x: 50, y: 30 },
      { x: 50, y: 21 },
      { x: 30, y: 21 },
      { x: 30, y: 30 },
      { x: 10, y: 30 },
    ]);
    const domains = service.buildDomains(outer, 6, 4)!;
    const result = service.roundInset(dumbbell, domains);

    expect(result.state).toBe("multi-component");
    expect(polygonsOf(result.geometry)).toHaveLength(2);
  });

  it("uses the canonical kernel-area predicate for quantized concave containment", () => {
    const concave: Ring = [
      { x: 0, y: 0 },
      { x: 180, y: 0 },
      { x: 180, y: 70 },
      { x: 105, y: 70 },
      { x: 105, y: 45 },
      { x: 75, y: 45 },
      { x: 75, y: 70 },
      { x: 0, y: 70 },
    ];
    const quantizedService = new PocketGeometryService(new ClipperTsKernel(4), 0.02);
    const domains = quantizedService.buildDomains(concave, 6, 4)!;
    const quantizedPocket = asPolygon([
      { x: 63.1301, y: 6 },
      { x: 69.4492, y: 42.7465 },
      { x: 69.3437, y: 43.0185 },
      { x: 69.1304, y: 43.7885 },
      { x: 69.065, y: 44.1524 },
      { x: 69.0072, y: 44.83 },
      { x: 69, y: 45 },
      { x: 69, y: 64 },
      { x: 6, y: 64 },
      { x: 6, y: 6 },
    ]);

    expect(quantizedService.isContainedWithin(quantizedPocket, domains.usableDomain)).toBe(true);
  });

  it("preserves configured coordinate precision during union", () => {
    const precise = {
      outer: [
        { x: 0.1234, y: 0.5678 },
        { x: 10.9876, y: 0.5678 },
        { x: 10.9876, y: 8.4321 },
        { x: 0.1234, y: 8.4321 },
      ],
      holes: [],
    };

    const result = polygonsOf(kernel.union([precise]));

    expect(result).toHaveLength(1);
    expect(result[0]!.outer.some((point) => Math.abs(point.x - 0.1234) < 1e-9 && Math.abs(point.y - 0.5678) < 1e-9)).toBe(true);
    expect(result[0]!.outer.some((point) => Math.abs(point.x - 10.9876) < 1e-9 && Math.abs(point.y - 8.4321) < 1e-9)).toBe(true);
  });
});
