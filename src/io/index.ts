import { importDxf } from "./dxf/importDxf";
import { importSvg } from "./svg/importSvg";
import { boundsOf, type ImportedOutline } from "./types";

export * from "./dxf/exportDxf";
export * from "./svg/exportSvg";
export * from "./types";

export async function importOutline(file: File): Promise<ImportedOutline> {
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  const text = await file.text();
  if (extension === "svg" || file.type === "image/svg+xml") return importSvg(text, file.name);
  if (extension === "dxf" || file.type === "application/dxf") return importDxf(text, file.name);
  throw new Error("SVG 또는 DXF 파일만 불러올 수 있습니다.");
}

export function confirmScale(outline: ImportedOutline, millimetresPerUnit: number): ImportedOutline {
  if (!Number.isFinite(millimetresPerUnit) || millimetresPerUnit <= 0) throw new Error("배율은 0보다 큰 숫자여야 합니다.");
  const points = outline.points.map((point) => ({ x: point.x * millimetresPerUnit, y: point.y * millimetresPerUnit }));
  const bounds = boundsOf(points);
  return {
    ...outline,
    sourceUnit: "user-unit",
    sourceToMm: millimetresPerUnit,
    points,
    bounds,
    physicalWidthMm: bounds.maxX - bounds.minX,
    physicalHeightMm: bounds.maxY - bounds.minY,
    warnings: [],
  };
}
