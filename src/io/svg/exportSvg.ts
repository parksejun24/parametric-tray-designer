import type { Point2 } from "../types";
import type { ExportPocket } from "../dxf/exportDxf";

export interface SvgExportInput {
  readonly outline: readonly Point2[];
  readonly pockets: readonly ExportPocket[];
  readonly paddingMm?: number;
}

function path(points: readonly Point2[]): string {
  return `${points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(4)} ${point.y.toFixed(4)}`).join(" ")} Z`;
}

export function exportSvg(input: SvgExportInput): string {
  const allPoints = [input.outline, ...input.pockets.map((pocket) => pocket.points)].flat();
  const minX = Math.min(...allPoints.map((point) => point.x));
  const minY = Math.min(...allPoints.map((point) => point.y));
  const maxX = Math.max(...allPoints.map((point) => point.x));
  const maxY = Math.max(...allPoints.map((point) => point.y));
  const padding = input.paddingMm ?? 2;
  const viewBox = `${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`;
  const pockets = [...input.pockets]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((pocket) => `  <path id="${pocket.id.replace(/[^a-zA-Z0-9_-]/g, "-")}" d="${path(pocket.points)}" />`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${(maxX - minX).toFixed(4)}mm" height="${(maxY - minY).toFixed(4)}mm">\n  <g id="outline" fill="none" stroke="#161711"><path d="${path(input.outline)}" /></g>\n  <g id="pockets" fill="none" stroke="#161711">\n${pockets}\n  </g>\n</svg>\n`;
}
