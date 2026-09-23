export { generateTray, createToleranceProfile, type OptimizerOptions } from "./optimize";
export { validateParameters, failure } from "./failures";
export { ClipperTsKernel, polygonsOf, type GeometryKernel, type OffsetOptions } from "./kernel";
export { PocketGeometryService, type PocketBuildResult, type PocketDomains, type PocketState } from "./pocketGeometry";
export { buildPowerTerritories, territoryTopologySignature, type WeightedSite } from "./powerDiagram";
export { BoundaryFlowField, unsignedAlignment, type FlowSample } from "./boundaryFlow";
export { createSeededRandom, deterministicHash, type SeededRandom } from "./random";
export {
  area,
  bounds,
  centroid,
  clipRingToHalfPlane,
  containsRing,
  covarianceAxis,
  isSimpleRing,
  normalizeRing,
  perimeter,
  pointInRing,
  ringsOverlapAtInterior,
  signedArea,
} from "./geometry";
export type {
  Bounds,
  CanonicalOutline,
  FailureCategory,
  FinalPocket,
  GenerationCancelled,
  GenerationControl,
  GenerationFailure,
  GenerationOutcome,
  GenerationParameters,
  GenerationProgress,
  GenerationRequest,
  GenerationSuccess,
  MultiPolygon,
  Polygon,
  Polygonal,
  QualityPreset,
  RawPowerTerritory,
  ReasonCode,
  ReproducibilityMetadata,
  Ring,
  ScoreBreakdown,
  ToleranceProfile,
  Vec2,
} from "./types";
