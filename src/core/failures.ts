import type {
  FailureCategory,
  GenerationFailure,
  GenerationParameters,
  ReasonCode,
} from "./types";

export function failure(
  parameters: GenerationParameters,
  category: FailureCategory,
  reason: ReasonCode,
  message: string,
  evaluations = 0,
  details?: Readonly<Record<string, number | string | boolean>>,
): GenerationFailure {
  return {
    status: "failure",
    category,
    reason,
    message,
    submittedParameters: { ...parameters },
    evaluations,
    ...(details ? { details } : {}),
  };
}

export function validateParameters(parameters: GenerationParameters): GenerationFailure | null {
  const numeric = [
    parameters.cellCount,
    parameters.minPocketAreaMm2,
    parameters.maxPocketAreaMm2,
    parameters.webWidthMm,
    parameters.outerMarginMm,
  ];
  if (!numeric.every(Number.isFinite)) {
    return failure(parameters, "INVALID_PARAMETERS", "PARAM_NON_FINITE_VALUE", "모든 수치 파라미터는 유한한 값이어야 합니다.");
  }
  if (!Number.isInteger(parameters.cellCount) || parameters.cellCount <= 0) {
    return failure(parameters, "INVALID_PARAMETERS", "PARAM_N_NOT_POSITIVE_INTEGER", "셀 개수는 양의 정수여야 합니다.");
  }
  if (parameters.minPocketAreaMm2 <= 0) {
    return failure(parameters, "INVALID_PARAMETERS", "PARAM_MIN_AREA_NOT_POSITIVE", "최소 포켓 면적은 0보다 커야 합니다.");
  }
  if (parameters.maxPocketAreaMm2 < parameters.minPocketAreaMm2) {
    return failure(parameters, "INVALID_PARAMETERS", "PARAM_MAX_AREA_BELOW_MIN", "최대 포켓 면적은 최소 포켓 면적보다 작을 수 없습니다.");
  }
  if (parameters.webWidthMm <= 0) {
    return failure(parameters, "INVALID_PARAMETERS", "PARAM_WEB_WIDTH_NOT_POSITIVE", "웹 폭은 0보다 커야 합니다.");
  }
  if (parameters.outerMarginMm < parameters.webWidthMm / 2) {
    return failure(parameters, "INVALID_PARAMETERS", "PARAM_MARGIN_BELOW_HALF_WEB", "외곽 여백은 웹 폭의 절반 이상이어야 합니다.");
  }
  if (!(["draft", "standard", "extended"] as const).includes(parameters.qualityPreset)) {
    return failure(parameters, "INVALID_PARAMETERS", "PARAM_UNKNOWN_QUALITY_PRESET", "알 수 없는 품질 프리셋입니다.");
  }
  return null;
}
