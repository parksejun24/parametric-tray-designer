import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";

const examples = [
  "01-soft-rectangle.svg",
  "02-capsule.svg",
  "03-wide-ellipse.svg",
  "04-slanted-trapezoid.svg",
  "05-tapered-hexagon.svg",
  "06-chamfered-octagon.svg",
  "07-l-corner.svg",
  "08-u-channel.svg",
  "09-t-silhouette.svg",
  "10-deep-v-notch.svg",
  "11-double-notch.svg",
  "12-wave-top.svg",
  "13-organic-bean.svg",
  "14-asymmetric-pebble.svg",
  "15-hourglass.svg",
  "16-wide-cross.svg",
  "17-crescent-bay.svg",
  "18-kidney-curve.svg",
  "19-cog-outline.svg",
  "20-starburst.svg",
] as const;

const seedOverrides: Partial<Record<(typeof examples)[number], string>> = {
  "07-l-corner.svg": "formfield-01",
  "10-deep-v-notch.svg": "formfield-01",
};

for (const filename of examples) {
  test(`imports, partitions, and enables export for ${filename}`, async ({ page }) => {
    const path = fileURLToPath(new URL(`../../examples/${filename}`, import.meta.url));
    await page.goto("/");
    await page.locator('input[type="file"]').setInputFiles(path);
    await expect(page.getByText(filename).first()).toBeVisible();
    await page.getByLabel("포켓 수").fill("3");
    await page.getByLabel("최소 면적").fill("100");
    await page.getByLabel("최대 면적").fill("50000");
    await page.getByLabel("품질").selectOption("extended");
    await page
      .getByLabel("재현 시드")
      .fill(seedOverrides[filename] ?? `examples-${filename}`);

    await page.getByRole("button", { name: /포켓 생성/ }).click();

    await expect(page.getByText("VALIDATED")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".drawing .pocket")).toHaveCount(3);
    await expect(page.getByRole("button", { name: /DXF 내려받기/ })).toBeEnabled();
    await expect(page.getByRole("button", { name: "SVG 내려받기" })).toBeEnabled();
  });
}
