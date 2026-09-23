export interface SeededRandom {
  next(): number;
  integer(maxExclusive: number): number;
}

function seedWords(seed: string): [number, number, number, number] {
  let h1 = 0x9e3779b9;
  let h2 = 0x243f6a88;
  let h3 = 0xb7e15162;
  let h4 = 0xdeadbeef;
  for (let i = 0; i < seed.length; i += 1) {
    const code = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x85ebca6b);
    h2 = Math.imul(h2 ^ code, 0xc2b2ae35);
    h3 = Math.imul(h3 ^ code, 0x27d4eb2f);
    h4 = Math.imul(h4 ^ code, 0x165667b1);
  }
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export function createSeededRandom(seed: string): SeededRandom {
  let [a, b, c, d] = seedWords(seed);
  return {
    next(): number {
      const t = (b << 9) >>> 0;
      let r = Math.imul(a, 5);
      r = Math.imul(((r << 7) | (r >>> 25)) >>> 0, 9);
      c ^= a;
      d ^= b;
      b ^= c;
      a ^= d;
      c ^= t;
      d = ((d << 11) | (d >>> 21)) >>> 0;
      return (r >>> 0) / 4_294_967_296;
    },
    integer(maxExclusive: number): number {
      return Math.floor(this.next() * maxExclusive);
    },
  };
}

export function deterministicHash(value: unknown): string {
  const input = stableStringify(value);
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ code, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(",")}}`;
}
