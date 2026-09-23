// @vitest-environment node

import { describe, expect, it } from "vitest";

import { validateParameters } from "../../src/core/failures";
import type { GenerationParameters, ReasonCode } from "../../src/core/types";

const validParameters: GenerationParameters = {
  cellCount: 5,
  minPocketAreaMm2: 100,
  maxPocketAreaMm2: 300,
  seed: "validation-seed",
  webWidthMm: 4,
  outerMarginMm: 6,
  qualityPreset: "standard",
};

function expectReason(
  overrides: Partial<GenerationParameters>,
  expectedReason: ReasonCode,
): void {
  const parameters = { ...validParameters, ...overrides };
  const result = validateParameters(parameters);

  expect(result?.category).toBe("INVALID_PARAMETERS");
  expect(result?.reason).toBe(expectedReason);
}

describe("validateParameters", () => {
  it("accepts a complete valid parameter set", () => {
    expect(validateParameters(validParameters)).toBeNull();
  });

  it.each([0, -1, 1.5])("rejects non-positive or fractional cell count %s", (cellCount) => {
    expectReason({ cellCount }, "PARAM_N_NOT_POSITIVE_INTEGER");
  });

  it("rejects a non-positive minimum pocket area", () => {
    expectReason({ minPocketAreaMm2: 0 }, "PARAM_MIN_AREA_NOT_POSITIVE");
  });

  it("rejects a maximum pocket area below the minimum", () => {
    expectReason(
      { minPocketAreaMm2: 200, maxPocketAreaMm2: 199 },
      "PARAM_MAX_AREA_BELOW_MIN",
    );
  });

  it("rejects a non-positive web width", () => {
    expectReason({ webWidthMm: 0 }, "PARAM_WEB_WIDTH_NOT_POSITIVE");
  });

  it("rejects an outer margin below half the web width", () => {
    expectReason({ webWidthMm: 6, outerMarginMm: 2.99 }, "PARAM_MARGIN_BELOW_HALF_WEB");
  });

  it.each([
    { cellCount: Number.NaN },
    { minPocketAreaMm2: Number.POSITIVE_INFINITY },
    { maxPocketAreaMm2: Number.NEGATIVE_INFINITY },
    { webWidthMm: Number.NaN },
    { outerMarginMm: Number.POSITIVE_INFINITY },
  ])("rejects non-finite numeric input $key", (overrides) => {
    expectReason(overrides, "PARAM_NON_FINITE_VALUE");
  });

  it("rejects an unknown quality preset", () => {
    expectReason(
      { qualityPreset: "ultra" as GenerationParameters["qualityPreset"] },
      "PARAM_UNKNOWN_QUALITY_PRESET",
    );
  });

  it("preserves submitted parameters in a failure", () => {
    const submitted = { ...validParameters, cellCount: 0 };

    const result = validateParameters(submitted);

    expect(result?.submittedParameters).toEqual(submitted);
    expect(result?.submittedParameters).not.toBe(submitted);
  });
});
