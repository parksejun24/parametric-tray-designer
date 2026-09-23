export type Vec2 = Readonly<{ x: number; y: number }>;
export type Ring = readonly Vec2[];

export interface Polygon {
  readonly outer: Ring;
  readonly holes: readonly Ring[];
}

export interface MultiPolygon {
  readonly polygons: readonly Polygon[];
}

export type Polygonal = Polygon | MultiPolygon;

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface CanonicalOutline {
  readonly sourceFormat: "svg" | "dxf";
  readonly sourceUnit: string;
  readonly sourceToMm: number;
  readonly outer: Ring;
  readonly boundsMm?: Bounds;
  readonly sourceDigest: string;
  readonly flattenToleranceMm: number;
}

export type QualityPreset = "draft" | "standard" | "extended";

export interface GenerationParameters {
  readonly cellCount: number;
  readonly minPocketAreaMm2: number;
  readonly maxPocketAreaMm2: number;
  readonly seed: string;
  readonly webWidthMm: number;
  readonly outerMarginMm: number;
  readonly qualityPreset: QualityPreset;
}

export interface GenerationRequest {
  readonly outline: CanonicalOutline;
  readonly parameters: GenerationParameters;
  readonly evaluationBudget?: number;
}

export interface ToleranceProfile {
  readonly flattenDeviationMm: number;
  readonly closureMm: number;
  readonly areaMm2: number;
  readonly exportAreaGuardMm2: number;
  readonly coordinateQuantumMm: number;
  readonly integerScale: number;
}

export interface RawPowerTerritory {
  readonly siteId: string;
  readonly geometry: Polygonal;
  readonly site: Vec2;
  readonly powerWeight: number;
}

export interface FinalPocket {
  readonly id: string;
  readonly polygon: Polygon;
  readonly areaMm2: number;
  readonly centroidMm: Vec2;
  readonly perimeterMm: number;
  readonly principalAxis: Vec2 | null;
  readonly aspectRatio: number | null;
  readonly minimumWidthEstimateMm: number | null;
  readonly flowConfidence: number;
  readonly flowAlignment: number | null;
  readonly warnings: readonly string[];
}

export interface ScoreBreakdown {
  readonly totalCost: number;
  readonly utilization: number;
  readonly unusedCost: number;
  readonly areaProfileCost: number;
  readonly flowCost: number;
  readonly flowAvailable: boolean;
  readonly shapeCost: number;
  readonly cornerCost: number;
  readonly boundaryCost: number;
  readonly organicAreaCv: number;
}

export interface ReproducibilityMetadata {
  readonly inputDigest: string;
  readonly canonicalDigest: string;
  readonly resultHash: string;
  readonly seed: string;
  readonly algorithmId: "weighted-power-pocket-search";
  readonly algorithmVersion: string;
  readonly geometryKernelId: string;
  readonly geometryKernelVersion: string;
  readonly supportedInputContractVersion: string;
  readonly canonicalizationVersion: string;
  readonly objectiveConfigurationVersion: string;
  readonly evaluationBudget: number;
  readonly tolerancePolicy: ToleranceProfile;
  readonly coordinateNormalizationFactor: number;
  readonly integerCoordinateScale: number;
  readonly exportDecimalPrecision: number;
}

export interface GenerationSuccess {
  readonly status: "success";
  readonly outline: CanonicalOutline;
  readonly pockets: readonly FinalPocket[];
  readonly territories: readonly RawPowerTerritory[];
  readonly usableDomain: Polygon;
  readonly territoryDomain: Polygon;
  readonly utilization: number;
  readonly score: ScoreBreakdown;
  readonly parameters: GenerationParameters;
  readonly evaluations: number;
  readonly metadata: ReproducibilityMetadata;
}

export interface GenerationCancelled {
  readonly status: "cancelled";
  readonly evaluations: number;
}

export type GenerationOutcome = GenerationSuccess | GenerationCancelled | GenerationFailure;

export type FailureCategory =
  | "INVALID_PARAMETERS"
  | "UNSUPPORTED_CONFIGURATION"
  | "INVALID_GEOMETRY"
  | "PROVEN_INFEASIBLE"
  | "SEARCH_EXHAUSTED"
  | "EXPORT_PRECISION_FAILURE";

export type ReasonCode =
  | "PARAM_N_NOT_POSITIVE_INTEGER"
  | "PARAM_MIN_AREA_NOT_POSITIVE"
  | "PARAM_MAX_AREA_BELOW_MIN"
  | "PARAM_WEB_WIDTH_NOT_POSITIVE"
  | "PARAM_MARGIN_BELOW_HALF_WEB"
  | "PARAM_NON_FINITE_VALUE"
  | "PARAM_UNKNOWN_QUALITY_PRESET"
  | "CFG_OFFSET_DOMAIN_MULTI_COMPONENT"
  | "CFG_PHYSICAL_UNIT_REQUIRED"
  | "CFG_EXPORT_GUARD_EXHAUSTS_AREA_INTERVAL"
  | "GEOM_OPEN_CONTOUR"
  | "GEOM_SELF_INTERSECTION"
  | "GEOM_ZERO_OR_NEGLIGIBLE_AREA"
  | "GEOM_NON_FINITE_COORDINATE"
  | "GEOM_KERNEL_CONTAINMENT_INVARIANT_FAILED"
  | "FEASIBLE_MIN_AREA_CAPACITY_EXCEEDED"
  | "FEASIBLE_USABLE_DOMAIN_EMPTY"
  | "FEASIBLE_TERRITORY_DOMAIN_EMPTY"
  | "FEASIBLE_SINGLE_POCKET_AREA_OUT_OF_RANGE"
  | "SEARCH_NO_VALID_INITIALIZATION"
  | "SEARCH_EMPTY_CELL_RECOVERY_EXHAUSTED"
  | "SEARCH_TOPOLOGY_INSTABILITY"
  | "SEARCH_AREA_INTERVAL_NOT_REACHED"
  | "SEARCH_BUDGET_EXHAUSTED"
  | "EXPORT_ROUNDTRIP_CELL_COUNT_CHANGED"
  | "EXPORT_ROUNDTRIP_OPEN_CONTOUR"
  | "EXPORT_ROUNDTRIP_AREA_OUT_OF_USER_INTERVAL"
  | "EXPORT_ROUNDTRIP_AREA_DELTA_EXCEEDED"
  | "EXPORT_ROUNDTRIP_CONTAINMENT_FAILED"
  | "EXPORT_ROUNDTRIP_OVERLAP_DETECTED"
  | "EXPORT_STRUCTURE_INVALID";

export interface GenerationFailure {
  readonly status: "failure";
  readonly category: FailureCategory;
  readonly reason: ReasonCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, number | string | boolean>>;
  readonly submittedParameters: GenerationParameters;
  readonly evaluations: number;
}

export interface GenerationProgress {
  readonly phase: "validating" | "initializing" | "balancing" | "searching" | "finalizing";
  readonly evaluations: number;
  readonly evaluationBudget: number;
  readonly bestHardViolationCount: number;
  readonly bestCost: number | null;
}

export interface GenerationControl {
  readonly isCancelled?: () => boolean;
  readonly onProgress?: (progress: GenerationProgress) => void;
}
