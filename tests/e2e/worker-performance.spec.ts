import { expect, test } from "@playwright/test";

const workerRequest = {
  outline: {
    sourceFormat: "dxf" as const,
    sourceUnit: "mm",
    sourceToMm: 1,
    outer: [{ x: 0, y: 0 }, { x: 900, y: 0 }, { x: 900, y: 120 }, { x: 0, y: 120 }],
    sourceDigest: "browser-worker-performance",
    flattenToleranceMm: 0.02,
  },
  parameters: {
    cellCount: 50,
    minPocketAreaMm2: 80,
    maxPocketAreaMm2: 2_000,
    seed: "browser-worker-performance",
    webWidthMm: 4,
    outerMarginMm: 6,
    qualityPreset: "extended" as const,
  },
  evaluationBudget: 384,
};

function rectangleDxf(width: number, height: number): string {
  return `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n8\nOUTER\n90\n4\n70\n1\n10\n0\n20\n0\n10\n${width}\n20\n0\n10\n${width}\n20\n${height}\n10\n0\n20\n${height}\n0\nENDSEC\n0\nEOF\n`;
}

test("acknowledges cancellation of a running module Worker within 500 ms", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "worker-cancel.dxf",
    mimeType: "application/dxf",
    buffer: Buffer.from(rectangleDxf(900, 120)),
  });
  await page.getByLabel("포켓 수").fill("50");
  await page.getByLabel("최소 면적").fill("80");
  await page.getByLabel("최대 면적").fill("2000");
  await page.getByLabel("품질").selectOption("extended");
  await page.getByRole("button", { name: /포켓 생성/ }).click();

  await expect(page.locator(".progress-card strong")).toHaveText(/형상 검증|초기 셀 배치|면적 균형|유기적 흐름 탐색|최종 형상 검증/, { timeout: 5_000 });
  const startedAt = performance.now();
  await page.getByRole("button", { name: "생성 취소" }).click();
  await expect(page.getByText("생성을 취소했습니다.")).toBeVisible({ timeout: 500 });
  const cancellationLatencyMs = performance.now() - startedAt;
  console.info(`WORKER_CANCEL_LATENCY ${JSON.stringify({ cancellationLatencyMs, limitMs: 500 })}`);
  expect(cancellationLatencyMs).toBeLessThan(500);
});

test("emits module Worker progress at intervals no greater than 250 ms", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async (request) => {
    const worker = new Worker(new URL("/src/worker/optimizer.worker.ts", window.location.origin), { type: "module" });
    const timestamps = [performance.now()];
    return await new Promise<{ gaps: number[]; progressCount: number }>((resolve, reject) => {
      worker.onerror = (event) => reject(new Error(event.message));
      worker.onmessage = (event) => {
        if (event.data.type === "progress") timestamps.push(performance.now());
        if (event.data.type === "error") reject(new Error(event.data.message));
        if (event.data.type === "result") {
          timestamps.push(performance.now());
          worker.terminate();
          resolve({
            gaps: timestamps.slice(1).map((timestamp, index) => timestamp - timestamps[index]!),
            progressCount: timestamps.length - 2,
          });
        }
      };
      worker.postMessage({ type: "generate", jobId: "progress-cadence", request });
    });
  }, workerRequest);

  console.info(`WORKER_PROGRESS_CADENCE ${JSON.stringify({ maxGapMs: Math.max(...result.gaps), progressCount: result.progressCount, limitMs: 250 })}`);
  expect(result.progressCount).toBeGreaterThanOrEqual(3);
  expect(Math.max(...result.gaps)).toBeLessThanOrEqual(250);
});

test("keeps optimization off the main thread without tasks over 50 ms", async ({ page }) => {
  await page.goto("/");
  const longTasks = await page.evaluate(async (request) => {
    const durations: number[] = [];
    const observer = new PerformanceObserver((list) => {
      durations.push(...list.getEntries().map((entry) => entry.duration));
    });
    observer.observe({ type: "longtask", buffered: false });
    const worker = new Worker(new URL("/src/worker/optimizer.worker.ts", window.location.origin), { type: "module" });
    await new Promise<void>((resolve, reject) => {
      worker.onerror = (event) => reject(new Error(event.message));
      worker.onmessage = (event) => {
        if (event.data.type === "error") reject(new Error(event.data.message));
        if (event.data.type === "result") resolve();
      };
      worker.postMessage({ type: "generate", jobId: "long-task-probe", request });
    });
    worker.terminate();
    await new Promise((resolve) => setTimeout(resolve, 0));
    observer.disconnect();
    return durations;
  }, workerRequest);

  console.info(`WORKER_LONG_TASKS ${JSON.stringify({ durations: longTasks, limitMs: 50 })}`);
  expect(longTasks.filter((duration) => duration > 50)).toEqual([]);
});

test("parses and previews a 5,000-point outline with p95 below 500 ms", async ({ page }) => {
  await page.goto("/");
  const points = Array.from({ length: 5_000 }, (_, index) => {
    const angle = 2 * Math.PI * index / 5_000;
    return `${(100 + 90 * Math.cos(angle)).toFixed(6)},${(100 + 90 * Math.sin(angle)).toFixed(6)}`;
  }).join(" ");
  const samples: number[] = [];

  for (let index = 0; index < 20; index += 1) {
    const name = `parse-${index}.svg`;
    const startedAt = performance.now();
    await page.locator('input[type="file"]').setInputFiles({
      name,
      mimeType: "image/svg+xml",
      buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="200mm" viewBox="0 0 200 200"><polygon points="${points}" /></svg>`),
    });
    await expect(page.getByText(name)).toBeVisible();
    await expect(page.getByText(/5,000 points · SVG/)).toBeVisible();
    samples.push(performance.now() - startedAt);
  }

  samples.sort((a, b) => a - b);
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1]!;
  console.info(`PARSE_PREVIEW_P95 ${JSON.stringify({ points: 5_000, p95, samples: samples.length, limitMs: 500 })}`);
  expect(p95).toBeLessThan(500);
});
