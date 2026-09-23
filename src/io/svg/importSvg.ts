import { boundsOf, ImportError, normalizeRing, type ImportedOutline, type Point2 } from "../types";
import { parseSvgLength, unitToMm } from "../units";
import { parsePathData } from "./parsePathData";
import { IDENTITY, maxSingularValue, multiply, parseTransform, transformPoint, type Matrix2D } from "./transforms";

const ACCEPTED = new Set(["svg", "g", "path", "polygon", "polyline", "rect", "circle", "ellipse"]);
const CONTOURS = new Set(["path", "polygon", "polyline", "rect", "circle", "ellipse"]);
const BLOCKED = new Set(["script", "use", "image", "text", "filter", "mask", "animate", "animatetransform", "foreignobject"]);

function numeric(element: Element, name: string, fallback = 0): number {
  const value = element.getAttribute(name);
  const result = value === null ? fallback : Number(value);
  if (!Number.isFinite(result)) throw new ImportError("GEOM_NON_FINITE_COORDINATE", `${name} 값이 유효하지 않습니다.`);
  return result;
}

function ellipsePoints(cx: number, cy: number, rx: number, ry: number, tolerance: number): Point2[] {
  if (rx <= 0 || ry <= 0) throw new ImportError("GEOM_ZERO_OR_NEGLIGIBLE_AREA", "원 또는 타원의 반지름은 양수여야 합니다.");
  const radius = Math.max(rx, ry);
  const step = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tolerance / radius)));
  const segments = Math.max(24, Math.ceil((Math.PI * 2) / Math.max(step, Math.PI / 90)));
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
  });
}

function parsePoints(value: string): Point2[] {
  const numbers = value.trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (numbers.length < 6 || numbers.length % 2 !== 0 || numbers.some((item) => !Number.isFinite(item))) {
    throw new ImportError("INVALID_GEOMETRY", "polygon/polyline 좌표가 유효하지 않습니다.");
  }
  const points: Point2[] = [];
  for (let index = 0; index < numbers.length; index += 2) points.push({ x: numbers[index]!, y: numbers[index + 1]! });
  return points;
}

function contourPoints(element: Element, tolerance: number): Point2[] {
  const name = element.localName.toLowerCase();
  if (name === "path") {
    try {
      return [...parsePathData(element.getAttribute("d") ?? "", tolerance)];
    } catch (error) {
      throw new ImportError("INVALID_GEOMETRY", error instanceof Error ? error.message : "SVG path를 해석할 수 없습니다.");
    }
  }
  if (name === "polygon") return parsePoints(element.getAttribute("points") ?? "");
  if (name === "polyline") {
    const points = parsePoints(element.getAttribute("points") ?? "");
    const first = points[0]!;
    const last = points.at(-1)!;
    if (Math.hypot(first.x - last.x, first.y - last.y) > tolerance) throw new ImportError("GEOM_OPEN_CONTOUR", "polyline이 닫혀 있지 않습니다.");
    return points;
  }
  if (name === "rect") {
    const x = numeric(element, "x");
    const y = numeric(element, "y");
    const width = numeric(element, "width");
    const height = numeric(element, "height");
    if (width <= 0 || height <= 0) throw new ImportError("GEOM_ZERO_OR_NEGLIGIBLE_AREA", "rect 크기가 유효하지 않습니다.");
    return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
  }
  const cx = numeric(element, "cx");
  const cy = numeric(element, "cy");
  const rx = name === "circle" ? numeric(element, "r") : numeric(element, "rx");
  const ry = name === "circle" ? rx : numeric(element, "ry");
  return ellipsePoints(cx, cy, rx, ry, tolerance);
}

function inheritedTransform(element: Element): Matrix2D {
  const parents: Element[] = [];
  let current: Element | null = element;
  while (current) {
    parents.push(current);
    current = current.parentElement;
  }
  return [...parents].reverse().reduce<Matrix2D>((matrix, item) => multiply(matrix, parseTransform(item.getAttribute("transform"))), IDENTITY);
}

function assertSafe(root: Element): void {
  for (const element of [root, ...root.querySelectorAll("*")]) {
    const name = element.localName.toLowerCase();
    if (BLOCKED.has(name) || !ACCEPTED.has(name)) {
      throw new ImportError("CFG_UNSUPPORTED_SVG_ELEMENT", `지원하지 않는 SVG 요소입니다: <${name}>`);
    }
    if (element.namespaceURI && element.namespaceURI !== "http://www.w3.org/2000/svg") {
      throw new ImportError("CFG_UNSUPPORTED_SVG_ELEMENT", "알 수 없는 SVG namespace는 허용하지 않습니다.");
    }
    for (const attribute of [...element.attributes]) {
      const key = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (key.startsWith("on") || key === "href" || key === "xlink:href" || value.includes("url(")) {
        throw new ImportError("CFG_UNSUPPORTED_SVG_ELEMENT", "외부 리소스나 이벤트 속성은 허용하지 않습니다.");
      }
    }
  }
}

export function importSvg(text: string, sourceName: string): ImportedOutline {
  if (text.length > 5_000_000) throw new ImportError("CFG_INPUT_SIZE_LIMIT_EXCEEDED", "SVG 파일이 5 MB 제한을 초과합니다.");
  const document = new DOMParser().parseFromString(text, "image/svg+xml");
  if (document.querySelector("parsererror")) throw new ImportError("INVALID_GEOMETRY", "SVG XML을 해석할 수 없습니다.");
  const root = document.documentElement;
  if (root.localName.toLowerCase() !== "svg") throw new ImportError("INVALID_GEOMETRY", "SVG 루트 요소가 없습니다.");
  assertSafe(root);
  const contours = [...root.querySelectorAll([...CONTOURS].join(","))];
  if (contours.length !== 1) {
    throw new ImportError(contours.length === 0 ? "GEOM_ZERO_OR_NEGLIGIBLE_AREA" : "CFG_MULTIPLE_OUTER_CONTOURS", "외곽선은 정확히 하나여야 합니다.");
  }

  const width = parseSvgLength(root.getAttribute("width"));
  const height = parseSvgLength(root.getAttribute("height"));
  const declaredUnit = width?.unit ?? height?.unit ?? null;
  if (width?.unit && height?.unit && width.unit !== height.unit) throw new ImportError("CFG_PHYSICAL_UNIT_REQUIRED", "SVG width와 height 단위가 다릅니다.");
  let scale = unitToMm(declaredUnit);
  const viewBox = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).filter(Boolean).map(Number);
  let viewBoxMatrix: Matrix2D = IDENTITY;
  if (viewBox.length === 4 && width && height && scale) {
    const [, , vbWidth, vbHeight] = viewBox;
    if (vbWidth! > 0 && vbHeight! > 0) viewBoxMatrix = [width.value / vbWidth!, 0, 0, height.value / vbHeight!, 0, 0];
  } else if (viewBox.length === 4 && !scale) {
    scale = null;
  }
  const transform = multiply(viewBoxMatrix, inheritedTransform(contours[0]!));
  const desiredPhysicalTolerance = 0.02;
  const physicalScale = scale ?? 1;
  const sourceTolerance = desiredPhysicalTolerance / Math.max(physicalScale * maxSingularValue(transform), Number.EPSILON);
  const raw = contourPoints(contours[0]!, sourceTolerance);
  const transformed = normalizeRing(raw.map((point) => transformPoint(transform, point)));
  const points = scale ? transformed.map((point) => ({ x: point.x * scale, y: point.y * scale })) : transformed;
  const bounds = boundsOf(points);
  return {
    sourceFormat: "svg",
    sourceName,
    sourceUnit: declaredUnit,
    sourceToMm: scale,
    points,
    bounds,
    physicalWidthMm: scale ? bounds.maxX - bounds.minX : null,
    physicalHeightMm: scale ? bounds.maxY - bounds.minY : null,
    warnings: scale ? [] : ["SVG에 물리 단위가 없어 mm 변환 배율을 확인해야 합니다."],
  };
}
