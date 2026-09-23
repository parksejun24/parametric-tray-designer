const UNIT_TO_MM: Readonly<Record<string, number>> = {
  mm: 1,
  cm: 10,
  in: 25.4,
  inch: 25.4,
  inches: 25.4,
  px: 25.4 / 96,
  pt: 25.4 / 72,
  pc: 25.4 / 6,
};

export function unitToMm(unit: string | null): number | null {
  if (!unit) return null;
  return UNIT_TO_MM[unit.toLowerCase()] ?? null;
}

export function parseSvgLength(value: string | null): { value: number; unit: string | null } | null {
  if (!value) return null;
  const match = value.trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)$/i);
  if (!match) return null;
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric) || match[2] === "%") return null;
  return { value: numeric, unit: match[2]?.toLowerCase() || null };
}

export const DXF_INSUNITS: Readonly<Record<number, { name: string; toMm: number }>> = {
  1: { name: "in", toMm: 25.4 },
  2: { name: "ft", toMm: 304.8 },
  4: { name: "mm", toMm: 1 },
  5: { name: "cm", toMm: 10 },
  6: { name: "m", toMm: 1000 },
};
