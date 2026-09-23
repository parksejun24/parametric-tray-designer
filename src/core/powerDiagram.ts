import { asPolygon, bounds, clipRingToHalfPlane, distanceSquared } from "./geometry";
import { polygonsOf, type GeometryKernel } from "./kernel";
import { deterministicHash } from "./random";
import type { Polygonal, RawPowerTerritory, Ring, Vec2 } from "./types";

export interface WeightedSite {
  readonly id: string;
  readonly point: Vec2;
  readonly weight: number;
}

export function buildPowerTerritories(
  sites: readonly WeightedSite[],
  territoryDomain: { readonly outer: readonly Vec2[]; readonly holes: readonly (readonly Vec2[])[] },
  kernel: GeometryKernel,
): readonly RawPowerTerritory[] {
  const domainBounds = bounds(territoryDomain.outer);
  const padding = Math.max(domainBounds.maxX - domainBounds.minX, domainBounds.maxY - domainBounds.minY, 1);
  const rectangle = [
    { x: domainBounds.minX - padding, y: domainBounds.minY - padding },
    { x: domainBounds.maxX + padding, y: domainBounds.minY - padding },
    { x: domainBounds.maxX + padding, y: domainBounds.maxY + padding },
    { x: domainBounds.minX - padding, y: domainBounds.maxY + padding },
  ];

  return sites.map((site, siteIndex) => {
    let powerCell = rectangle;
    for (let otherIndex = 0; otherIndex < sites.length && powerCell.length >= 3; otherIndex += 1) {
      if (siteIndex === otherIndex) continue;
      const other = sites[otherIndex]!;
      const coincident = Math.abs(site.point.x - other.point.x) <= 1e-12
        && Math.abs(site.point.y - other.point.y) <= 1e-12;
      if (coincident) {
        const siteWins = site.weight > other.weight + 1e-12
          || (Math.abs(site.weight - other.weight) <= 1e-12 && siteIndex < otherIndex);
        if (!siteWins) powerCell = [];
        continue;
      }
      const normal = { x: 2 * (other.point.x - site.point.x), y: 2 * (other.point.y - site.point.y) };
      const limit = other.point.x ** 2 + other.point.y ** 2 - other.weight
        - (site.point.x ** 2 + site.point.y ** 2 - site.weight);
      // Exact ties are resolved by stable site order.
      powerCell = [...clipRingToHalfPlane(powerCell, normal, limit - (siteIndex < otherIndex ? 0 : 1e-12))];
    }
    const clipped: Polygonal = powerCell.length >= 3
      ? kernel.intersect(asPolygon(powerCell), territoryDomain) ?? { polygons: [] }
      : { polygons: [] };
    return {
      siteId: site.id,
      geometry: clipped,
      site: site.point,
      powerWeight: site.weight,
    };
  });
}

export function territoryComponentCount(geometry: Polygonal): number {
  return polygonsOf(geometry).length;
}

/**
 * Hashes the fixed-epoch topology, including labeled territory adjacency.
 * Geometry coordinates are deliberately excluded: only component/state changes
 * and boundary contacts alter the signature.
 */
export function territoryTopologySignature(
  territories: readonly RawPowerTerritory[],
  pocketStates: readonly string[],
  contactToleranceMm: number,
): string {
  const nodes = territories
    .map((territory, index) => ({
      id: territory.siteId,
      components: territoryComponentCount(territory.geometry),
      pocket: pocketStates[index] ?? "unknown",
    }))
    .sort((a, b) => compareText(a.id, b.id));
  const adjacency: [string, string][] = [];
  for (let left = 0; left < territories.length; left += 1) {
    for (let right = left + 1; right < territories.length; right += 1) {
      const a = territories[left]!;
      const b = territories[right]!;
      if (!polygonalsContact(a.geometry, b.geometry, contactToleranceMm)) continue;
      adjacency.push(a.siteId < b.siteId ? [a.siteId, b.siteId] : [b.siteId, a.siteId]);
    }
  }
  adjacency.sort(([a0, a1], [b0, b1]) => compareText(a0, b0) || compareText(a1, b1));
  return deterministicHash({ nodes, adjacency });
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function polygonalsContact(a: Polygonal, b: Polygonal, toleranceMm: number): boolean {
  const tolerance = Math.max(0, toleranceMm);
  for (const aPolygon of polygonsOf(a)) {
    const aRings = [aPolygon.outer, ...aPolygon.holes];
    for (const bPolygon of polygonsOf(b)) {
      const bRings = [bPolygon.outer, ...bPolygon.holes];
      for (const aRing of aRings) {
        for (const bRing of bRings) {
          if (ringsContact(aRing, bRing, tolerance)) return true;
        }
      }
    }
  }
  return false;
}

function ringsContact(a: Ring, b: Ring, toleranceMm: number): boolean {
  const toleranceSquared = toleranceMm ** 2;
  for (let aIndex = 0; aIndex < a.length; aIndex += 1) {
    const a0 = a[aIndex]!;
    const a1 = a[(aIndex + 1) % a.length]!;
    for (let bIndex = 0; bIndex < b.length; bIndex += 1) {
      const b0 = b[bIndex]!;
      const b1 = b[(bIndex + 1) % b.length]!;
      if (segmentsCross(a0, a1, b0, b1)) return true;
      if (pointSegmentDistanceSquared(a0, b0, b1) <= toleranceSquared
        || pointSegmentDistanceSquared(a1, b0, b1) <= toleranceSquared
        || pointSegmentDistanceSquared(b0, a0, a1) <= toleranceSquared
        || pointSegmentDistanceSquared(b1, a0, a1) <= toleranceSquared) return true;
    }
  }
  return false;
}

function segmentsCross(a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2): boolean {
  const orient = (p: Vec2, q: Vec2, r: Vec2): number =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = orient(a0, a1, b0);
  const o2 = orient(a0, a1, b1);
  const o3 = orient(b0, b1, a0);
  const o4 = orient(b0, b1, a1);
  return ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0))
    && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0));
}

function pointSegmentDistanceSquared(point: Vec2, start: Vec2, end: Vec2): number {
  const segmentLengthSquared = distanceSquared(start, end);
  if (segmentLengthSquared === 0) return distanceSquared(point, start);
  const t = Math.max(0, Math.min(1,
    ((point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y)) / segmentLengthSquared,
  ));
  return distanceSquared(point, {
    x: start.x + t * (end.x - start.x),
    y: start.y + t * (end.y - start.y),
  });
}
