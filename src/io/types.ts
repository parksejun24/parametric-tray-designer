export interface Point2 {
  readonly x: number;
  readonly y: number;
}

export interface Bounds2 {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export type SourceFormat = "svg" | "dxf";

export interface ImportedOutline {
  readonly sourceFormat: SourceFormat;
  readonly sourceName: string;
  readonly sourceUnit: string | null;
  readonly sourceToMm: number | null;
  readonly points: readonly Point2[];
  readonly bounds: Bounds2;
  readonly physicalWidthMm: number | null;
  readonly physicalHeightMm: number | null;
  readonly warnings: readonly string[];
}

export class ImportError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ImportError";
  }
}

export function boundsOf(points: readonly Point2[]): Bounds2 {
  if (points.length === 0) {
    throw new ImportError("GEOM_ZERO_OR_NEGLIGIBLE_AREA", "외곽선에 좌표가 없습니다.");
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new ImportError("GEOM_NON_FINITE_COORDINATE", "외곽선에 유효하지 않은 좌표가 있습니다.");
    }
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY };
}

export function signedArea(points: readonly Point2[]): number {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function normalizeRing(points: readonly Point2[]): readonly Point2[] {
  const clean: Point2[] = [];
  for (const point of points) {
    const previous = clean.at(-1);
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 1e-9) {
      clean.push(point);
    }
  }
  if (clean.length > 1) {
    const first = clean[0]!;
    const last = clean.at(-1)!;
    if (Math.hypot(first.x - last.x, first.y - last.y) <= 1e-9) clean.pop();
  }
  let changed = true;
  while (changed && clean.length >= 3) {
    changed = false;
    for (let index = 0; index < clean.length; index += 1) {
      const previous = clean[(index - 1 + clean.length) % clean.length]!;
      const current = clean[index]!;
      const next = clean[(index + 1) % clean.length]!;
      const cross = (current.x - previous.x) * (next.y - current.y) - (current.y - previous.y) * (next.x - current.x);
      const scale = Math.max(1, Math.hypot(current.x - previous.x, current.y - previous.y), Math.hypot(next.x - current.x, next.y - current.y));
      if (Math.abs(cross) <= 1e-10 * scale * scale) {
        clean.splice(index, 1);
        changed = true;
        break;
      }
    }
  }
  if (clean.length < 3 || Math.abs(signedArea(clean)) <= 1e-9) {
    throw new ImportError("GEOM_ZERO_OR_NEGLIGIBLE_AREA", "외곽선의 유효 면적이 없습니다.");
  }
  return signedArea(clean) > 0 ? clean : [...clean].reverse();
}
