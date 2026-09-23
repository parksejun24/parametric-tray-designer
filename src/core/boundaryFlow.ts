import { add, distanceSquared, dot, length, scale, sub } from "./geometry";
import type { Ring, Vec2 } from "./types";

export interface FlowSample {
  readonly direction: Vec2;
  readonly confidence: number;
}

interface BoundarySample {
  readonly point: Vec2;
  readonly tangent: Vec2;
}

export class BoundaryFlowField {
  private readonly samples: readonly BoundarySample[];

  constructor(ring: Ring, private readonly sigmaMm: number) {
    const sampleCount = Math.max(32, Math.min(256, ring.length * 4));
    this.samples = uniformSamples(ring, sampleCount);
  }

  sample(point: Vec2): FlowSample {
    let xx = 0;
    let xy = 0;
    let yy = 0;
    const denominator = 2 * this.sigmaMm ** 2;
    for (const sample of this.samples) {
      const weight = Math.exp(-distanceSquared(point, sample.point) / denominator);
      xx += weight * sample.tangent.x * sample.tangent.x;
      xy += weight * sample.tangent.x * sample.tangent.y;
      yy += weight * sample.tangent.y * sample.tangent.y;
    }
    const trace = xx + yy;
    if (trace <= 1e-12) return { direction: { x: 1, y: 0 }, confidence: 0 };
    const gap = Math.sqrt(Math.max(0, (xx - yy) ** 2 + 4 * xy ** 2));
    const major = (trace + gap) / 2;
    const raw = Math.abs(xy) > 1e-12 ? { x: major - yy, y: xy } : (xx >= yy ? { x: 1, y: 0 } : { x: 0, y: 1 });
    const magnitude = length(raw);
    return {
      direction: magnitude > 1e-12 ? scale(raw, 1 / magnitude) : { x: 1, y: 0 },
      confidence: gap / (trace + 1e-12),
    };
  }
}

function uniformSamples(ring: Ring, count: number): readonly BoundarySample[] {
  const segments = ring.map((point, index) => ({
    start: point,
    end: ring[(index + 1) % ring.length]!,
    length: length(sub(ring[(index + 1) % ring.length]!, point)),
  }));
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  const output: BoundarySample[] = [];
  for (let sampleIndex = 0; sampleIndex < count; sampleIndex += 1) {
    let target = total * sampleIndex / count;
    let segment = segments[0]!;
    for (const candidate of segments) {
      if (target < candidate.length) {
        segment = candidate;
        break;
      }
      target -= candidate.length;
    }
    const direction = sub(segment.end, segment.start);
    const magnitude = Math.max(length(direction), 1e-12);
    output.push({ point: add(segment.start, scale(direction, target / magnitude)), tangent: scale(direction, 1 / magnitude) });
  }
  return output;
}

export function unsignedAlignment(a: Vec2, b: Vec2): number {
  return Math.min(1, Math.abs(dot(a, b)));
}
