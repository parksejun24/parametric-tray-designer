import type { Point2 } from "../types";

export type Matrix2D = readonly [number, number, number, number, number, number];
export const IDENTITY: Matrix2D = [1, 0, 0, 1, 0, 0];

export function multiply(a: Matrix2D, b: Matrix2D): Matrix2D {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

export function transformPoint(matrix: Matrix2D, point: Point2): Point2 {
  return {
    x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
    y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
  };
}

export function maxSingularValue(matrix: Matrix2D): number {
  const [a, b, c, d] = matrix;
  const trace = a * a + b * b + c * c + d * d;
  const determinantSquared = (a * d - b * c) ** 2;
  const largestEigenvalue = (trace + Math.sqrt(Math.max(0, trace * trace - 4 * determinantSquared))) / 2;
  return Math.sqrt(Math.max(0, largestEigenvalue));
}

export function parseTransform(value: string | null): Matrix2D {
  if (!value) return IDENTITY;
  let result: Matrix2D = IDENTITY;
  const pattern = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  let consumedUntil = 0;
  while ((match = pattern.exec(value))) {
    if (value.slice(consumedUntil, match.index).replace(/[\s,]+/g, "") !== "") throw new Error("Malformed transform");
    const values = match[2]!.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (values.some((item) => !Number.isFinite(item))) throw new Error("Invalid transform");
    const kind = match[1]!.toLowerCase();
    let next: Matrix2D;
    if (kind === "matrix" && values.length === 6) next = values as unknown as Matrix2D;
    else if (kind === "translate" && values.length >= 1) next = [1, 0, 0, 1, values[0]!, values[1] ?? 0];
    else if (kind === "scale" && values.length >= 1) next = [values[0]!, 0, 0, values[1] ?? values[0]!, 0, 0];
    else if (kind === "rotate" && values.length >= 1) {
      const angle = (values[0]! * Math.PI) / 180;
      const rotation: Matrix2D = [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0];
      if (values.length >= 3) {
        const [cx, cy] = [values[1]!, values[2]!];
        next = multiply(multiply([1, 0, 0, 1, cx, cy], rotation), [1, 0, 0, 1, -cx, -cy]);
      } else next = rotation;
    } else if (kind === "skewx" && values.length === 1) next = [1, 0, Math.tan((values[0]! * Math.PI) / 180), 1, 0, 0];
    else if (kind === "skewy" && values.length === 1) next = [1, Math.tan((values[0]! * Math.PI) / 180), 0, 1, 0, 0];
    else throw new Error(`Unsupported transform: ${kind}`);
    result = multiply(result, next);
    consumedUntil = pattern.lastIndex;
  }
  if (value.slice(consumedUntil).replace(/[\s,]+/g, "") !== "") throw new Error("Malformed transform");
  return result;
}
