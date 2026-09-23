import { area, asPolygon, normalizeRing, perimeter } from "./geometry";
import { polygonsOf, type GeometryKernel } from "./kernel";
import type { Polygon, Polygonal, Ring } from "./types";

export type PocketState = "present" | "absent" | "multi-component" | "contains-holes" | "containment-invalid";

export interface PocketBuildResult {
  readonly state: PocketState;
  readonly geometry: Polygonal | null;
  readonly polygon: Polygon | null;
  readonly rawAreaMm2: number;
  readonly finalAreaMm2: number;
  readonly measuredLossMm2: number;
  readonly containmentValid: boolean;
}

export interface PocketDomains {
  readonly usableDomain: Polygon;
  readonly territoryDomain: Polygon;
  readonly radiusMm: number;
  readonly arcToleranceMm: number;
}

function totalArea(geometry: Polygonal | null): number {
  return polygonsOf(geometry).reduce(
    (sum, polygon) => sum + area(polygon.outer) - polygon.holes.reduce((holeSum, hole) => holeSum + area(hole), 0),
    0,
  );
}

export class PocketGeometryService {
  constructor(
    readonly kernel: GeometryKernel,
    readonly flattenToleranceMm: number,
  ) {}

  buildDomains(outer: Ring, outerMarginMm: number, webWidthMm: number): PocketDomains | null {
    const source = asPolygon(normalizeRing(outer));
    const radiusMm = webWidthMm / 2;
    const arcToleranceMm = Math.min(this.flattenToleranceMm, Math.max(0.01, radiusMm / 64));
    const usable = this.kernel.offset(source, -outerMarginMm, { arcToleranceMm });
    const territory = this.kernel.offset(source, -(outerMarginMm - radiusMm), { arcToleranceMm });
    const usablePolygons = polygonsOf(usable);
    const territoryPolygons = polygonsOf(territory);
    if (usablePolygons.length !== 1 || territoryPolygons.length !== 1) return null;
    if (usablePolygons[0]!.holes.length > 0 || territoryPolygons[0]!.holes.length > 0) return null;
    return { usableDomain: usablePolygons[0]!, territoryDomain: territoryPolygons[0]!, radiusMm, arcToleranceMm };
  }

  roundInset(raw: Polygonal, domains: PocketDomains): PocketBuildResult {
    const rawAreaMm2 = totalArea(raw);
    const geometry = this.kernel.offset(raw, -domains.radiusMm, { arcToleranceMm: domains.arcToleranceMm });
    const pieces = polygonsOf(geometry);
    const finalAreaMm2 = totalArea(geometry);
    const common = {
      geometry,
      rawAreaMm2,
      finalAreaMm2,
      measuredLossMm2: Math.max(0, rawAreaMm2 - finalAreaMm2),
    };
    if (pieces.length === 0) return { ...common, state: "absent", polygon: null, containmentValid: true };
    if (pieces.length > 1) return { ...common, state: "multi-component", polygon: null, containmentValid: false };
    const polygon = pieces[0]!;
    if (polygon.holes.length > 0) return { ...common, state: "contains-holes", polygon: null, containmentValid: false };
    const containmentValid = polygonsOf(raw).some((component) => this.isContainedWithin(polygon, component))
      && this.isContainedWithin(polygon, domains.usableDomain);
    if (!containmentValid) return { ...common, state: "containment-invalid", polygon, containmentValid: false };
    return { ...common, state: "present", polygon, containmentValid: true };
  }

  isContainedWithin(candidate: Polygon, container: Polygon): boolean {
    const candidateArea = totalArea(candidate);
    const intersectionArea = totalArea(this.kernel.intersect(candidate, container));
    const quantum = 10 ** -this.kernel.precision;
    const areaTolerance = Math.max(quantum ** 2, perimeter(candidate.outer) * quantum);
    return candidateArea - intersectionArea <= areaTolerance;
  }
}
