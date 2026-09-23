// @vitest-environment node

import { describe, expect, it } from "vitest";

import { isOptimizerWorkerRequest } from "../../src/worker/protocol";

describe("isOptimizerWorkerRequest", () => {
  it("accepts a cancellation message with a job ID", () => {
    expect(isOptimizerWorkerRequest({ type: "cancel", jobId: "job-1" })).toBe(true);
  });

  it("accepts a generation message with a request payload", () => {
    expect(isOptimizerWorkerRequest({ type: "generate", jobId: "job-1", request: {} })).toBe(true);
  });

  it("rejects a message without a job ID", () => {
    expect(isOptimizerWorkerRequest({ type: "cancel" })).toBe(false);
  });

  it("rejects an unknown message type", () => {
    expect(isOptimizerWorkerRequest({ type: "finish", jobId: "job-1" })).toBe(false);
  });

  it("rejects a generation message with a null request", () => {
    expect(isOptimizerWorkerRequest({ type: "generate", jobId: "job-1", request: null })).toBe(false);
  });
});
