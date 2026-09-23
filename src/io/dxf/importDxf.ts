import { boundsOf, ImportError, normalizeRing, type ImportedOutline, type Point2 } from "../types";
import { DXF_INSUNITS } from "../units";

interface Group {
  readonly code: number;
  readonly value: string;
}

function groupsOf(text: string): Group[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const groups: Group[] = [];
  for (let index = 0; index + 1 < lines.length; index += 2) {
    const code = Number(lines[index]?.trim());
    if (!Number.isInteger(code)) throw new ImportError("INVALID_GEOMETRY", "DXF group code가 유효하지 않습니다.");
    groups.push({ code, value: lines[index + 1]!.trim() });
  }
  return groups;
}

function numberValue(group: Group | undefined, label: string): number {
  const value = Number(group?.value);
  if (!Number.isFinite(value)) throw new ImportError("GEOM_NON_FINITE_COORDINATE", `${label} 좌표가 유효하지 않습니다.`);
  return value;
}

function circle(cx: number, cy: number, rx: number, ry: number, start = 0, end = Math.PI * 2, includeEnd = false): Point2[] {
  const sweep = end > start ? end - start : end - start + Math.PI * 2;
  const segments = Math.max(32, Math.ceil(sweep / (Math.PI / 48)));
  const count = includeEnd ? segments + 1 : segments;
  return Array.from({ length: count }, (_, index) => {
    const angle = start + (sweep * index) / segments;
    return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
  });
}

function bulgeSegment(start: Point2, end: Point2, bulge: number): Point2[] {
  if (Math.abs(bulge) <= 1e-12) return [end];
  const chord = Math.hypot(end.x - start.x, end.y - start.y);
  const theta = 4 * Math.atan(bulge);
  const radius = chord / (2 * Math.sin(Math.abs(theta) / 2));
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const perpendicular = { x: -(end.y - start.y) / chord, y: (end.x - start.x) / chord };
  const offset = radius * Math.cos(Math.abs(theta) / 2) * Math.sign(bulge);
  const center = { x: midpoint.x + perpendicular.x * offset, y: midpoint.y + perpendicular.y * offset };
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const segments = Math.max(2, Math.ceil(Math.abs(theta) / (Math.PI / 48)));
  return Array.from({ length: segments }, (_, index) => {
    const angle = startAngle + (theta * (index + 1)) / segments;
    return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
  });
}

function entitySlices(groups: readonly Group[]): { type: string; values: readonly Group[]; start: number; end: number }[] {
  const entities: { type: string; values: readonly Group[]; start: number; end: number }[] = [];
  for (let cursor = 0; cursor < groups.length; cursor += 1) {
    if (groups[cursor]!.code !== 0) continue;
    let end = cursor + 1;
    while (end < groups.length && groups[end]!.code !== 0) end += 1;
    entities.push({ type: groups[cursor]!.value.toUpperCase(), values: groups.slice(cursor + 1, end), start: cursor, end });
    cursor = end - 1;
  }
  return entities;
}

function entitiesSection(groups: readonly Group[]): readonly Group[] {
  for (let index = 0; index + 1 < groups.length; index += 1) {
    if (groups[index]!.code !== 0 || groups[index]!.value.toUpperCase() !== "SECTION") continue;
    if (groups[index + 1]!.code !== 2 || groups[index + 1]!.value.toUpperCase() !== "ENTITIES") continue;
    const end = groups.findIndex((group, candidate) => candidate > index + 1 && group.code === 0 && group.value.toUpperCase() === "ENDSEC");
    if (end < 0) throw new ImportError("INVALID_GEOMETRY", "DXF ENTITIES section이 닫혀 있지 않습니다.");
    return groups.slice(index + 2, end);
  }
  throw new ImportError("INVALID_GEOMETRY", "DXF ENTITIES section이 없습니다.");
}

function collectEntities(groups: readonly Group[]): Point2[][] {
  const contours: Point2[][] = [];
  const chains: Point2[][] = [];
  const entities = entitySlices(groups);
  for (let entityIndex = 0; entityIndex < entities.length; entityIndex += 1) {
    const { type, values: entity } = entities[entityIndex]!;
    if (type === "LWPOLYLINE") {
      const flag = Number(entity.find((item) => item.code === 70)?.value ?? 0);
      if ((flag & 1) === 0) throw new ImportError("GEOM_OPEN_CONTOUR", "LWPOLYLINE이 닫혀 있지 않습니다.");
      const vertices: { point: Point2; bulge: number }[] = [];
      for (let index = 0; index < entity.length; index += 1) {
        if (entity[index]!.code !== 10) continue;
        const x = numberValue(entity[index], "x");
        const nextVertex = entity.findIndex((item, candidate) => candidate > index && item.code === 10);
        const vertexEnd = nextVertex < 0 ? entity.length : nextVertex;
        const vertexGroups = entity.slice(index + 1, vertexEnd);
        const yGroup = vertexGroups.find((item) => item.code === 20);
        const bulge = Number(vertexGroups.find((item) => item.code === 42)?.value ?? 0);
        vertices.push({ point: { x, y: numberValue(yGroup, "y") }, bulge });
      }
      const points: Point2[] = [];
      for (let index = 0; index < vertices.length; index += 1) {
        const vertex = vertices[index]!;
        if (index === 0) points.push(vertex.point);
        points.push(...bulgeSegment(vertex.point, vertices[(index + 1) % vertices.length]!.point, vertex.bulge));
      }
      contours.push(points);
    } else if (type === "POLYLINE") {
      const flag = Number(entity.find((item) => item.code === 70)?.value ?? 0);
      if ((flag & 1) === 0) throw new ImportError("GEOM_OPEN_CONTOUR", "POLYLINE이 닫혀 있지 않습니다.");
      if ((flag & 8) !== 0 || (flag & 16) !== 0 || (flag & 64) !== 0) throw new ImportError("CFG_UNSUPPORTED_DXF_ENTITY", "3D 또는 mesh POLYLINE은 지원하지 않습니다.");
      const vertices: { point: Point2; bulge: number }[] = [];
      let next = entityIndex + 1;
      while (next < entities.length && entities[next]!.type === "VERTEX") {
        const values = entities[next]!.values;
        vertices.push({
          point: {
            x: numberValue(values.find((item) => item.code === 10), "x"),
            y: numberValue(values.find((item) => item.code === 20), "y"),
          },
          bulge: Number(values.find((item) => item.code === 42)?.value ?? 0),
        });
        next += 1;
      }
      if (entities[next]?.type !== "SEQEND") throw new ImportError("INVALID_GEOMETRY", "POLYLINE SEQEND가 없습니다.");
      const points: Point2[] = [];
      for (let index = 0; index < vertices.length; index += 1) {
        const vertex = vertices[index]!;
        if (index === 0) points.push(vertex.point);
        points.push(...bulgeSegment(vertex.point, vertices[(index + 1) % vertices.length]!.point, vertex.bulge));
      }
      contours.push(points);
      entityIndex = next;
    } else if (type === "CIRCLE") {
      const cx = numberValue(entity.find((item) => item.code === 10), "cx");
      const cy = numberValue(entity.find((item) => item.code === 20), "cy");
      const radius = numberValue(entity.find((item) => item.code === 40), "radius");
      contours.push(circle(cx, cy, radius, radius));
    } else if (type === "ELLIPSE") {
      const cx = numberValue(entity.find((item) => item.code === 10), "cx");
      const cy = numberValue(entity.find((item) => item.code === 20), "cy");
      const majorX = numberValue(entity.find((item) => item.code === 11), "major x");
      const majorY = numberValue(entity.find((item) => item.code === 21), "major y");
      if (Math.abs(majorY) > 1e-9) throw new ImportError("CFG_UNSUPPORTED_DXF_ENTITY", "회전된 ELLIPSE는 현재 지원하지 않습니다.");
      const ratio = numberValue(entity.find((item) => item.code === 40), "ellipse ratio");
      contours.push(circle(cx, cy, Math.abs(majorX), Math.abs(majorX * ratio)));
    } else if (type === "LINE") {
      chains.push([
        { x: numberValue(entity.find((item) => item.code === 10), "start x"), y: numberValue(entity.find((item) => item.code === 20), "start y") },
        { x: numberValue(entity.find((item) => item.code === 11), "end x"), y: numberValue(entity.find((item) => item.code === 21), "end y") },
      ]);
    } else if (type === "ARC") {
      const cx = numberValue(entity.find((item) => item.code === 10), "cx");
      const cy = numberValue(entity.find((item) => item.code === 20), "cy");
      const radius = numberValue(entity.find((item) => item.code === 40), "radius");
      const start = (numberValue(entity.find((item) => item.code === 50), "start angle") * Math.PI) / 180;
      const end = (numberValue(entity.find((item) => item.code === 51), "end angle") * Math.PI) / 180;
      chains.push(circle(cx, cy, radius, radius, start, end, true));
    } else if (["SPLINE", "INSERT", "3DFACE"].includes(type)) {
      throw new ImportError("CFG_UNSUPPORTED_DXF_ENTITY", `지원하지 않는 DXF entity입니다: ${type}`);
    }
  }
  if (chains.length > 0) {
    const remaining = [...chains];
    const assembled = remaining.shift()!.slice();
    while (remaining.length > 0) {
      const end = assembled.at(-1)!;
      const match = remaining.findIndex((candidate) => Math.hypot(candidate[0]!.x - end.x, candidate[0]!.y - end.y) <= 1e-6);
      if (match < 0) throw new ImportError("GEOM_OPEN_CONTOUR", "LINE/ARC chain이 순서대로 닫히지 않습니다.");
      assembled.push(...remaining.splice(match, 1)[0]!.slice(1));
    }
    const first = assembled[0]!;
    const last = assembled.at(-1)!;
    if (Math.hypot(first.x - last.x, first.y - last.y) > 1e-6) throw new ImportError("GEOM_OPEN_CONTOUR", "LINE/ARC chain이 닫히지 않습니다.");
    contours.push(assembled);
  }
  return contours;
}

export function importDxf(text: string, sourceName: string): ImportedOutline {
  if (text.length > 10_000_000) throw new ImportError("CFG_INPUT_SIZE_LIMIT_EXCEEDED", "DXF 파일이 10 MB 제한을 초과합니다.");
  const groups = groupsOf(text);
  const unitMarker = groups.findIndex((group) => group.code === 9 && group.value === "$INSUNITS");
  const unitCode = unitMarker >= 0 ? Number(groups.slice(unitMarker + 1, unitMarker + 4).find((group) => group.code === 70)?.value ?? 0) : 0;
  const unit = DXF_INSUNITS[unitCode];
  const contours = collectEntities(entitiesSection(groups));
  if (contours.length !== 1) {
    throw new ImportError(contours.length === 0 ? "GEOM_ZERO_OR_NEGLIGIBLE_AREA" : "CFG_MULTIPLE_OUTER_CONTOURS", "DXF에는 닫힌 외곽선이 정확히 하나 있어야 합니다.");
  }
  const raw = normalizeRing(contours[0]!);
  const points = unit ? raw.map((point) => ({ x: point.x * unit.toMm, y: point.y * unit.toMm })) : raw;
  const bounds = boundsOf(points);
  return {
    sourceFormat: "dxf",
    sourceName,
    sourceUnit: unit?.name ?? null,
    sourceToMm: unit?.toMm ?? null,
    points,
    bounds,
    physicalWidthMm: unit ? bounds.maxX - bounds.minX : null,
    physicalHeightMm: unit ? bounds.maxY - bounds.minY : null,
    warnings: unit ? [] : ["DXF의 $INSUNITS가 없어 mm 변환 배율을 확인해야 합니다."],
  };
}
