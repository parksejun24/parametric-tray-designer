import type { Point2 } from "../types";

export interface ExportPocket {
  readonly id: string;
  readonly points: readonly Point2[];
}

export interface DxfExportInput {
  readonly outline: readonly Point2[];
  readonly pockets: readonly ExportPocket[];
  readonly precision?: number;
}

function pair(code: number, value: string | number): string {
  return `${code}\n${value}\n`;
}

function polyline(layer: string, points: readonly Point2[], precision: number): string {
  let text = pair(0, "LWPOLYLINE") + pair(100, "AcDbEntity") + pair(8, layer) + pair(100, "AcDbPolyline");
  text += pair(90, points.length) + pair(70, 1);
  for (const point of points) text += pair(10, point.x.toFixed(precision)) + pair(20, point.y.toFixed(precision));
  return text;
}

export function exportDxf(input: DxfExportInput): string {
  const precision = Math.max(3, Math.min(9, input.precision ?? 6));
  let text = pair(0, "SECTION") + pair(2, "HEADER") + pair(9, "$ACADVER") + pair(1, "AC1015") + pair(9, "$INSUNITS") + pair(70, 4) + pair(0, "ENDSEC");
  text += pair(0, "SECTION") + pair(2, "ENTITIES");
  text += polyline("OUTLINE", input.outline, precision);
  for (const pocket of [...input.pockets].sort((a, b) => a.id.localeCompare(b.id))) text += polyline("POCKET", pocket.points, precision);
  text += pair(0, "ENDSEC") + pair(0, "EOF");
  return text;
}
