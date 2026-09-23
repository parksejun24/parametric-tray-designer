// @vitest-environment node

import { describe, expect, it } from "vitest";

import { area, containsRing, ringsOverlapAtInterior } from "../../src/core/geometry";
import { ClipperTsKernel, polygonsOf, type GeometryKernel } from "../../src/core/kernel";
import { createToleranceProfile, generateTray } from "../../src/core/optimize";
import type { GenerationParameters, GenerationRequest } from "../../src/core/types";

const parameters: GenerationParameters = {
  cellCount: 1,
  minPocketAreaMm2: 100,
  maxPocketAreaMm2: 8_000,
  seed: "optimizer-fixture",
  webWidthMm: 4,
  outerMarginMm: 6,
  qualityPreset: "draft",
};

const request: GenerationRequest = {
  outline: {
    sourceFormat: "svg",
    sourceUnit: "mm",
    sourceToMm: 1,
    outer: [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 80 },
      { x: 0, y: 80 },
    ],
    sourceDigest: "rectangle-120x80",
    flattenToleranceMm: 0.02,
  },
  parameters,
  evaluationBudget: 32,
};

describe("generateTray failure taxonomy", () => {
  it("returns invalid parameters without changing submitted values", () => {
    const invalid = { ...parameters, cellCount: 0 };
    const outcome = generateTray({ ...request, parameters: invalid });

    expect(outcome.status).toBe("failure");
    if (outcome.status !== "failure") return;
    expect(outcome.category).toBe("INVALID_PARAMETERS");
    expect(outcome.reason).toBe("PARAM_N_NOT_POSITIVE_INTEGER");
    expect(outcome.submittedParameters).toEqual(invalid);
  });

  it("requires a confirmed physical unit", () => {
    const outcome = generateTray({
      ...request,
      outline: { ...request.outline, sourceUnit: "", sourceToMm: 0 },
    });

    expect(outcome.status === "failure" && outcome.reason).toBe("CFG_PHYSICAL_UNIT_REQUIRED");
  });

  it("classifies self-intersection as invalid geometry", () => {
    const outcome = generateTray({
      ...request,
      outline: {
        ...request.outline,
        outer: [{ x: 0, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }, { x: 100, y: 0 }],
      },
    });

    expect(outcome.status === "failure" && outcome.reason).toBe("GEOM_SELF_INTERSECTION");
  });

  it("proves infeasibility when total minimum area exceeds usable area", () => {
    const constrained = { ...parameters, cellCount: 10, minPocketAreaMm2: 1_000, maxPocketAreaMm2: 2_000 };
    const outcome = generateTray({ ...request, parameters: constrained });

    expect(outcome.status).toBe("failure");
    if (outcome.status !== "failure") return;
    expect(outcome.category).toBe("PROVEN_INFEASIBLE");
    expect(outcome.reason).toBe("FEASIBLE_MIN_AREA_CAPACITY_EXCEEDED");
  });

  it("does not use total maximum area as an N greater than one infeasibility proof", () => {
    const constrained = { ...parameters, cellCount: 2, minPocketAreaMm2: 100, maxPocketAreaMm2: 200 };
    const outcome = generateTray({ ...request, parameters: constrained, evaluationBudget: 8 });

    expect(outcome.status).toBe("failure");
    if (outcome.status !== "failure") return;
    expect(outcome.category).not.toBe("PROVEN_INFEASIBLE");
  });

  it("reports non-present topology states separately from area balancing failures", () => {
    const baseKernel = new ClipperTsKernel(4);
    const topologyKernel: GeometryKernel = {
      id: "forced-multi-component",
      version: "test",
      precision: baseKernel.precision,
      offset(polygon, deltaMm, options) {
        const offset = baseKernel.offset(polygon, deltaMm, options);
        if (deltaMm !== -parameters.webWidthMm / 2 || !offset) return offset;
        const components = polygonsOf(offset);
        return { polygons: [...components, ...components] };
      },
      intersect: baseKernel.intersect.bind(baseKernel),
      union: baseKernel.union.bind(baseKernel),
    };
    const constrained = { ...parameters, cellCount: 2, minPocketAreaMm2: 100, maxPocketAreaMm2: 4_000 };
    const outcome = generateTray(
      { ...request, parameters: constrained, evaluationBudget: 8 },
      {},
      { kernel: topologyKernel },
    );

    expect(outcome.status).toBe("failure");
    if (outcome.status !== "failure") return;
    expect(outcome.category).toBe("SEARCH_EXHAUSTED");
    expect(outcome.reason).toBe("SEARCH_TOPOLOGY_INSTABILITY");
    expect(outcome.details?.topologyStates).toBe("multi-component");
  });

  it("rejects an area interval consumed by the export guard", () => {
    const constrained = { ...parameters, minPocketAreaMm2: 100, maxPocketAreaMm2: 100.1 };
    const outcome = generateTray({ ...request, parameters: constrained });

    expect(outcome.status === "failure" && outcome.reason).toBe("CFG_EXPORT_GUARD_EXHAUSTS_AREA_INTERVAL");
  });

  it("classifies a single final pocket outside the user area interval as proven infeasible", () => {
    const constrained = { ...parameters, minPocketAreaMm2: 100, maxPocketAreaMm2: 5_000 };
    const outcome = generateTray({ ...request, parameters: constrained, evaluationBudget: 8 });

    expect(outcome.status).toBe("failure");
    if (outcome.status !== "failure") return;
    expect(outcome.category).toBe("PROVEN_INFEASIBLE");
    expect(outcome.reason).toBe("FEASIBLE_SINGLE_POCKET_AREA_OUT_OF_RANGE");
  });

  it("acknowledges cancellation before initialization", () => {
    const outcome = generateTray(request, { isCancelled: () => true });

    expect(outcome).toEqual({ status: "cancelled", evaluations: 0 });
  });
});

describe("generateTray successful result", () => {
  it("creates the exact requested final pocket count", () => {
    const outcome = generateTray(request);

    expect(outcome.status).toBe("success");
    if (outcome.status !== "success") return;
    expect(outcome.pockets).toHaveLength(parameters.cellCount);
  });

  it("keeps final pocket areas inside the export-safe interval", () => {
    const outcome = generateTray(request);
    const tolerance = createToleranceProfile(request);

    expect(outcome.status).toBe("success");
    if (outcome.status !== "success") return;
    for (const pocket of outcome.pockets) {
      expect(pocket.areaMm2).toBeGreaterThanOrEqual(parameters.minPocketAreaMm2 + tolerance.exportAreaGuardMm2);
      expect(pocket.areaMm2).toBeLessThanOrEqual(parameters.maxPocketAreaMm2 - tolerance.exportAreaGuardMm2);
    }
  });

  it("keeps every final pocket in the usable domain", () => {
    const outcome = generateTray(request);

    expect(outcome.status).toBe("success");
    if (outcome.status !== "success") return;
    for (const pocket of outcome.pockets) {
      expect(containsRing(outcome.usableDomain.outer, pocket.polygon.outer)).toBe(true);
    }
  });

  it("keeps final pockets pairwise non-overlapping", () => {
    const multiRequest: GenerationRequest = {
      ...request,
      parameters: { ...parameters, cellCount: 3, minPocketAreaMm2: 500, maxPocketAreaMm2: 3_000 },
      evaluationBudget: 192,
    };
    const outcome = generateTray(multiRequest);

    expect(outcome.status).toBe("success");
    if (outcome.status !== "success") return;
    for (let first = 0; first < outcome.pockets.length; first += 1) {
      for (let second = first + 1; second < outcome.pockets.length; second += 1) {
        expect(ringsOverlapAtInterior(outcome.pockets[first]!.polygon.outer, outcome.pockets[second]!.polygon.outer)).toBe(false);
      }
    }
  });

  it("computes utilization from final pocket area over usable area", () => {
    const outcome = generateTray(request);

    expect(outcome.status).toBe("success");
    if (outcome.status !== "success") return;
    const pocketArea = outcome.pockets.reduce((sum, pocket) => sum + pocket.areaMm2, 0);
    expect(outcome.utilization).toBeCloseTo(pocketArea / area(outcome.usableDomain.outer), 10);
  });

  it("is deterministic for identical request metadata", () => {
    const first = generateTray(request);
    const second = generateTray(request);

    expect(first.status).toBe("success");
    expect(second.status).toBe("success");
    if (first.status !== "success" || second.status !== "success") return;
    expect(second.metadata.resultHash).toBe(first.metadata.resultHash);
    expect(second.pockets).toEqual(first.pockets);
  });

  it("records every reproducibility field in successful metadata", () => {
    const outcome = generateTray(request);

    expect(outcome.status).toBe("success");
    if (outcome.status !== "success") return;
    expect(outcome.metadata).toMatchObject({
      inputDigest: request.outline.sourceDigest,
      seed: parameters.seed,
      algorithmId: "weighted-power-pocket-search",
      geometryKernelId: "clipper2-ts",
      evaluationBudget: request.evaluationBudget,
      exportDecimalPrecision: 4,
    });
    expect(outcome.metadata.canonicalDigest).toBeTruthy();
    expect(outcome.metadata.resultHash).toBeTruthy();
    expect(outcome.metadata.algorithmVersion).toBeTruthy();
    expect(outcome.metadata.geometryKernelVersion).toBeTruthy();
    expect(outcome.metadata.supportedInputContractVersion).toBeTruthy();
    expect(outcome.metadata.canonicalizationVersion).toBeTruthy();
    expect(outcome.metadata.objectiveConfigurationVersion).toBeTruthy();
  });
});
