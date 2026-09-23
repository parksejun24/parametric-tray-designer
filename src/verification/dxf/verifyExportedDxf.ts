import type { GenerationSuccess, Ring, Vec2 } from "../../core/types";

export interface ExportVerification {
  readonly ok: boolean;
  readonly reason?: string;
  readonly message?: string;
}

interface ParsedPolyline {
  readonly layer: string;
  readonly points: Ring;
  readonly closed: boolean;
}

function area(ring: Ring): number {
  let twice = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index]!;
    const b = ring[(index + 1) % ring.length]!;
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

function pointInRing(point: Vec2, ring: Ring): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const a = ring[index]!;
    const b = ring[previous]!;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function pointOnSegment(point: Vec2, a: Vec2, b: Vec2, tolerance = 1e-8): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= tolerance * tolerance) return Math.hypot(point.x - a.x, point.y - a.y) <= tolerance;
  // At acute offset corners the same quantized vertex may differ by a few
  // floating-point ulps after DXF parsing. Accept endpoints directly before
  // using a projection whose round-off can place them infinitesimally outside
  // [0, 1].
  if (Math.hypot(point.x - a.x, point.y - a.y) <= tolerance
    || Math.hypot(point.x - b.x, point.y - b.y) <= tolerance) return true;
  const projection = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
  const projectionTolerance = tolerance / Math.sqrt(lengthSquared);
  if (projection < -projectionTolerance || projection > 1 + projectionTolerance) return false;
  const clamped = Math.max(0, Math.min(1, projection));
  const nearest = { x: a.x + clamped * dx, y: a.y + clamped * dy };
  return Math.hypot(point.x - nearest.x, point.y - nearest.y) <= tolerance;
}

function strictlyInside(point: Vec2, ring: Ring): boolean {
  for (let index = 0; index < ring.length; index += 1) {
    if (pointOnSegment(point, ring[index]!, ring[(index + 1) % ring.length]!)) return false;
  }
  return pointInRing(point, ring);
}

function insideOrBoundary(point: Vec2, ring: Ring, tolerance: number): boolean {
  for (let index = 0; index < ring.length; index += 1) {
    if (pointOnSegment(point, ring[index]!, ring[(index + 1) % ring.length]!, tolerance)) return true;
  }
  return pointInRing(point, ring);
}

function segmentBoundaryParameters(start: Vec2, end: Vec2, boundaryStart: Vec2, boundaryEnd: Vec2): readonly number[] {
  const direction = { x: end.x - start.x, y: end.y - start.y };
  const boundaryDirection = { x: boundaryEnd.x - boundaryStart.x, y: boundaryEnd.y - boundaryStart.y };
  const offset = { x: boundaryStart.x - start.x, y: boundaryStart.y - start.y };
  const denominator = direction.x * boundaryDirection.y - direction.y * boundaryDirection.x;
  const crossOffsetDirection = offset.x * direction.y - offset.y * direction.x;
  if (Math.abs(denominator) > 1e-10) {
    const t = (offset.x * boundaryDirection.y - offset.y * boundaryDirection.x) / denominator;
    const u = crossOffsetDirection / denominator;
    return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9
      ? [Math.max(0, Math.min(1, t))]
      : [];
  }
  if (Math.abs(crossOffsetDirection) > 1e-8) return [];
  const lengthSquared = direction.x * direction.x + direction.y * direction.y;
  if (lengthSquared <= 1e-18) return [];
  const project = (point: Vec2): number => ((point.x - start.x) * direction.x + (point.y - start.y) * direction.y) / lengthSquared;
  return [project(boundaryStart), project(boundaryEnd)]
    .filter((value) => value >= -1e-9 && value <= 1 + 1e-9)
    .map((value) => Math.max(0, Math.min(1, value)));
}

function edgeInsideOrBoundary(start: Vec2, end: Vec2, container: Ring, tolerance: number): boolean {
  const parameters = [0, 1];
  for (let index = 0; index < container.length; index += 1) {
    parameters.push(...segmentBoundaryParameters(start, end, container[index]!, container[(index + 1) % container.length]!));
  }
  parameters.sort((a, b) => a - b);
  const unique = parameters.filter((value, index) => index === 0 || Math.abs(value - parameters[index - 1]!) > 1e-9);
  for (let index = 0; index + 1 < unique.length; index += 1) {
    if (unique[index + 1]! - unique[index]! <= 1e-9) continue;
    const t = (unique[index]! + unique[index + 1]!) / 2;
    const sample = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
    if (!insideOrBoundary(sample, container, tolerance)) return false;
  }
  return true;
}

function ringInsideOrBoundary(candidate: Ring, container: Ring, tolerance: number): boolean {
  if (!candidate.every((point) => insideOrBoundary(point, container, tolerance))) return false;
  return candidate.every((point, index) => edgeInsideOrBoundary(point, candidate[(index + 1) % candidate.length]!, container, tolerance));
}

function orientation(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function properIntersection(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const [o1, o2, o3, o4] = [orientation(a, b, c), orientation(a, b, d), orientation(c, d, a), orientation(c, d, b)];
  return ((o1 > 1e-8 && o2 < -1e-8) || (o1 < -1e-8 && o2 > 1e-8))
    && ((o3 > 1e-8 && o4 < -1e-8) || (o3 < -1e-8 && o4 > 1e-8));
}

function collinearOverlapSameInterior(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  if (Math.abs(orientation(a, b, c)) > 1e-8 || Math.abs(orientation(a, b, d)) > 1e-8) return false;
  const useX = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const [a0, a1] = useX ? [a.x, b.x] : [a.y, b.y];
  const [b0, b1] = useX ? [c.x, d.x] : [c.y, d.y];
  const overlapLength = Math.min(Math.max(a0, a1), Math.max(b0, b1)) - Math.max(Math.min(a0, a1), Math.min(b0, b1));
  const sameDirection = (b.x - a.x) * (d.x - c.x) + (b.y - a.y) * (d.y - c.y) > 0;
  return overlapLength > 1e-8 && sameDirection;
}

function overlap(a: Ring, b: Ring): boolean {
  for (let ai = 0; ai < a.length; ai += 1) {
    for (let bi = 0; bi < b.length; bi += 1) {
      if (properIntersection(a[ai]!, a[(ai + 1) % a.length]!, b[bi]!, b[(bi + 1) % b.length]!)) return true;
      if (collinearOverlapSameInterior(a[ai]!, a[(ai + 1) % a.length]!, b[bi]!, b[(bi + 1) % b.length]!)) return true;
    }
  }
  if (a.some((point) => strictlyInside(point, b)) || b.some((point) => strictlyInside(point, a))) return true;
  return a.some((point, index) => strictlyInside({ x: (point.x + a[(index + 1) % a.length]!.x) / 2, y: (point.y + a[(index + 1) % a.length]!.y) / 2 }, b))
    || b.some((point, index) => strictlyInside({ x: (point.x + b[(index + 1) % b.length]!.x) / 2, y: (point.y + b[(index + 1) % b.length]!.y) / 2 }, a));
}

function parse(text: string): { units: number | null; polylines: readonly ParsedPolyline[]; structurallyValid: boolean } {
  const lines = text.replace(/\r/g, "").split("\n");
  const groups: { code: number; value: string }[] = [];
  for (let index = 0; index + 1 < lines.length; index += 2) groups.push({ code: Number(lines[index]!.trim()), value: lines[index + 1]!.trim() });
  const unitsMarker = groups.findIndex((group) => group.code === 9 && group.value === "$INSUNITS");
  const units = unitsMarker >= 0 ? Number(groups.slice(unitsMarker + 1, unitsMarker + 4).find((group) => group.code === 70)?.value ?? NaN) : null;
  const structurallyValid = groups.some((group, index) => group.code === 0 && group.value === "SECTION" && groups[index + 1]?.value === "ENTITIES")
    && groups.some((group) => group.code === 0 && group.value === "ENDSEC")
    && groups.at(-1)?.code === 0 && groups.at(-1)?.value === "EOF";
  const polylines: ParsedPolyline[] = [];
  for (let cursor = 0; cursor < groups.length; cursor += 1) {
    if (groups[cursor]?.code !== 0 || groups[cursor]?.value !== "LWPOLYLINE") continue;
    let end = cursor + 1;
    while (end < groups.length && groups[end]!.code !== 0) end += 1;
    const entity = groups.slice(cursor + 1, end);
    const points: Vec2[] = [];
    for (let index = 0; index < entity.length; index += 1) {
      if (entity[index]!.code !== 10) continue;
      const y = entity.slice(index + 1).find((group) => group.code === 20);
      points.push({ x: Number(entity[index]!.value), y: Number(y?.value) });
    }
    polylines.push({ layer: entity.find((group) => group.code === 8)?.value ?? "", closed: (Number(entity.find((group) => group.code === 70)?.value ?? 0) & 1) === 1, points });
    cursor = end - 1;
  }
  return { units, polylines, structurallyValid };
}

function failed(reason: string, message: string): ExportVerification {
  return { ok: false, reason, message };
}

export function verifyExportedDxf(text: string, result: GenerationSuccess): ExportVerification {
  const parsed = parse(text);
  if (!parsed.structurallyValid || parsed.units !== 4) return failed("EXPORT_STRUCTURE_INVALID", "DXF 구조 또는 mm 단위 선언이 유효하지 않습니다.");
  const outlines = parsed.polylines.filter((polyline) => polyline.layer === "OUTLINE");
  const pockets = parsed.polylines.filter((polyline) => polyline.layer === "POCKET");
  const expectedPockets = [...result.pockets].sort((a, b) => a.id.localeCompare(b.id));
  // The usable boundary and each pocket are produced by separate quantized
  // kernel operations. Their worst-case relative 2D rounding displacement is
  // two diagonal coordinate quanta, not two scalar quanta.
  const containmentTolerance = Math.max(1e-7, result.metadata.tolerancePolicy.coordinateQuantumMm * 2 * Math.SQRT2);
  if (outlines.length !== 1 || parsed.polylines.length !== pockets.length + 1) return failed("EXPORT_STRUCTURE_INVALID", "DXF에는 외곽 1개와 최종 포켓만 있어야 합니다.");
  if (pockets.length !== result.parameters.cellCount) return failed("EXPORT_ROUNDTRIP_CELL_COUNT_CHANGED", "내보낸 포켓 수가 생성 결과와 다릅니다.");
  if (parsed.polylines.some((polyline) => !polyline.closed || polyline.points.length < 3 || polyline.points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y)))) {
    return failed("EXPORT_ROUNDTRIP_OPEN_CONTOUR", "내보낸 contour가 닫혀 있지 않거나 좌표가 유효하지 않습니다.");
  }
  for (let index = 0; index < pockets.length; index += 1) {
    const exportedArea = area(pockets[index]!.points);
    const originalArea = expectedPockets[index]!.areaMm2;
    if (exportedArea < result.parameters.minPocketAreaMm2 || exportedArea > result.parameters.maxPocketAreaMm2) {
      return failed("EXPORT_ROUNDTRIP_AREA_OUT_OF_USER_INTERVAL", "DXF 재검증 면적이 사용자 범위를 벗어났습니다.");
    }
    if (Math.abs(exportedArea - originalArea) / Math.max(originalArea, 0.1) > 0.001) {
      return failed("EXPORT_ROUNDTRIP_AREA_DELTA_EXCEEDED", "DXF 반올림으로 면적 변화가 0.1%를 초과했습니다.");
    }
    if (!ringInsideOrBoundary(pockets[index]!.points, result.usableDomain.outer, containmentTolerance)) {
      return failed("EXPORT_ROUNDTRIP_CONTAINMENT_FAILED", "DXF 포켓이 외곽선을 벗어났습니다.");
    }
  }
  for (let first = 0; first < pockets.length; first += 1) {
    for (let second = first + 1; second < pockets.length; second += 1) {
      if (overlap(pockets[first]!.points, pockets[second]!.points)) return failed("EXPORT_ROUNDTRIP_OVERLAP_DETECTED", "DXF 포켓이 서로 겹칩니다.");
    }
  }
  return { ok: true };
}
