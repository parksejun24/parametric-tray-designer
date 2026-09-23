import type { CanonicalOutline, GenerationOutcome, GenerationParameters, GenerationProgress, GenerationRequest } from "../core/types";
import type { ImportedOutline } from "../io";
import type { OptimizerWorkerRequest, OptimizerWorkerResponse } from "../worker/protocol";

export interface GenerationJob {
  readonly id: string;
  readonly result: Promise<GenerationOutcome>;
  cancel(): void;
}

async function digestOutline(outline: ImportedOutline): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(outline.points));
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function canonicalOutline(outline: ImportedOutline): Promise<CanonicalOutline> {
  if (!outline.sourceToMm || !outline.sourceUnit) throw new Error("물리 단위를 먼저 확인해 주세요.");
  return {
    sourceFormat: outline.sourceFormat,
    sourceUnit: outline.sourceUnit,
    sourceToMm: outline.sourceToMm,
    outer: outline.points,
    boundsMm: outline.bounds,
    sourceDigest: await digestOutline(outline),
    flattenToleranceMm: 0.02,
  };
}

export function startGeneration(
  outline: ImportedOutline,
  parameters: GenerationParameters,
  onProgress: (progress: GenerationProgress) => void,
): GenerationJob {
  const id = crypto.randomUUID();
  let cancelled = false;
  let worker: Worker | null = null;
  let settleCancelled: (() => void) | null = null;
  const result = new Promise<GenerationOutcome>((resolve, reject) => {
    settleCancelled = () => resolve({ status: "cancelled", evaluations: 0 });
    void canonicalOutline(outline).then((canonical) => {
      if (cancelled) return settleCancelled?.();
      const request: GenerationRequest = { outline: canonical, parameters };
      worker = new Worker(new URL("../worker/optimizer.worker.ts", import.meta.url), { type: "module" });
      worker.addEventListener("message", (event: MessageEvent<OptimizerWorkerResponse>) => {
        const message = event.data;
        if (message.jobId !== id) return;
        if (message.type === "progress") onProgress(message.progress);
        else if (message.type === "result") {
          worker?.terminate();
          resolve(message.outcome);
        } else {
          worker?.terminate();
          reject(new Error(message.message));
        }
      });
      worker.addEventListener("error", (event) => {
        worker?.terminate();
        reject(new Error(event.message || "최적화 Worker를 실행하지 못했습니다."));
      });
      const message: OptimizerWorkerRequest = { type: "generate", jobId: id, request };
      worker.postMessage(message);
    }, reject);
  });
  return {
    id,
    result,
    cancel: () => {
      cancelled = true;
      if (worker) {
        const message: OptimizerWorkerRequest = { type: "cancel", jobId: id };
        worker.postMessage(message);
        worker.terminate();
      }
      settleCancelled?.();
    },
  };
}
