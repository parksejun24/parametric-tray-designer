// @vitest-environment node

import { describe, expect, it } from "vitest";

import { isOptimizerWorkerRequest } from "../../src/worker/protocol";

describe("worker structured-clone boundary", () => {
  it("retains a cancellation message through structured cloning", () => {
    const message = structuredClone({ type: "cancel", jobId: "browser-job" });

    expect(isOptimizerWorkerRequest(message)).toBe(true);
  });
});
