/// <reference lib="webworker" />

import { generateTray } from "../core";
import { isOptimizerWorkerRequest, type OptimizerWorkerResponse } from "./protocol";

const cancelledJobs = new Set<string>();

function post(response: OptimizerWorkerResponse): void {
  self.postMessage(response);
}

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (!isOptimizerWorkerRequest(event.data)) return;
  const message = event.data;
  if (message.type === "cancel") {
    cancelledJobs.add(message.jobId);
    return;
  }

  cancelledJobs.delete(message.jobId);
  try {
    const outcome = generateTray(message.request, {
      isCancelled: () => cancelledJobs.has(message.jobId),
      onProgress: (progress) => post({ type: "progress", jobId: message.jobId, progress }),
    });
    post({ type: "result", jobId: message.jobId, outcome });
  } catch (error) {
    post({
      type: "error",
      jobId: message.jobId,
      message: error instanceof Error ? error.message : "Unknown optimizer error",
    });
  } finally {
    cancelledJobs.delete(message.jobId);
  }
});

export {};
