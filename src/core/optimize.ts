import { BoundaryFlowField, unsignedAlignment } from "./boundaryFlow";
import { failure, validateParameters } from "./failures";
import {
  area,
  bounds,
  centroid,
  covarianceAxis,
  distanceSquared,
  isSimpleRing,
  normalizeRing,
  perimeter,
  pointInRing,
  ringsOverlapAtInterior,
} from "./geometry";
import { ClipperTsKernel, polygonsOf, type GeometryKernel } from "./kernel";
import { PocketGeometryService, type PocketBuildResult, type PocketDomains } from "./pocketGeometry";
import { buildPowerTerritories, territoryTopologySignature, type WeightedSite } from "./powerDiagram";
import { createSeededRandom, deterministicHash, type SeededRandom } from "./random";
import type {
  FinalPocket,
  GenerationControl,
  GenerationOutcome,
  GenerationParameters,
  GenerationProgress,
  GenerationRequest,
  GenerationSuccess,
  RawPowerTerritory,
  ReasonCode,
  ReproducibilityMetadata,
  ScoreBreakdown,
  ToleranceProfile,
  Vec2,
} from "./types";

const ALGORITHM_VERSION = "0.1.0";
const INPUT_CONTRACT_VERSION = "1";
const CANONICALIZATION_VERSION = "1";
const OBJECTIVE_VERSION = "1";
const EXPORT_DECIMALS = 4;

interface Evaluation {
  readonly sites: readonly WeightedSite[];
  readonly territories: readonly RawPowerTerritory[];
  readonly builds: readonly PocketBuildResult[];
  readonly pockets: readonly FinalPocket[];
  readonly hardViolationCount: number;
  readonly hardResidual: number;
  readonly targetResidual: number;
  readonly score: ScoreBreakdown | null;
  readonly topologySignature: string;
  readonly totalPocketArea: number;
}

interface SafeInterval {
  readonly low: number;
  readonly high: number;
}

export interface OptimizerOptions {
  readonly kernel?: GeometryKernel;
}

export function createToleranceProfile(request: GenerationRequest): ToleranceProfile {
  const ringBounds = bounds(request.outline.outer);
  const diagonal = Math.hypot(ringBounds.maxX - ringBounds.minX, ringBounds.maxY - ringBounds.minY);
  const outerArea = area(request.outline.outer);
  const flattenDeviationMm = Math.max(0.02, diagonal * 1e-5, request.outline.flattenToleranceMm);
  const areaMm2 = Math.max(0.1, outerArea * 1e-6);
  return {
    flattenDeviationMm,
    closureMm: flattenDeviationMm / 2,
    areaMm2,
    exportAreaGuardMm2: Math.max(areaMm2, request.parameters.maxPocketAreaMm2 * 0.001),
    coordinateQuantumMm: 10 ** -EXPORT_DECIMALS,
    integerScale: 10 ** EXPORT_DECIMALS,
  };
}

export function generateTray(
  request: GenerationRequest,
  control: GenerationControl = {},
  options: OptimizerOptions = {},
): GenerationOutcome {
  const parameters = request.parameters;
  const parameterFailure = validateParameters(parameters);
  if (parameterFailure) return parameterFailure;
  emitProgress(control, "validating", 0, request.evaluationBudget ?? defaultBudget(parameters), 0, null);

  if (!request.outline.sourceUnit || !Number.isFinite(request.outline.sourceToMm) || request.outline.sourceToMm <= 0) {
    return failure(parameters, "UNSUPPORTED_CONFIGURATION", "CFG_PHYSICAL_UNIT_REQUIRED", "입력의 실제 물리 단위를 확인해야 합니다.");
  }
  if (request.outline.outer.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return failure(parameters, "INVALID_GEOMETRY", "GEOM_NON_FINITE_COORDINATE", "외곽선에 유한하지 않은 좌표가 있습니다.");
  }
  const outer = normalizeRing(request.outline.outer);
  if (outer.length < 3) {
    return failure(parameters, "INVALID_GEOMETRY", "GEOM_ZERO_OR_NEGLIGIBLE_AREA", "외곽선 면적이 0이거나 너무 작습니다.");
  }
  if (!isSimpleRing(outer)) {
    return failure(parameters, "INVALID_GEOMETRY", "GEOM_SELF_INTERSECTION", "외곽선이 자기 교차합니다.");
  }
  if (area(outer) <= 1e-9) {
    return failure(parameters, "INVALID_GEOMETRY", "GEOM_ZERO_OR_NEGLIGIBLE_AREA", "외곽선 면적이 0이거나 너무 작습니다.");
  }

  const canonicalRequest: GenerationRequest = { ...request, outline: { ...request.outline, outer } };
  const tolerances = createToleranceProfile(canonicalRequest);
  const safe: SafeInterval = {
    low: parameters.minPocketAreaMm2 + tolerances.exportAreaGuardMm2,
    high: parameters.maxPocketAreaMm2 - tolerances.exportAreaGuardMm2,
  };
  if (safe.low > safe.high) {
    return failure(parameters, "UNSUPPORTED_CONFIGURATION", "CFG_EXPORT_GUARD_EXHAUSTS_AREA_INTERVAL", "내보내기 안전 여유가 입력 면적 구간을 소진합니다.", 0, { safeLowMm2: safe.low, safeHighMm2: safe.high });
  }

  const kernel = options.kernel ?? new ClipperTsKernel(EXPORT_DECIMALS);
  const geometry = new PocketGeometryService(kernel, tolerances.flattenDeviationMm);
  const domains = geometry.buildDomains(outer, parameters.outerMarginMm, parameters.webWidthMm);
  if (!domains) {
    return failure(parameters, "UNSUPPORTED_CONFIGURATION", "CFG_OFFSET_DOMAIN_MULTI_COMPONENT", "여백 또는 웹 폭 적용 후 단일 연결 영역을 만들 수 없습니다.");
  }
  const usableArea = polygonArea(domains.usableDomain);
  if (usableArea <= tolerances.areaMm2) {
    return failure(parameters, "PROVEN_INFEASIBLE", "FEASIBLE_USABLE_DOMAIN_EMPTY", "외곽 여백을 적용하면 사용 가능한 영역이 남지 않습니다.");
  }
  if (parameters.cellCount * parameters.minPocketAreaMm2 > usableArea + tolerances.areaMm2) {
    return failure(parameters, "PROVEN_INFEASIBLE", "FEASIBLE_MIN_AREA_CAPACITY_EXCEEDED", "요청한 최소 포켓 면적 합이 사용 가능 면적보다 큽니다.", 0, { usableAreaMm2: usableArea });
  }

  const evaluationBudget = Math.max(1, Math.floor(request.evaluationBudget ?? defaultBudget(parameters)));
  if (control.isCancelled?.()) return { status: "cancelled", evaluations: 0 };
  const randomSeed = `${parameters.seed}|${request.outline.sourceDigest}`;
  const random = createSeededRandom(randomSeed);
  const alternativeRandom = createSeededRandom(`${randomSeed}|multi-start`);
  const flowField = new BoundaryFlowField(domains.usableDomain.outer, Math.max(parameters.webWidthMm * 2, Math.sqrt(usableArea / parameters.cellCount)));
  const initialSiteSets = initializeSiteSets(domains.territoryDomain.outer, parameters.cellCount, random, alternativeRandom, flowField);
  if (initialSiteSets.length === 0) {
    return failure(parameters, "SEARCH_EXHAUSTED", "SEARCH_NO_VALID_INITIALIZATION", "영역 안에 요청한 수의 초기 사이트를 배치하지 못했습니다.");
  }

  let evaluations = 0;
  const baselineSites = initialSiteSets[0]!;
  let current = evaluate(baselineSites, domains, geometry, safe, null, flowField, usableArea);
  evaluations += 1;
  let initializationFallback = current;

  // A hard-invalid baseline needs the full deterministic balancing budget.
  // Alternate starts and centroidal relaxation are aesthetic refinements, so
  // they are evaluated only after the baseline already proves hard feasibility.
  if (current.hardViolationCount === 0) {
    for (const initialSites of initialSiteSets.slice(1)) {
      if (evaluations >= evaluationBudget) break;
      const initial = evaluate(initialSites, domains, geometry, safe, null, flowField, usableArea);
      evaluations += 1;
      if (compareInitializationForSearch(initial, current) < 0) current = initial;
      if (compareFinalCandidate(initial, initializationFallback) < 0) initializationFallback = initial;
    }
    if (evaluations < evaluationBudget) {
      const relaxed = evaluate(centroidalRelaxation(current), domains, geometry, safe, null, flowField, usableArea);
      evaluations += 1;
      if (compareInitializationForSearch(relaxed, current) < 0) current = relaxed;
      if (compareFinalCandidate(relaxed, initializationFallback) < 0) initializationFallback = relaxed;
    }
  }
  let currentSites = current.sites;
  if (parameters.cellCount === 1) {
    const actualArea = current.builds[0]?.finalAreaMm2 ?? 0;
    if (actualArea < parameters.minPocketAreaMm2 || actualArea > parameters.maxPocketAreaMm2) {
      return failure(
        parameters,
        "PROVEN_INFEASIBLE",
        "FEASIBLE_SINGLE_POCKET_AREA_OUT_OF_RANGE",
        "단일 포켓의 실제 면적이 요청 범위에 들어갈 수 없습니다.",
        evaluations,
        { actualAreaMm2: actualArea },
      );
    }
  }
  let targets = createTargets(current.totalPocketArea, parameters.cellCount, safe, random);
  current = evaluate(currentSites, domains, geometry, safe, targets, flowField, usableArea);
  evaluations += 1;
  let best = initializationFallback && compareFinalCandidate(initializationFallback, current) < 0
    ? initializationFallback
    : current;
  let epochSignature = current.topologySignature;
  let epochArea = current.totalPocketArea;
  emitProgress(control, "initializing", evaluations, evaluationBudget, best.hardViolationCount, best.score?.totalCost ?? null);

  // Power weights have squared-length units. A useful first step is therefore
  // proportional to the characteristic area of one cell, not a unitless gain.
  const weightStepScale = usableArea / parameters.cellCount;
  let step = 0.25 * weightStepScale;
  let stagnant = 0;
  let recoveryAttempts = 0;

  const hillReserve = Math.min(16, Math.max(4, Math.floor(evaluationBudget * 0.08)));
  while (evaluations < (best.hardViolationCount === 0 ? evaluationBudget - hillReserve : evaluationBudget)) {
    if (control.isCancelled?.()) return { status: "cancelled", evaluations };
    if (current.builds.some((build) => build.state === "absent") && recoveryAttempts < parameters.cellCount * 3) {
      const recovered = recoverEmptySites(current);
      recoveryAttempts += 1;
      if (recovered) {
        currentSites = recovered;
        current = evaluate(recovered, domains, geometry, safe, targets, flowField, usableArea);
        evaluations += 1;
        targets = createTargets(current.totalPocketArea, parameters.cellCount, safe, random);
        epochSignature = current.topologySignature;
        epochArea = current.totalPocketArea;
        if (compareEvaluation(current, best) < 0) best = current;
        continue;
      }
    }
    const proposal = proposeWeights(current, targets, safe, step, usableArea);
    const trial = evaluate(proposal, domains, geometry, safe, targets, flowField, usableArea);
    evaluations += 1;

    if (compareEvaluation(trial, current) < 0) {
      current = trial;
      currentSites = proposal;
      const topologyChanged = current.topologySignature !== epochSignature;
      const drift = epochArea > 0 ? Math.abs(current.totalPocketArea - epochArea) / epochArea : Number.POSITIVE_INFINITY;
      if ((topologyChanged || drift > 0.02) && evaluations < evaluationBudget) {
        targets = createTargets(current.totalPocketArea, parameters.cellCount, safe, random);
        current = evaluate(currentSites, domains, geometry, safe, targets, flowField, usableArea);
        evaluations += 1;
        epochSignature = current.topologySignature;
        epochArea = current.totalPocketArea;
      }
      stagnant = 0;
      step = Math.min(step * 1.08, 2 * weightStepScale);
    } else {
      stagnant += 1;
      step *= 0.5;
    }
    if (compareEvaluation(current, best) < 0) best = current;

    if (current.hardViolationCount === 0 && stagnant >= 4 && evaluations < evaluationBudget - hillReserve) {
      const moved = proposeSiteMove(currentSites, domains.territoryDomain.outer, flowField, random, evaluations);
      if (moved) {
        const movedTrial = evaluate(moved, domains, geometry, safe, targets, flowField, usableArea);
        evaluations += 1;
        if (acceptAnnealed(movedTrial, current, evaluations, evaluationBudget, random)) {
          current = movedTrial;
          currentSites = moved;
          targets = createTargets(current.totalPocketArea, parameters.cellCount, safe, random);
          epochSignature = current.topologySignature;
          epochArea = current.totalPocketArea;
          stagnant = 0;
          step = Math.max(step, 0.1 * weightStepScale);
        }
        if (compareEvaluation(current, best) < 0) best = current;
      }
    }

    if (evaluations % 8 === 0) {
      emitProgress(control, current.hardViolationCount === 0 ? "searching" : "balancing", evaluations, evaluationBudget, best.hardViolationCount, best.score?.totalCost ?? null);
    }
    if (best.hardViolationCount === 0 && stagnant >= 16) break;
  }

  if (evaluations < evaluationBudget) {
    const hillTargets = createTargets(best.totalPocketArea, parameters.cellCount, safe, random);
    let hillCurrent = evaluate(best.sites, domains, geometry, safe, hillTargets, flowField, usableArea);
    evaluations += 1;
    const hillResult = coordinateHillClimb(
      hillCurrent,
      hillTargets,
      domains,
      geometry,
      safe,
      flowField,
      usableArea,
      evaluations,
      evaluationBudget,
    );
    hillCurrent = hillResult.evaluation;
    evaluations = hillResult.evaluations;
    if (compareFinalCandidate(hillCurrent, best) < 0) best = hillCurrent;
  }

  emitProgress(control, "finalizing", evaluations, evaluationBudget, best.hardViolationCount, best.score?.totalCost ?? null);
  const finalAreasSafe = best.pockets.every((pocket) => pocket.areaMm2 >= safe.low && pocket.areaMm2 <= safe.high);
  if (best.hardViolationCount > 0 || best.pockets.length !== parameters.cellCount || !best.score || !finalAreasSafe) {
    const nonPresentStates = [...new Set(
      best.builds
        .filter((build) => build.state !== "present")
        .map((build) => build.state),
    )].sort();
    let reason: ReasonCode = "SEARCH_AREA_INTERVAL_NOT_REACHED";
    const details: Record<string, number | string | boolean> = {
      bestHardViolationCount: best.hardViolationCount,
      bestHardResidual: best.hardResidual,
    };
    if (nonPresentStates.includes("absent")) {
      reason = "SEARCH_EMPTY_CELL_RECOVERY_EXHAUSTED";
    } else if (nonPresentStates.length > 0) {
      reason = "SEARCH_TOPOLOGY_INSTABILITY";
      details.topologyStates = nonPresentStates.join(",");
    }
    return failure(
      parameters,
      "SEARCH_EXHAUSTED",
      reason,
      "고정된 평가 예산 안에서 모든 하드 제약을 만족하는 결과를 찾지 못했습니다. 파라미터를 조정해 주세요.",
      evaluations,
      details,
    );
  }
  const invariantFailure = finalPocketInvariantFailure(best.pockets, domains, tolerances.areaMm2, geometry);
  if (invariantFailure) {
    return failure(parameters, "INVALID_GEOMETRY", "GEOM_KERNEL_CONTAINMENT_INVARIANT_FAILED", "최종 포켓의 포함 또는 비겹침 불변식 검증에 실패했습니다.", evaluations, { invariant: invariantFailure });
  }

  return successResult(canonicalRequest, best, domains, tolerances, kernel, evaluations, evaluationBudget);
}

function defaultBudget(parameters: GenerationParameters): number {
  let factor: number;
  switch (parameters.qualityPreset) {
    case "draft":
      factor = 24;
      break;
    case "standard":
      factor = 64;
      break;
    case "extended":
      factor = 144;
      break;
  }
  return Math.max(48, factor * parameters.cellCount);
}

function initializeSites(ring: readonly Vec2[], count: number, random: SeededRandom): readonly WeightedSite[] | null {
  const box = bounds(ring);
  const candidates: Vec2[] = [];
  const grid = Math.max(12, Math.ceil(Math.sqrt(count * 80)));
  for (let y = 0; y < grid; y += 1) {
    for (let x = 0; x < grid; x += 1) {
      const jitterX = (random.next() - 0.5) * 0.5;
      const jitterY = (random.next() - 0.5) * 0.5;
      const point = {
        x: box.minX + (x + 0.5 + jitterX) / grid * (box.maxX - box.minX),
        y: box.minY + (y + 0.5 + jitterY) / grid * (box.maxY - box.minY),
      };
      if (pointInRing(point, ring)) candidates.push(point);
    }
  }
  if (candidates.length < count) return null;
  const selected: Vec2[] = [candidates[random.integer(candidates.length)]!];
  while (selected.length < count) {
    let best: Vec2 | null = null;
    let bestDistance = -1;
    for (const candidate of candidates) {
      const nearest = Math.min(...selected.map((point) => distanceSquared(candidate, point)));
      if (nearest > bestDistance) {
        best = candidate;
        bestDistance = nearest;
      }
    }
    if (!best) return null;
    selected.push(best);
  }
  return selected.map((point, index) => ({ id: `cell-${String(index + 1).padStart(3, "0")}`, point, weight: 0 }));
}

function initializeSiteSets(
  ring: readonly Vec2[],
  count: number,
  baselineRandom: SeededRandom,
  alternativeRandom: SeededRandom,
  flowField: BoundaryFlowField,
): readonly (readonly WeightedSite[])[] {
  const farthest = initializeSites(ring, count, baselineRandom);
  const poisson = initializeSites(ring, count, alternativeRandom);
  const sets: (readonly WeightedSite[])[] = [];
  if (farthest) sets.push(farthest);
  if (poisson) sets.push(poisson);
  const flowBiased = initializeFlowBiasedSites(ring, count, flowField);
  if (flowBiased) sets.push(flowBiased);
  return sets;
}

function initializeFlowBiasedSites(
  ring: readonly Vec2[],
  count: number,
  flowField: BoundaryFlowField,
): readonly WeightedSite[] | null {
  const center = centroid(ring);
  if (!pointInRing(center, ring)) return null;
  const flow = flowField.sample(center);
  const tiltedAcross = {
    x: -flow.direction.y + 0.35 * flow.direction.x,
    y: flow.direction.x + 0.35 * flow.direction.y,
  };
  const tiltedLength = Math.max(1e-12, Math.hypot(tiltedAcross.x, tiltedAcross.y));
  const acrossFlow = { x: tiltedAcross.x / tiltedLength, y: tiltedAcross.y / tiltedLength };
  const box = bounds(ring);
  const reach = Math.hypot(box.maxX - box.minX, box.maxY - box.minY);
  const candidates: Vec2[] = [];
  for (let sample = -100; sample <= 100; sample += 1) {
    const offset = reach * sample / 100;
    const point = { x: center.x + acrossFlow.x * offset, y: center.y + acrossFlow.y * offset };
    if (pointInRing(point, ring)) candidates.push(point);
  }
  if (candidates.length < count) return null;
  return Array.from({ length: count }, (_, index) => {
    const position = count === 1 ? 0.5 : (index + 0.5) / count;
    const candidateIndex = Math.min(candidates.length - 1, Math.floor(position * candidates.length));
    return {
      id: `cell-${String(index + 1).padStart(3, "0")}`,
      point: candidates[candidateIndex]!,
      weight: 0,
    };
  });
}

function centroidalRelaxation(evaluation: Evaluation): readonly WeightedSite[] {
  return evaluation.sites.map((site, index) => {
    const components = polygonsOf(evaluation.territories[index]!.geometry);
    const largest = [...components].sort((a, b) => area(b.outer) - area(a.outer))[0];
    if (!largest) return site;
    const point = centroid(largest.outer);
    return pointInRing(point, largest.outer) ? { ...site, point, weight: 0 } : site;
  });
}

function evaluate(
  sites: readonly WeightedSite[],
  domains: PocketDomains,
  geometry: PocketGeometryService,
  safe: SafeInterval,
  targets: readonly number[] | null,
  flowField: BoundaryFlowField,
  usableArea: number,
): Evaluation {
  const territories = buildPowerTerritories(sites, domains.territoryDomain, geometry.kernel);
  const builds = territories.map((territory) => geometry.roundInset(territory.geometry, domains));
  const pockets: FinalPocket[] = [];
  let hardViolationCount = 0;
  let hardResidual = 0;
  let targetResidual = 0;
  for (let index = 0; index < builds.length; index += 1) {
    const build = builds[index]!;
    const target = targets?.[index] ?? (safe.low + safe.high) / 2;
    if (build.state !== "present" || !build.polygon) {
      hardViolationCount += 1;
      hardResidual += safe.low;
      continue;
    }
    const pocketArea = build.finalAreaMm2;
    if (pocketArea < safe.low) {
      hardViolationCount += 1;
      hardResidual += safe.low - pocketArea;
    } else if (pocketArea > safe.high) {
      hardViolationCount += 1;
      hardResidual += pocketArea - safe.high;
    }
    targetResidual += Math.abs(target - pocketArea) / Math.max(target, 1e-9);
    pockets.push(toFinalPocket(territories[index]!.siteId, build.polygon, flowField, geometry));
  }
  const contactToleranceMm = 2 * Math.max(10 ** -geometry.kernel.precision, 1e-7);
  const topologySignature = territoryTopologySignature(
    territories,
    builds.map((build) => build.state),
    contactToleranceMm,
  );
  const totalPocketArea = builds.reduce((sum, build) => sum + build.finalAreaMm2, 0);
  const score = pockets.length === sites.length
    ? scoreCandidate(pockets, targets ?? pockets.map((pocket) => pocket.areaMm2), totalPocketArea / Math.max(usableArea, 1e-9))
    : null;
  return { sites, territories, builds, pockets, hardViolationCount, hardResidual, targetResidual, score, topologySignature, totalPocketArea };
}

function toFinalPocket(id: string, polygon: { readonly outer: readonly Vec2[]; readonly holes: readonly (readonly Vec2[])[] }, flowField: BoundaryFlowField, geometry: PocketGeometryService): FinalPocket {
  const pocketArea = polygonArea(polygon);
  const pocketPerimeter = perimeter(polygon.outer);
  const center = centroid(polygon.outer);
  const covariance = covarianceAxis(polygon.outer);
  const flow = flowField.sample(center);
  const eligible = covariance.axis && covariance.confidence >= 0.05 && flow.confidence >= 0.2;
  const minimumWidth = 2 * pocketArea / Math.max(pocketPerimeter, 1e-9);
  const warnings: string[] = [];
  if ((covariance.aspectRatio ?? 1) > 3.5) warnings.push("HIGH_ASPECT_RATIO");
  if (minimumWidth < Math.max(geometry.flattenToleranceMm, 1)) warnings.push("NARROW_POCKET");
  return {
    id,
    polygon,
    areaMm2: pocketArea,
    centroidMm: center,
    perimeterMm: pocketPerimeter,
    principalAxis: covariance.axis,
    aspectRatio: covariance.aspectRatio,
    minimumWidthEstimateMm: minimumWidth,
    flowConfidence: eligible ? flow.confidence : 0,
    flowAlignment: eligible ? unsignedAlignment(covariance.axis!, flow.direction) : null,
    warnings,
  };
}

function scoreCandidate(pockets: readonly FinalPocket[], targets: readonly number[], utilization: number): ScoreBreakdown {
  const mean = pockets.reduce((sum, pocket) => sum + pocket.areaMm2, 0) / Math.max(1, pockets.length);
  const variance = pockets.reduce((sum, pocket) => sum + (pocket.areaMm2 - mean) ** 2, 0) / Math.max(1, pockets.length);
  const cv = Math.sqrt(variance) / Math.max(mean, 1e-9);
  const targetDeviation = pockets.reduce((sum, pocket, index) => sum + Math.abs(pocket.areaMm2 - (targets[index] ?? mean)) / Math.max(targets[index] ?? mean, 1), 0) / pockets.length;
  const organicBandPenalty = Math.max(0, 0.18 - cv) * 4 + Math.max(0, cv - 0.35) * 2;
  const areaProfileCost = targetDeviation + organicBandPenalty;
  let flowWeight = 0;
  let flowLoss = 0;
  for (const pocket of pockets) {
    if (pocket.flowAlignment === null || pocket.flowConfidence < 0.2) continue;
    flowWeight += pocket.flowConfidence;
    flowLoss += pocket.flowConfidence * (1 - pocket.flowAlignment ** 2);
  }
  const flowAvailable = flowWeight > 0;
  const flowCost = flowAvailable ? flowLoss / flowWeight : 0;
  const shapeCost = pockets.reduce((sum, pocket) => {
    const aspect = pocket.aspectRatio ?? 1;
    const aspectPenalty = aspect <= 2.75 ? Math.max(0, 1.2 - aspect) / 1.2 : Math.min(1, (aspect - 2.75) / 2.25);
    const compactness = pocket.perimeterMm ** 2 / Math.max(4 * Math.PI * pocket.areaMm2, 1e-9);
    return sum + 0.65 * aspectPenalty + 0.35 * Math.min(1, Math.max(0, compactness - 1) / 3);
  }, 0) / pockets.length;
  const cornerCost = pockets.reduce((sum, pocket) => sum + cornerPenalty(pocket.polygon.outer), 0) / pockets.length;
  const boundaryCost = flowAvailable ? flowCost : 0;
  const unusedCost = Math.max(0, 1 - utilization);
  return {
    totalCost: 0.35 * unusedCost + 0.2 * areaProfileCost + 0.2 * flowCost + 0.15 * shapeCost + 0.05 * cornerCost + 0.05 * boundaryCost,
    utilization,
    unusedCost,
    areaProfileCost,
    flowCost,
    flowAvailable,
    shapeCost,
    cornerCost,
    boundaryCost,
    organicAreaCv: cv,
  };
}

function createTargets(totalArea: number, count: number, safe: SafeInterval, random: SeededRandom): readonly number[] {
  const targetTotal = Math.min(count * safe.high, Math.max(count * safe.low, totalArea));
  const phase = random.next() * Math.PI * 2;
  const raw = Array.from({ length: count }, (_, index) => 1 + 0.34 * Math.sin(phase + index * 2.399963229728653));
  const targets = raw.map((value) => value * targetTotal / raw.reduce((sum, item) => sum + item, 0));
  for (let iteration = 0; iteration < count * 3; iteration += 1) {
    const fixed = targets.map((value) => Math.min(safe.high, Math.max(safe.low, value)));
    const delta = targetTotal - fixed.reduce((sum, value) => sum + value, 0);
    const free = fixed.map((value, index) => ({ value, index })).filter(({ value }) => delta > 0 ? value < safe.high : value > safe.low);
    if (free.length === 0 || Math.abs(delta) < 1e-8) return fixed;
    targets.splice(0, targets.length, ...fixed);
    for (const { index } of free) targets[index]! += delta / free.length;
  }
  return targets.map((value) => Math.min(safe.high, Math.max(safe.low, value)));
}

function proposeWeights(current: Evaluation, targets: readonly number[], safe: SafeInterval, step: number, usableArea: number): readonly WeightedSite[] {
  const weightScale = Math.max(1, usableArea / Math.max(1, current.sites.length));
  const proposed = current.sites.map((site, index) => {
    const build = current.builds[index]!;
    const pocketArea = build.finalAreaMm2;
    let residual: number;
    if (pocketArea < safe.low) {
      residual = safe.low - pocketArea;
    } else if (pocketArea > safe.high) {
      residual = safe.high - pocketArea;
    } else {
      residual = Math.max(-0.25 * weightScale, Math.min(0.25 * weightScale, targets[index]! - pocketArea));
    }
    return { ...site, weight: site.weight + step * residual / weightScale };
  });
  const meanWeight = proposed.reduce((sum, site) => sum + site.weight, 0) / proposed.length;
  return proposed.map((site) => ({ ...site, weight: site.weight - meanWeight }));
}

function proposeSiteMove(
  sites: readonly WeightedSite[],
  domain: readonly Vec2[],
  flowField: BoundaryFlowField,
  random: SeededRandom,
  evaluation: number,
): readonly WeightedSite[] | null {
  const index = evaluation % sites.length;
  const site = sites[index]!;
  const flow = flowField.sample(site.point);
  const box = bounds(domain);
  const scale = 0.025 * Math.hypot(box.maxX - box.minX, box.maxY - box.minY);
  const perpendicular = { x: -flow.direction.y, y: flow.direction.x };
  const direction = evaluation % 2 === 0 ? flow.direction : perpendicular;
  const sign = random.next() < 0.5 ? -1 : 1;
  const point = { x: site.point.x + sign * scale * direction.x, y: site.point.y + sign * scale * direction.y };
  if (!pointInRing(point, domain)) return null;
  return sites.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, point } : candidate);
}

function coordinateHillClimb(
  start: Evaluation,
  targets: readonly number[],
  domains: PocketDomains,
  geometry: PocketGeometryService,
  safe: SafeInterval,
  flowField: BoundaryFlowField,
  usableArea: number,
  initialEvaluations: number,
  evaluationBudget: number,
): { readonly evaluation: Evaluation; readonly evaluations: number } {
  const box = bounds(domains.territoryDomain.outer);
  const diagonal = Math.hypot(box.maxX - box.minX, box.maxY - box.minY);
  const directions: readonly Vec2[] = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
  let current = start;
  let evaluations = initialEvaluations;
  let step = 0.02 * diagonal;
  const minimumStep = 0.001 * diagonal;

  while (step >= minimumStep && evaluations < evaluationBudget) {
    let improved = false;
    for (let siteIndex = 0; siteIndex < current.sites.length && evaluations < evaluationBudget; siteIndex += 1) {
      for (const direction of directions) {
        if (evaluations >= evaluationBudget) break;
        const site = current.sites[siteIndex]!;
        const point = { x: site.point.x + direction.x * step, y: site.point.y + direction.y * step };
        if (!pointInRing(point, domains.territoryDomain.outer)) continue;
        const proposed = current.sites.map((candidate, index) => index === siteIndex ? { ...candidate, point } : candidate);
        const trial = evaluate(proposed, domains, geometry, safe, targets, flowField, usableArea);
        evaluations += 1;
        if (compareEvaluation(trial, current) < 0) {
          current = trial;
          improved = true;
          break;
        }
      }
    }
    if (!improved) step *= 0.5;
  }
  return { evaluation: current, evaluations };
}

function recoverEmptySites(current: Evaluation): readonly WeightedSite[] | null {
  const failedIndex = current.builds.findIndex((build) => build.state !== "present");
  if (failedIndex < 0) return null;
  let donorRing: readonly Vec2[] | null = null;
  let donorArea = -1;
  for (const territory of current.territories) {
    for (const polygon of polygonsOf(territory.geometry)) {
      const candidateArea = area(polygon.outer);
      if (candidateArea > donorArea) {
        donorArea = candidateArea;
        donorRing = polygon.outer;
      }
    }
  }
  if (!donorRing) return null;
  const box = bounds(donorRing);
  let farthest: Vec2 | null = null;
  let farthestDistance = -1;
  const grid = 17;
  for (let y = 0; y < grid; y += 1) {
    for (let x = 0; x < grid; x += 1) {
      const point = {
        x: box.minX + (x + 0.5) / grid * (box.maxX - box.minX),
        y: box.minY + (y + 0.5) / grid * (box.maxY - box.minY),
      };
      if (!pointInRing(point, donorRing)) continue;
      const nearest = Math.min(...current.sites.filter((_, index) => index !== failedIndex).map((site) => distanceSquared(point, site.point)));
      if (nearest > farthestDistance) {
        farthest = point;
        farthestDistance = nearest;
      }
    }
  }
  if (!farthest) return null;
  const weights = current.sites.map((site) => site.weight).sort((a, b) => a - b);
  const medianWeight = weights[Math.floor(weights.length / 2)] ?? 0;
  const recovered = current.sites.map((site, index) => index === failedIndex ? { ...site, point: farthest!, weight: medianWeight } : site);
  const meanWeight = recovered.reduce((sum, site) => sum + site.weight, 0) / recovered.length;
  return recovered.map((site) => ({ ...site, weight: site.weight - meanWeight }));
}

function compareEvaluation(a: Evaluation, b: Evaluation): number {
  if (a.hardViolationCount !== b.hardViolationCount) return a.hardViolationCount - b.hardViolationCount;
  if (Math.abs(a.hardResidual - b.hardResidual) > 1e-9) return a.hardResidual - b.hardResidual;
  const aOrganicRank = a.score && a.score.organicAreaCv >= 0.18 && a.score.organicAreaCv <= 0.35 ? 0 : 1;
  const bOrganicRank = b.score && b.score.organicAreaCv >= 0.18 && b.score.organicAreaCv <= 0.35 ? 0 : 1;
  if (aOrganicRank !== bOrganicRank) return aOrganicRank - bOrganicRank;
  const scoreDifference = (a.score?.totalCost ?? Number.POSITIVE_INFINITY) - (b.score?.totalCost ?? Number.POSITIVE_INFINITY);
  if (Math.abs(scoreDifference) > 1e-9) return scoreDifference;
  return a.targetResidual - b.targetResidual;
}

function compareHardOnly(a: Evaluation, b: Evaluation): number {
  if (a.hardViolationCount !== b.hardViolationCount) return a.hardViolationCount - b.hardViolationCount;
  if (Math.abs(a.hardResidual - b.hardResidual) > 1e-9) return a.hardResidual - b.hardResidual;
  return 0;
}

function compareInitializationForSearch(a: Evaluation, b: Evaluation): number {
  const hard = compareHardOnly(a, b);
  if (hard !== 0) return hard;
  const aCost = a.score ? a.score.flowCost + 0.25 * a.score.shapeCost : Number.POSITIVE_INFINITY;
  const bCost = b.score ? b.score.flowCost + 0.25 * b.score.shapeCost : Number.POSITIVE_INFINITY;
  return aCost - bCost;
}

function compareFinalCandidate(a: Evaluation, b: Evaluation): number {
  if (a.hardViolationCount !== b.hardViolationCount) return a.hardViolationCount - b.hardViolationCount;
  if (Math.abs(a.hardResidual - b.hardResidual) > 1e-9) return a.hardResidual - b.hardResidual;
  const aOrganicRank = a.score && a.score.organicAreaCv >= 0.18 && a.score.organicAreaCv <= 0.35 ? 0 : 1;
  const bOrganicRank = b.score && b.score.organicAreaCv >= 0.18 && b.score.organicAreaCv <= 0.35 ? 0 : 1;
  if (aOrganicRank !== bOrganicRank) return aOrganicRank - bOrganicRank;
  return (a.score?.totalCost ?? Number.POSITIVE_INFINITY) - (b.score?.totalCost ?? Number.POSITIVE_INFINITY);
}

function acceptAnnealed(trial: Evaluation, current: Evaluation, evaluation: number, budget: number, random: SeededRandom): boolean {
  const comparison = compareEvaluation(trial, current);
  if (comparison <= 0) return true;
  if (trial.hardViolationCount > current.hardViolationCount || trial.hardResidual > current.hardResidual + 1e-9) return false;
  const temperature = Math.max(1e-6, 1 - evaluation / budget) * 0.05;
  return random.next() < Math.exp(-comparison / temperature);
}

function finalPocketInvariantFailure(
  pockets: readonly FinalPocket[],
  domains: PocketDomains,
  epsilonArea: number,
  geometry: PocketGeometryService,
): string | null {
  for (let i = 0; i < pockets.length; i += 1) {
    const pocket = pockets[i]!;
    if (!isSimpleRing(pocket.polygon.outer)) return `pocket-${i}-non-simple`;
    if (pocket.polygon.holes.length > 0) return `pocket-${i}-has-holes`;
    if (!geometry.isContainedWithin(pocket.polygon, domains.usableDomain)) return `pocket-${i}-outside-usable-domain`;
    for (let j = i + 1; j < pockets.length; j += 1) {
      if (ringsOverlapAtInterior(pocket.polygon.outer, pockets[j]!.polygon.outer, Math.sqrt(epsilonArea) * 1e-3)) return `pockets-${i}-${j}-overlap`;
    }
  }
  return null;
}

function successResult(
  request: GenerationRequest,
  best: Evaluation,
  domains: PocketDomains,
  tolerances: ToleranceProfile,
  kernel: GeometryKernel,
  evaluations: number,
  evaluationBudget: number,
): GenerationSuccess {
  const box = bounds(request.outline.outer);
  const normalization = Math.hypot(box.maxX - box.minX, box.maxY - box.minY);
  const canonicalDigest = deterministicHash(request.outline.outer);
  const metadataWithoutHash = {
    inputDigest: request.outline.sourceDigest,
    canonicalDigest,
    seed: request.parameters.seed,
    algorithmId: "weighted-power-pocket-search" as const,
    algorithmVersion: ALGORITHM_VERSION,
    geometryKernelId: kernel.id,
    geometryKernelVersion: kernel.version,
    supportedInputContractVersion: INPUT_CONTRACT_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    objectiveConfigurationVersion: OBJECTIVE_VERSION,
    evaluationBudget,
    tolerancePolicy: tolerances,
    coordinateNormalizationFactor: normalization,
    integerCoordinateScale: tolerances.integerScale,
    exportDecimalPrecision: EXPORT_DECIMALS,
  };
  const resultHash = deterministicHash({ metadataWithoutHash, pockets: best.pockets });
  const metadata: ReproducibilityMetadata = { ...metadataWithoutHash, resultHash };
  return {
    status: "success",
    outline: request.outline,
    pockets: best.pockets,
    territories: best.territories,
    usableDomain: domains.usableDomain,
    territoryDomain: domains.territoryDomain,
    utilization: best.score!.utilization,
    score: best.score!,
    parameters: request.parameters,
    evaluations,
    metadata,
  };
}

function polygonArea(polygon: { readonly outer: readonly Vec2[]; readonly holes: readonly (readonly Vec2[])[] }): number {
  return area(polygon.outer) - polygon.holes.reduce((sum, hole) => sum + area(hole), 0);
}

function cornerPenalty(ring: readonly Vec2[]): number {
  if (ring.length < 3) return 1;
  let penalty = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const previous = ring[(index + ring.length - 1) % ring.length]!;
    const current = ring[index]!;
    const next = ring[(index + 1) % ring.length]!;
    const a = Math.atan2(previous.y - current.y, previous.x - current.x);
    const b = Math.atan2(next.y - current.y, next.x - current.x);
    let angle = Math.abs(a - b);
    if (angle > Math.PI) angle = 2 * Math.PI - angle;
    if (angle < Math.PI / 3) penalty += (Math.PI / 3 - angle) / (Math.PI / 3);
  }
  return penalty / ring.length;
}

function emitProgress(
  control: GenerationControl,
  phase: GenerationProgress["phase"],
  evaluations: number,
  evaluationBudget: number,
  bestHardViolationCount: number,
  bestCost: number | null,
): void {
  control.onProgress?.({ phase, evaluations, evaluationBudget, bestHardViolationCount, bestCost });
}
