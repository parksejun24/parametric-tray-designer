// @vitest-environment node

import { describe, expect, it } from "vitest";

import { area, bounds, centroid, covarianceAxis, distanceSquared, isSimpleRing, pointInRing, ringsOverlapAtInterior } from "../../src/core/geometry";
import { BoundaryFlowField, unsignedAlignment } from "../../src/core/boundaryFlow";
import { ClipperTsKernel } from "../../src/core/kernel";
import { generateTray } from "../../src/core/optimize";
import { PocketGeometryService } from "../../src/core/pocketGeometry";
import { buildPowerTerritories, type WeightedSite } from "../../src/core/powerDiagram";
import { createSeededRandom } from "../../src/core/random";
import type { GenerationRequest, Ring } from "../../src/core/types";

const fixtures: readonly { name: string; ring: Ring }[] = [
  { name: "long-horizontal", ring: [{ x: 0, y: 0 }, { x: 180, y: 0 }, { x: 180, y: 60 }, { x: 0, y: 60 }] },
  { name: "long-diagonal", ring: [{ x: 0, y: 25 }, { x: 25, y: 0 }, { x: 180, y: 55 }, { x: 155, y: 80 }] },
  { name: "tapered", ring: [{ x: 0, y: 15 }, { x: 170, y: 0 }, { x: 180, y: 65 }, { x: 0, y: 50 }] },
  { name: "curved-asymmetric-a", ring: [{ x: 0, y: 15 }, { x: 30, y: 0 }, { x: 95, y: 5 }, { x: 150, y: 35 }, { x: 130, y: 75 }, { x: 45, y: 85 }, { x: 5, y: 60 }] },
  { name: "curved-asymmetric-b", ring: [{ x: 0, y: 35 }, { x: 25, y: 5 }, { x: 80, y: 0 }, { x: 145, y: 20 }, { x: 165, y: 55 }, { x: 120, y: 80 }, { x: 40, y: 75 }] },
  { name: "concave-directional", ring: [{ x: 0, y: 0 }, { x: 180, y: 0 }, { x: 180, y: 70 }, { x: 105, y: 70 }, { x: 105, y: 45 }, { x: 75, y: 45 }, { x: 75, y: 70 }, { x: 0, y: 70 }] },
];

function requestFor(name: string, ring: Ring): GenerationRequest {
  return {
    outline: { sourceFormat: "svg", sourceUnit: "mm", sourceToMm: 1, outer: ring, sourceDigest: name, flattenToleranceMm: 0.02 },
    parameters: {
      cellCount: 3,
      minPocketAreaMm2: 300,
      maxPocketAreaMm2: 5_000,
      seed: `viability-${name}`,
      webWidthMm: 4,
      outerMarginMm: 6,
      qualityPreset: "draft",
    },
    evaluationBudget: 160,
  };
}

function frozenInitializationAlignment(request: GenerationRequest): number {
  const kernel = new ClipperTsKernel(4);
  const geometry = new PocketGeometryService(kernel, request.outline.flattenToleranceMm);
  const domains = geometry.buildDomains(
    request.outline.outer,
    request.parameters.outerMarginMm,
    request.parameters.webWidthMm,
  );
  if (!domains) return 0;
  const ring = domains.territoryDomain.outer;
  const box = bounds(ring);
  const count = request.parameters.cellCount;
  const random = createSeededRandom(`${request.parameters.seed}|${request.outline.sourceDigest}`);
  const candidates: { x: number; y: number }[] = [];
  const grid = Math.max(12, Math.ceil(Math.sqrt(count * 80)));
  for (let y = 0; y < grid; y += 1) {
    for (let x = 0; x < grid; x += 1) {
      const point = {
        x: box.minX + (x + 0.5 + (random.next() - 0.5) * 0.5) / grid * (box.maxX - box.minX),
        y: box.minY + (y + 0.5 + (random.next() - 0.5) * 0.5) / grid * (box.maxY - box.minY),
      };
      if (pointInRing(point, ring)) candidates.push(point);
    }
  }
  if (candidates.length < count) return 0;
  const selected = [candidates[random.integer(candidates.length)]!];
  while (selected.length < count) {
    let best = candidates[0]!;
    let bestDistance = -1;
    for (const candidate of candidates) {
      const nearest = Math.min(...selected.map((point) => distanceSquared(candidate, point)));
      if (nearest > bestDistance) {
        best = candidate;
        bestDistance = nearest;
      }
    }
    selected.push(best);
  }
  const sites: readonly WeightedSite[] = selected.map((point, index) => ({ id: `cell-${index}`, point, weight: 0 }));
  const flow = new BoundaryFlowField(
    domains.usableDomain.outer,
    Math.max(request.parameters.webWidthMm * 2, Math.sqrt(area(domains.usableDomain.outer) / count)),
  );
  const alignments = buildPowerTerritories(sites, domains.territoryDomain, kernel)
    .map((territory) => geometry.roundInset(territory.geometry, domains))
    .flatMap((build) => {
      if (build.state !== "present" || !build.polygon) return [];
      const covariance = covarianceAxis(build.polygon.outer);
      const sample = flow.sample(centroid(build.polygon.outer));
      if (!covariance.axis || covariance.confidence < 0.05 || sample.confidence < 0.2) return [];
      return [unsignedAlignment(covariance.axis, sample.direction)];
    });
  return alignments.length === 0 ? 0 : alignments.reduce((sum, value) => sum + value, 0) / alignments.length;
}

describe("weighted-power directional viability gate", () => {
  it("meets hard invariants and the approved six-fixture aesthetic thresholds", () => {
    const geometry = new PocketGeometryService(new ClipperTsKernel(4), 0.02);
    const metrics = fixtures.map((fixture) => {
      const request = requestFor(fixture.name, fixture.ring);
      const baselineAlignment = frozenInitializationAlignment(request);
      const outcome = generateTray(request);
      if (outcome.status !== "success") return {
        name: fixture.name,
        status: outcome.status,
        reason: outcome.status === "failure" ? outcome.reason : "cancelled",
        details: outcome.status === "failure" ? outcome.details : undefined,
        baselineAlignment,
        relativeImprovement: 0,
        alignment: 0,
        cv: 0,
        hardValid: false,
      };
      const eligible = outcome.pockets.filter((pocket) => pocket.flowAlignment !== null);
      const alignment = eligible.length === 0 ? 0 : eligible.reduce((sum, pocket) => sum + pocket.flowAlignment!, 0) / eligible.length;
      const hardValid = outcome.pockets.length === request.parameters.cellCount
        && outcome.pockets.every((pocket) => isSimpleRing(pocket.polygon.outer) && pocket.polygon.holes.length === 0 && geometry.isContainedWithin(pocket.polygon, outcome.usableDomain))
        && outcome.pockets.every((pocket, index) => outcome.pockets.slice(index + 1).every((other) => !ringsOverlapAtInterior(pocket.polygon.outer, other.polygon.outer)));
      const relativeImprovement = (alignment - baselineAlignment) / Math.max(baselineAlignment, 1e-9);
      return { name: fixture.name, status: outcome.status, alignment, baselineAlignment, relativeImprovement, cv: outcome.score.organicAreaCv, hardValid };
    });
    const aligned = metrics.filter((metric) => metric.alignment >= 0.65).length;
    const organic = metrics.filter((metric) => metric.cv >= 0.18 && metric.cv <= 0.35).length;
    const sortedImprovement = metrics.map((metric) => metric.relativeImprovement).sort((a, b) => a - b);
    const medianImprovement = (sortedImprovement[2]! + sortedImprovement[3]!) / 2;
    const summary = { aligned, organic, medianImprovement, hardValid: metrics.filter((metric) => metric.hardValid).length, metrics };

    console.info(`VIABILITY_METRICS ${JSON.stringify(summary)}`);
    expect(summary.hardValid, JSON.stringify(summary)).toBe(6);
    expect(summary.aligned, JSON.stringify(summary)).toBeGreaterThanOrEqual(4);
    expect(summary.organic, JSON.stringify(summary)).toBeGreaterThanOrEqual(5);
    expect(summary.medianImprovement, JSON.stringify(summary)).toBeGreaterThanOrEqual(0.1);
  });
});
