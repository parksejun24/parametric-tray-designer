// @vitest-environment node

import { describe, expect, it } from "vitest";

import { area, asPolygon } from "../../src/core/geometry";
import { ClipperTsKernel, polygonsOf } from "../../src/core/kernel";
import { buildPowerTerritories, territoryTopologySignature } from "../../src/core/powerDiagram";
import type { RawPowerTerritory } from "../../src/core/types";

const domain = asPolygon([
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 50 },
  { x: 0, y: 50 },
]);
const kernel = new ClipperTsKernel(6);

function territoryArea(geometry: ReturnType<typeof buildPowerTerritories>[number]["geometry"]): number {
  return polygonsOf(geometry).reduce((sum, polygon) => sum + area(polygon.outer), 0);
}

describe("buildPowerTerritories", () => {
  it("bisects an equal-weight two-site rectangle", () => {
    const territories = buildPowerTerritories([
      { id: "left", point: { x: 25, y: 25 }, weight: 0 },
      { id: "right", point: { x: 75, y: 25 }, weight: 0 },
    ], domain, kernel);

    expect(territoryArea(territories[0]!.geometry)).toBeCloseTo(2_500, 5);
    expect(territoryArea(territories[1]!.geometry)).toBeCloseTo(2_500, 5);
  });

  it("expands a site's territory when its power weight increases", () => {
    const baseline = buildPowerTerritories([
      { id: "left", point: { x: 25, y: 25 }, weight: 0 },
      { id: "right", point: { x: 75, y: 25 }, weight: 0 },
    ], domain, kernel);
    const weighted = buildPowerTerritories([
      { id: "left", point: { x: 25, y: 25 }, weight: 500 },
      { id: "right", point: { x: 75, y: 25 }, weight: 0 },
    ], domain, kernel);

    expect(territoryArea(weighted[0]!.geometry)).toBeGreaterThan(territoryArea(baseline[0]!.geometry));
  });

  it("is invariant when the same constant is added to every weight", () => {
    const original = buildPowerTerritories([
      { id: "left", point: { x: 25, y: 25 }, weight: 100 },
      { id: "right", point: { x: 75, y: 25 }, weight: -50 },
    ], domain, kernel);
    const shifted = buildPowerTerritories([
      { id: "left", point: { x: 25, y: 25 }, weight: 10_100 },
      { id: "right", point: { x: 75, y: 25 }, weight: 9_950 },
    ], domain, kernel);

    expect(territoryArea(shifted[0]!.geometry)).toBeCloseTo(territoryArea(original[0]!.geometry), 6);
    expect(territoryArea(shifted[1]!.geometry)).toBeCloseTo(territoryArea(original[1]!.geometry), 6);
  });

  it("uses stable site order to resolve coincident equal-weight sites", () => {
    const territories = buildPowerTerritories([
      { id: "first", point: { x: 50, y: 25 }, weight: 0 },
      { id: "second", point: { x: 50, y: 25 }, weight: 0 },
    ], domain, kernel);

    expect(territoryArea(territories[0]!.geometry)).toBeGreaterThan(0);
    expect(territoryArea(territories[1]!.geometry)).toBe(0);
  });

  it("changes the topology signature when labeled adjacency changes", () => {
    const territory = (siteId: string, x: number): RawPowerTerritory => ({
      siteId,
      site: { x: x + 5, y: 5 },
      powerWeight: 0,
      geometry: asPolygon([
        { x, y: 0 },
        { x: x + 10, y: 0 },
        { x: x + 10, y: 10 },
        { x, y: 10 },
      ]),
    });
    const states = ["present", "present", "present"];
    const baseline = [territory("a", 0), territory("b", 10), territory("c", 30)];
    const quantizedGap = [territory("a", 0), territory("b", 10.00005), territory("c", 30)];
    const changed = [territory("a", 0), territory("b", 30), territory("c", 10)];

    expect(baseline.map((item) => polygonsOf(item.geometry).length)).toEqual([1, 1, 1]);
    expect(changed.map((item) => polygonsOf(item.geometry).length)).toEqual([1, 1, 1]);
    const baselineSignature = territoryTopologySignature(baseline, states, 1e-4);
    expect(territoryTopologySignature(quantizedGap, states, 1e-4)).toBe(baselineSignature);
    expect(territoryTopologySignature(changed, states, 1e-4)).not.toBe(baselineSignature);
  });
});
