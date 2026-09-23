import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const rectangleSvg = fileURLToPath(new URL("../fixtures/svg/rectangle-mm.svg", import.meta.url));
const rectangleDxf = fileURLToPath(new URL("../fixtures/dxf/rectangle-mm.dxf", import.meta.url));
const knownGoodSvg = fileURLToPath(new URL("../../examples/known-good-rectangle.svg", import.meta.url));
const vectorExampleSvg = fileURLToPath(new URL("../../examples/Vector 1.svg", import.meta.url));
const ellipseExampleSvg = fileURLToPath(new URL("../../examples/Ellipse 1.svg", import.meta.url));

function independentlyParsePolylines(text: string): readonly { layer: string; closed: boolean; points: readonly { x: number; y: number }[] }[] {
  const lines = text.replace(/\r/g, "").trimEnd().split("\n");
  const pairs = Array.from({ length: Math.floor(lines.length / 2) }, (_, index) => ({
    code: Number(lines[index * 2]!.trim()),
    value: lines[index * 2 + 1]!.trim(),
  }));
  const output: { layer: string; closed: boolean; points: { x: number; y: number }[] }[] = [];
  for (let cursor = 0; cursor < pairs.length; cursor += 1) {
    if (pairs[cursor]!.code !== 0 || pairs[cursor]!.value !== "LWPOLYLINE") continue;
    let end = cursor + 1;
    while (end < pairs.length && pairs[end]!.code !== 0) end += 1;
    const entity = pairs.slice(cursor + 1, end);
    const points: { x: number; y: number }[] = [];
    for (let index = 0; index < entity.length; index += 1) {
      if (entity[index]!.code !== 10) continue;
      const y = entity.slice(index + 1).find((pair) => pair.code === 20);
      points.push({ x: Number(entity[index]!.value), y: Number(y?.value) });
    }
    output.push({
      layer: entity.find((pair) => pair.code === 8)?.value ?? "",
      closed: (Number(entity.find((pair) => pair.code === 70)?.value) & 1) === 1,
      points,
    });
  }
  return output;
}

function polygonArea(points: readonly { x: number; y: number }[]): number {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]!;
    return sum + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
}

test("keeps export disabled before a result has been validated", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("button", { name: /DXF 내려받기/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: "SVG 내려받기" })).toBeDisabled();
});

test("imports a physical-unit SVG and enables generation", async ({ page }) => {
  await page.goto("/");

  await page.locator('input[type="file"]').setInputFiles(rectangleSvg);

  await expect(page.getByText("rectangle-mm.svg").first()).toBeVisible();
  await expect(page.getByText("단위 확인됨")).toBeVisible();
  await expect(page.getByRole("button", { name: /포켓 생성/ })).toBeEnabled();
});

test("generates one validated pocket from an SVG outline", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(rectangleSvg);
  await page.getByLabel("포켓 수").fill("1");
  await page.getByLabel("최소 면적").fill("100");
  await page.getByLabel("최대 면적").fill("5000");

  await page.getByRole("button", { name: /포켓 생성/ }).click();

  await expect(page.getByText("VALIDATED")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /DXF 내려받기/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: "SVG 내려받기" })).toBeEnabled();
});

test("generates the documented three-pocket known-good SVG", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(knownGoodSvg);
  await page.getByLabel("포켓 수").fill("3");
  await page.getByLabel("최소 면적").fill("300");
  await page.getByLabel("최대 면적").fill("5000");
  await page.getByLabel("품질").selectOption("extended");
  await page.getByLabel("재현 시드").fill("known-good-rectangle");

  await page.getByRole("button", { name: /포켓 생성/ }).click();

  await expect(page.getByText("VALIDATED")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".drawing .pocket")).toHaveCount(3);
  await expect(page.getByRole("button", { name: /DXF 내려받기/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: "SVG 내려받기" })).toBeEnabled();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /DXF 내려받기/ }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  const dxf = await readFile(downloadPath!, "utf8");
  const areas = independentlyParsePolylines(dxf)
    .filter((polyline) => polyline.layer === "POCKET")
    .map((polyline) => polygonArea(polyline.points));
  console.info(`KNOWN_GOOD_AREAS ${JSON.stringify(areas)}`);
  expect(areas).toHaveLength(3);
  expect(areas.every((area) => area >= 300 && area <= 5_000)).toBe(true);
});

test("generates six validated pockets from the unitless Vector 1.svg example", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(vectorExampleSvg);
  await expect(page.getByLabel("1 도면 단위는 몇 mm인가요?")).toHaveValue("1");
  await page.getByRole("button", { name: "배율 적용" }).click();
  await expect(page.getByText("315.0 × 189.0 mm")).toBeVisible();

  await page.getByLabel("포켓 수").fill("6");
  await page.getByLabel("최소 면적").fill("900");
  await page.getByLabel("최대 면적").fill("10000");
  await page.getByLabel("품질").selectOption("extended");
  await page.getByLabel("재현 시드").fill("formfield-01");

  await page.getByRole("button", { name: /포켓 생성/ }).click();

  await expect(page.getByText("VALIDATED")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".drawing .pocket")).toHaveCount(6);
  await expect(page.getByRole("button", { name: /DXF 내려받기/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: "SVG 내려받기" })).toBeEnabled();
});

test("generates exportable pockets from the unitless Ellipse 1.svg example", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(ellipseExampleSvg);
  await expect(page.getByLabel("1 도면 단위는 몇 mm인가요?")).toHaveValue("1");
  await page.getByRole("button", { name: "배율 적용" }).click();
  await expect(page.getByText("386.0 × 125.0 mm")).toBeVisible();

  await page.getByLabel("포켓 수").fill("6");
  await page.getByLabel("최소 면적").fill("900");
  await page.getByLabel("최대 면적").fill("10000");
  await page.getByLabel("품질").selectOption("extended");
  await page.getByLabel("재현 시드").fill("formfield-01");
  await page.getByRole("button", { name: /포켓 생성/ }).click();

  await expect(page.getByText("VALIDATED")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".drawing .pocket")).toHaveCount(6);
  await expect(page.getByRole("button", { name: /DXF 내려받기/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: "SVG 내려받기" })).toBeEnabled();
});

test("imports DXF and exports independently readable DXF and SVG geometry", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(rectangleDxf);
  await page.getByLabel("포켓 수").fill("1");
  await page.getByLabel("최소 면적").fill("100");
  await page.getByLabel("최대 면적").fill("5000");
  await page.getByRole("button", { name: /포켓 생성/ }).click();
  await expect(page.getByText("VALIDATED")).toBeVisible({ timeout: 15_000 });

  const dxfDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /DXF 내려받기/ }).click();
  const dxfDownload = await dxfDownloadPromise;
  const dxfPath = await dxfDownload.path();
  expect(dxfPath).not.toBeNull();
  const dxf = await readFile(dxfPath!, "utf8");

  const svgDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "SVG 내려받기" }).click();
  const svgDownload = await svgDownloadPromise;
  const svgPath = await svgDownload.path();
  expect(svgPath).not.toBeNull();
  const svg = await readFile(svgPath!, "utf8");

  expect(dxfDownload.suggestedFilename()).toMatch(/^tray-[a-f0-9]{10}\.dxf$/);
  expect(svgDownload.suggestedFilename()).toMatch(/^tray-[a-f0-9]{10}\.svg$/);
  expect(dxf).toContain("9\n$INSUNITS\n70\n4\n");
  const polylines = independentlyParsePolylines(dxf);
  expect(polylines.filter((polyline) => polyline.layer === "OUTLINE")).toHaveLength(1);
  const pockets = polylines.filter((polyline) => polyline.layer === "POCKET");
  expect(pockets).toHaveLength(1);
  expect(polylines.every((polyline) => polyline.closed && polyline.points.length >= 3)).toBe(true);
  expect(polylines.every((polyline) => polyline.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)))).toBe(true);
  expect(polygonArea(pockets[0]!.points)).toBeGreaterThanOrEqual(100);
  expect(polygonArea(pockets[0]!.points)).toBeLessThanOrEqual(5_000);
  expect(dxf.endsWith("0\nEOF\n")).toBe(true);
  expect(svg.match(/<path\b/g)).toHaveLength(2);
  expect(svg).toContain('id="cell-001"');
});
