import {
  EndType,
  FillRule,
  JoinType,
  inflatePathsD,
  intersectD,
  isPositiveD,
  unionD,
  type PathD,
  type PathsD,
} from "clipper2-ts";
import { area, normalizeRing, pointInRing, signedArea } from "./geometry";
import type { MultiPolygon, Polygon, Polygonal, Ring } from "./types";

export interface OffsetOptions {
  readonly arcToleranceMm: number;
}

export interface GeometryKernel {
  readonly id: string;
  readonly version: string;
  readonly precision: number;
  offset(polygon: Polygonal, deltaMm: number, options: OffsetOptions): Polygonal | null;
  intersect(subject: Polygon, clip: Polygon): Polygonal | null;
  union(polygons: readonly Polygon[]): Polygonal | null;
}

function toPath(ring: Ring): PathD {
  return ring.map(({ x, y }) => ({ x, y }));
}

function pathsOf(polygon: Polygon): PathsD {
  const outer = signedArea(polygon.outer) > 0 ? toPath(polygon.outer) : [...toPath(polygon.outer)].reverse();
  const holes = polygon.holes.map((hole) => signedArea(hole) < 0 ? toPath(hole) : [...toPath(hole)].reverse());
  return [outer, ...holes];
}

function pathsOfGeometry(geometry: Polygonal): PathsD {
  return "polygons" in geometry ? geometry.polygons.flatMap(pathsOf) : pathsOf(geometry);
}

function fromPaths(paths: PathsD): Polygonal | null {
  const rings = paths
    .map((path) => ({
      ring: normalizeRing(path.map(({ x, y }) => ({ x, y }))),
      positive: isPositiveD(path),
    }))
    .filter(({ ring }) => ring.length >= 3 && area(ring) > 1e-9);
  if (rings.length === 0) return null;

  const outers: Ring[] = [];
  const holes: Ring[] = [];
  for (const { ring, positive } of rings) {
    if (positive) outers.push(ring);
    else holes.push(ring);
  }
  // Some Clipper configurations return all paths with a shared orientation.
  if (outers.length === 0) {
    const ordered = rings.map(({ ring }) => ring).sort((a, b) => area(b) - area(a));
    outers.push(ordered.shift()!);
    holes.push(...ordered.filter((ring) => pointInRing(ring[0]!, outers[0]!)));
  }

  const polygons: Polygon[] = outers.map((outer) => ({ outer, holes: [] }));
  for (const hole of holes) {
    const owner = polygons
      .filter((polygon) => pointInRing(hole[0]!, polygon.outer))
      .sort((a, b) => area(a.outer) - area(b.outer))[0];
    if (owner) {
      const index = polygons.indexOf(owner);
      polygons[index] = { ...owner, holes: [...owner.holes, hole] };
    } else {
      polygons.push({ outer: [...hole].reverse(), holes: [] });
    }
  }
  return polygons.length === 1 ? polygons[0]! : { polygons } satisfies MultiPolygon;
}

export class ClipperTsKernel implements GeometryKernel {
  readonly id = "clipper2-ts";
  readonly version = "2.0.1-18";

  constructor(readonly precision = 4) {}

  offset(polygon: Polygonal, deltaMm: number, options: OffsetOptions): Polygonal | null {
    const result = inflatePathsD(
      pathsOfGeometry(polygon),
      deltaMm,
      JoinType.Round,
      EndType.Polygon,
      2,
      this.precision,
      options.arcToleranceMm,
    );
    return fromPaths(result);
  }

  intersect(subject: Polygon, clip: Polygon): Polygonal | null {
    return fromPaths(intersectD(pathsOf(subject), pathsOf(clip), FillRule.NonZero, this.precision));
  }

  union(polygons: readonly Polygon[]): Polygonal | null {
    if (polygons.length === 0) return null;
    return fromPaths(unionD(polygons.flatMap(pathsOf), FillRule.NonZero));
  }
}

export function polygonsOf(geometry: Polygonal | null): readonly Polygon[] {
  if (!geometry) return [];
  return "polygons" in geometry ? geometry.polygons : [geometry];
}
