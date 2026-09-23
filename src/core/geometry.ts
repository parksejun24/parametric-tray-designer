import type { Bounds, Polygon, Ring, Vec2 } from "./types";

const EPS = 1e-10;

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (v: Vec2, k: number): Vec2 => ({ x: v.x * k, y: v.y * k });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const length = (v: Vec2): number => Math.hypot(v.x, v.y);
export const distanceSquared = (a: Vec2, b: Vec2): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

export function signedArea(ring: Ring): number {
  let twiceArea = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    twiceArea += a.x * b.y - b.x * a.y;
  }
  return twiceArea / 2;
}

export function area(ring: Ring): number {
  return Math.abs(signedArea(ring));
}

export function bounds(ring: Ring): Bounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of ring) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY };
}

export function perimeter(ring: Ring): number {
  let result = 0;
  for (let i = 0; i < ring.length; i += 1) {
    result += Math.sqrt(distanceSquared(ring[i]!, ring[(i + 1) % ring.length]!));
  }
  return result;
}

export function centroid(ring: Ring): Vec2 {
  let crossSum = 0;
  let xSum = 0;
  let ySum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const c = a.x * b.y - b.x * a.y;
    crossSum += c;
    xSum += (a.x + b.x) * c;
    ySum += (a.y + b.y) * c;
  }
  if (Math.abs(crossSum) <= EPS) {
    const total = ring.reduce((acc, point) => add(acc, point), { x: 0, y: 0 });
    return scale(total, 1 / Math.max(1, ring.length));
  }
  return { x: xSum / (3 * crossSum), y: ySum / (3 * crossSum) };
}

function pointOnSegment(point: Vec2, a: Vec2, b: Vec2, epsilon: number): boolean {
  const ab = sub(b, a);
  const ap = sub(point, a);
  if (Math.abs(cross(ab, ap)) > epsilon * Math.max(1, length(ab))) return false;
  return dot(ap, sub(point, b)) <= epsilon;
}

export function pointInRing(point: Vec2, ring: Ring, includeBoundary = true, epsilon = EPS): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[j]!;
    const b = ring[i]!;
    if (pointOnSegment(point, a, b, epsilon)) return includeBoundary;
    const intersects = (a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function orientation(a: Vec2, b: Vec2, c: Vec2): number {
  return cross(sub(b, a), sub(c, a));
}

function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2, epsilon: number): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (((o1 > epsilon && o2 < -epsilon) || (o1 < -epsilon && o2 > epsilon))
    && ((o3 > epsilon && o4 < -epsilon) || (o3 < -epsilon && o4 > epsilon))) return true;
  return (Math.abs(o1) <= epsilon && pointOnSegment(c, a, b, epsilon))
    || (Math.abs(o2) <= epsilon && pointOnSegment(d, a, b, epsilon))
    || (Math.abs(o3) <= epsilon && pointOnSegment(a, c, d, epsilon))
    || (Math.abs(o4) <= epsilon && pointOnSegment(b, c, d, epsilon));
}

export function isSimpleRing(ring: Ring, epsilon = EPS): boolean {
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    for (let j = i + 1; j < ring.length; j += 1) {
      if (j === i || j === (i + 1) % ring.length || (j + 1) % ring.length === i) continue;
      if (segmentsIntersect(a, b, ring[j]!, ring[(j + 1) % ring.length]!, epsilon)) return false;
    }
  }
  return true;
}

export function normalizeRing(input: Ring, epsilon = 1e-8): Ring {
  const finite = input.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const open = finite.length > 1 && distanceSquared(finite[0]!, finite[finite.length - 1]!) <= epsilon ** 2
    ? finite.slice(0, -1)
    : [...finite];
  const unique: Vec2[] = [];
  for (const point of open) {
    if (unique.length === 0 || distanceSquared(point, unique[unique.length - 1]!) > epsilon ** 2) unique.push({ ...point });
  }
  let changed = true;
  while (changed && unique.length >= 3) {
    changed = false;
    for (let i = 0; i < unique.length; i += 1) {
      const previous = unique[(i + unique.length - 1) % unique.length]!;
      const current = unique[i]!;
      const next = unique[(i + 1) % unique.length]!;
      if (Math.abs(cross(sub(current, previous), sub(next, current))) <= epsilon
        && dot(sub(current, previous), sub(next, current)) >= -epsilon) {
        unique.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  if (signedArea(unique) < 0) unique.reverse();
  return unique;
}

export function clipRingToHalfPlane(ring: Ring, normal: Vec2, limit: number, epsilon = EPS): Ring {
  if (ring.length === 0) return [];
  const output: Vec2[] = [];
  for (let i = 0; i < ring.length; i += 1) {
    const start = ring[i]!;
    const end = ring[(i + 1) % ring.length]!;
    const startValue = dot(normal, start) - limit;
    const endValue = dot(normal, end) - limit;
    const startInside = startValue <= epsilon;
    const endInside = endValue <= epsilon;
    if (startInside) output.push(start);
    if (startInside !== endInside) {
      const denominator = startValue - endValue;
      if (Math.abs(denominator) > epsilon) {
        const t = startValue / denominator;
        output.push({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t });
      }
    }
  }
  return normalizeRing(output, epsilon);
}

export function containsRing(container: Ring, candidate: Ring, epsilon = 1e-7): boolean {
  // Sampling each candidate edge avoids treating quantized, nearly coincident
  // offset boundaries as a crossing while still detecting excursions through a
  // concave notch whose endpoints alone happen to lie inside.
  return candidate.every((point, index) => {
    const next = candidate[(index + 1) % candidate.length]!;
    return [0, 0.25, 0.5, 0.75].every((t) => pointInRing({
      x: point.x + (next.x - point.x) * t,
      y: point.y + (next.y - point.y) * t,
    }, container, true, epsilon));
  });
}

export function ringsOverlapAtInterior(a: Ring, b: Ring, epsilon = 1e-7, containmentMode = false): boolean {
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      const a0 = a[i]!;
      const a1 = a[(i + 1) % a.length]!;
      const b0 = b[j]!;
      const b1 = b[(j + 1) % b.length]!;
      const o1 = orientation(a0, a1, b0);
      const o2 = orientation(a0, a1, b1);
      const o3 = orientation(b0, b1, a0);
      const o4 = orientation(b0, b1, a1);
      if (((o1 > epsilon && o2 < -epsilon) || (o1 < -epsilon && o2 > epsilon))
        && ((o3 > epsilon && o4 < -epsilon) || (o3 < -epsilon && o4 > epsilon))) return true;
    }
  }
  if (containmentMode) return false;
  const probes = (ring: Ring): Vec2[] => ring.flatMap((point, index) => {
    const next = ring[(index + 1) % ring.length]!;
    return [point, { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 }];
  });
  return probes(a).some((point) => pointInRing(point, b, false))
    || probes(b).some((point) => pointInRing(point, a, false));
}

export function covarianceAxis(ring: Ring): { axis: Vec2 | null; aspectRatio: number | null; confidence: number } {
  const center = centroid(ring);
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const point of ring) {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  }
  const count = Math.max(1, ring.length);
  xx /= count;
  xy /= count;
  yy /= count;
  const trace = xx + yy;
  const discriminant = Math.sqrt(Math.max(0, (xx - yy) ** 2 + 4 * xy ** 2));
  const major = (trace + discriminant) / 2;
  const minor = (trace - discriminant) / 2;
  if (major <= EPS) return { axis: null, aspectRatio: null, confidence: 0 };
  const confidence = discriminant / (trace + EPS);
  if (confidence < 0.05) return { axis: null, aspectRatio: 1, confidence };
  const axis = Math.abs(xy) > EPS
    ? { x: major - yy, y: xy }
    : (xx >= yy ? { x: 1, y: 0 } : { x: 0, y: 1 });
  const axisLength = length(axis);
  return {
    axis: axisLength > EPS ? scale(axis, 1 / axisLength) : null,
    aspectRatio: Math.sqrt(major / Math.max(minor, EPS)),
    confidence,
  };
}

export function asPolygon(outer: Ring): Polygon {
  return { outer, holes: [] };
}
