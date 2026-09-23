import type { GenerationOutcome, GenerationProgress, GenerationRequest } from "../core";

export type OptimizerWorkerRequest =
  | Readonly<{ type: "generate"; jobId: string; request: GenerationRequest }>
  | Readonly<{ type: "cancel"; jobId: string }>;

export type OptimizerWorkerResponse =
  | Readonly<{ type: "progress"; jobId: string; progress: GenerationProgress }>
  | Readonly<{ type: "result"; jobId: string; outcome: GenerationOutcome }>
  | Readonly<{ type: "error"; jobId: string; message: string }>;

export function isOptimizerWorkerRequest(value: unknown): value is OptimizerWorkerRequest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OptimizerWorkerRequest>;
  if (typeof candidate.jobId !== "string" || candidate.jobId.length === 0) return false;
  if (candidate.type === "cancel") return true;
  if (candidate.type !== "generate" || !("request" in candidate)) return false;
  const request = candidate.request;
  return !!request && typeof request === "object";
}
