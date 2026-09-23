import type { Point2 } from "../types";

const TOKEN = /[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g;
const MAX_DEPTH = 18;
const MAX_POINTS = 20_000;

function distanceToLine(point: Point2, a: Point2, b: Point2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  return Math.abs(dy * point.x - dx * point.y + b.x * a.y - b.y * a.x) / length;
}

function midpoint(a: Point2, b: Point2): Point2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function flattenQuadratic(a: Point2, b: Point2, c: Point2, tolerance: number, output: Point2[], depth = 0): void {
  if (depth >= MAX_DEPTH || distanceToLine(b, a, c) <= tolerance) {
    output.push(c);
    return;
  }
  const ab = midpoint(a, b);
  const bc = midpoint(b, c);
  const abc = midpoint(ab, bc);
  flattenQuadratic(a, ab, abc, tolerance, output, depth + 1);
  flattenQuadratic(abc, bc, c, tolerance, output, depth + 1);
}

function flattenCubic(a: Point2, b: Point2, c: Point2, d: Point2, tolerance: number, output: Point2[], depth = 0): void {
  if (depth >= MAX_DEPTH || Math.max(distanceToLine(b, a, d), distanceToLine(c, a, d)) <= tolerance) {
    output.push(d);
    return;
  }
  const ab = midpoint(a, b);
  const bc = midpoint(b, c);
  const cd = midpoint(c, d);
  const abc = midpoint(ab, bc);
  const bcd = midpoint(bc, cd);
  const abcd = midpoint(abc, bcd);
  flattenCubic(a, ab, abc, abcd, tolerance, output, depth + 1);
  flattenCubic(abcd, bcd, cd, d, tolerance, output, depth + 1);
}

function vectorAngle(ux: number, uy: number, vx: number, vy: number): number {
  const dot = ux * vx + uy * vy;
  const length = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  const sign = ux * vy - uy * vx < 0 ? -1 : 1;
  return sign * Math.acos(Math.max(-1, Math.min(1, dot / Math.max(length, Number.EPSILON))));
}

function flattenArc(
  start: Point2,
  rxInput: number,
  ryInput: number,
  angleDeg: number,
  largeArc: boolean,
  sweep: boolean,
  end: Point2,
  tolerance: number,
  output: Point2[],
): void {
  let rx = Math.abs(rxInput);
  let ry = Math.abs(ryInput);
  if (rx === 0 || ry === 0 || (start.x === end.x && start.y === end.y)) {
    output.push(end);
    return;
  }
  const phi = (angleDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (start.x - end.x) / 2;
  const dy = (start.y - end.y) / 2;
  const xPrime = cosPhi * dx + sinPhi * dy;
  const yPrime = -sinPhi * dx + cosPhi * dy;
  const scale = Math.sqrt((xPrime * xPrime) / (rx * rx) + (yPrime * yPrime) / (ry * ry));
  if (scale > 1) {
    rx *= scale;
    ry *= scale;
  }
  const numerator = Math.max(0, rx * rx * ry * ry - rx * rx * yPrime * yPrime - ry * ry * xPrime * xPrime);
  const denominator = rx * rx * yPrime * yPrime + ry * ry * xPrime * xPrime;
  const factor = (largeArc === sweep ? -1 : 1) * Math.sqrt(numerator / Math.max(denominator, Number.EPSILON));
  const cxPrime = factor * ((rx * yPrime) / ry);
  const cyPrime = factor * (-(ry * xPrime) / rx);
  const cx = cosPhi * cxPrime - sinPhi * cyPrime + (start.x + end.x) / 2;
  const cy = sinPhi * cxPrime + cosPhi * cyPrime + (start.y + end.y) / 2;
  const ux = (xPrime - cxPrime) / rx;
  const uy = (yPrime - cyPrime) / ry;
  const vx = (-xPrime - cxPrime) / rx;
  const vy = (-yPrime - cyPrime) / ry;
  const startAngle = vectorAngle(1, 0, ux, uy);
  let delta = vectorAngle(ux, uy, vx, vy);
  if (!sweep && delta > 0) delta -= Math.PI * 2;
  if (sweep && delta < 0) delta += Math.PI * 2;
  const maxRadius = Math.max(rx, ry);
  const step = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tolerance / maxRadius)));
  const segments = Math.max(1, Math.ceil(Math.abs(delta) / Math.max(step, Math.PI / 180)));
  for (let index = 1; index <= segments; index += 1) {
    const theta = startAngle + (delta * index) / segments;
    output.push({
      x: cx + cosPhi * rx * Math.cos(theta) - sinPhi * ry * Math.sin(theta),
      y: cy + sinPhi * rx * Math.cos(theta) + cosPhi * ry * Math.sin(theta),
    });
  }
}

export function parsePathData(data: string, tolerance = 0.05): readonly Point2[] {
  const tokens = data.match(TOKEN) ?? [];
  let cursor = 0;
  let command = "";
  let current: Point2 = { x: 0, y: 0 };
  let start: Point2 | null = null;
  let previousControl: Point2 | null = null;
  let previousCommand = "";
  const output: Point2[] = [];

  const isCommand = (token: string | undefined): boolean => Boolean(token && /^[a-zA-Z]$/.test(token));
  const number = (): number => {
    const token = tokens[cursor++];
    if (!token || isCommand(token)) throw new Error("Malformed path data");
    const value = Number(token);
    if (!Number.isFinite(value)) throw new Error("Non-finite path coordinate");
    return value;
  };
  const point = (relative: boolean): Point2 => {
    const x = number();
    const y = number();
    return relative ? { x: current.x + x, y: current.y + y } : { x, y };
  };
  const push = (value: Point2): void => {
    output.push(value);
    if (output.length > MAX_POINTS) throw new Error("Path segment limit exceeded");
  };

  while (cursor < tokens.length) {
    if (isCommand(tokens[cursor])) command = tokens[cursor++]!;
    if (!command) throw new Error("Path must begin with a command");
    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();
    if (upper === "Z") {
      if (!start) throw new Error("Close command without subpath");
      current = start;
      previousControl = null;
      previousCommand = command;
      command = "";
      continue;
    }
    if (upper === "M") {
      current = point(relative);
      if (start && output.length > 0) throw new Error("Multiple subpaths are not supported");
      start = current;
      push(current);
      command = relative ? "l" : "L";
    } else if (upper === "L") {
      current = point(relative);
      push(current);
    } else if (upper === "H") {
      const x = number();
      current = { x: relative ? current.x + x : x, y: current.y };
      push(current);
    } else if (upper === "V") {
      const y = number();
      current = { x: current.x, y: relative ? current.y + y : y };
      push(current);
    } else if (upper === "Q" || upper === "T") {
      const control: Point2 = upper === "T" && /[QT]/i.test(previousCommand) && previousControl
        ? { x: 2 * current.x - previousControl.x, y: 2 * current.y - previousControl.y }
        : upper === "Q" ? point(relative) : current;
      const end = point(relative);
      flattenQuadratic(current, control, end, tolerance, output);
      previousControl = control;
      current = end;
    } else if (upper === "C" || upper === "S") {
      const first = upper === "S" && /[CS]/i.test(previousCommand) && previousControl
        ? { x: 2 * current.x - previousControl.x, y: 2 * current.y - previousControl.y }
        : upper === "C" ? point(relative) : current;
      const second = point(relative);
      const end = point(relative);
      flattenCubic(current, first, second, end, tolerance, output);
      previousControl = second;
      current = end;
    } else if (upper === "A") {
      const rx = number();
      const ry = number();
      const rotation = number();
      const largeArc = number() !== 0;
      const sweep = number() !== 0;
      const end = point(relative);
      flattenArc(current, rx, ry, rotation, largeArc, sweep, end, tolerance, output);
      current = end;
      previousControl = null;
    } else {
      throw new Error(`Unsupported path command: ${command}`);
    }
    previousCommand = command;
    if (upper !== "Q" && upper !== "T" && upper !== "C" && upper !== "S") previousControl = null;
  }
  if (!start || command.toUpperCase() !== "" || !/[zZ]\s*$/.test(data)) {
    throw new Error("Path must be explicitly closed");
  }
  return output;
}
