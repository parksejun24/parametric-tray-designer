// @vitest-environment node

import { describe, expect, it } from "vitest";

import { BoundaryFlowField, unsignedAlignment } from "../../src/core/boundaryFlow";
import { createSeededRandom, deterministicHash } from "../../src/core/random";
import type { Ring } from "../../src/core/types";

describe("deterministic random utilities", () => {
  it("replays the same sequence for the same seed", () => {
    const first = createSeededRandom("repeatable");
    const second = createSeededRandom("repeatable");

    expect(Array.from({ length: 20 }, () => first.next())).toEqual(
      Array.from({ length: 20 }, () => second.next()),
    );
  });

  it("keeps generated values in the half-open unit interval", () => {
    const random = createSeededRandom("bounds");

    for (let index = 0; index < 1_000; index += 1) {
      const value = random.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("hashes object keys independently of insertion order", () => {
    expect(deterministicHash({ a: 1, b: 2 })).toBe(deterministicHash({ b: 2, a: 1 }));
  });

  it("changes the hash when reproducibility input changes", () => {
    expect(deterministicHash({ seed: "a", budget: 100 })).not.toBe(
      deterministicHash({ seed: "a", budget: 101 }),
    );
  });
});

describe("boundary flow", () => {
  it("reports neutral confidence at the centre of a symmetric square", () => {
    const square: Ring = [
      { x: -10, y: -10 },
      { x: 10, y: -10 },
      { x: 10, y: 10 },
      { x: -10, y: 10 },
    ];

    expect(new BoundaryFlowField(square, 20).sample({ x: 0, y: 0 }).confidence).toBeCloseTo(0, 10);
  });

  it("follows the long boundary direction in an elongated rectangle", () => {
    const rectangle: Ring = [
      { x: -50, y: -5 },
      { x: 50, y: -5 },
      { x: 50, y: 5 },
      { x: -50, y: 5 },
    ];
    const sample = new BoundaryFlowField(rectangle, 20).sample({ x: 0, y: 0 });

    expect(unsignedAlignment(sample.direction, { x: 1, y: 0 })).toBeGreaterThan(0.99);
    expect(sample.confidence).toBeGreaterThan(0.5);
  });

  it("treats opposite axes as fully aligned", () => {
    expect(unsignedAlignment({ x: 1, y: 0 }, { x: -1, y: 0 })).toBe(1);
  });
});
