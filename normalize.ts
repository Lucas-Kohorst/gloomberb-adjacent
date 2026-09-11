import type {
  AdjacentIndex,
  AdjacentIndexRow,
  AdjacentPriceSample,
  AdjacentRate,
  AdjacentRateRow,
  PricePoint,
} from "./types";

function stringField(item: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function numberField(item: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

export function unwrapList<T>(raw: unknown, idKey: string): T[] {
  const rows = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)
      ? (raw as { data: unknown[] }).data
      : [];
  return rows.filter((row): row is T => (
    !!row && typeof row === "object" && typeof (row as Record<string, unknown>)[idKey] === "string"
  ));
}

export function unwrapPriceSamples(raw: unknown): AdjacentPriceSample[] {
  const rows = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? Array.isArray((raw as { data?: unknown }).data)
        ? (raw as { data: unknown[] }).data
        : Array.isArray((raw as { points?: unknown }).points)
          ? (raw as { points: unknown[] }).points
          : []
      : [];
  const samples: AdjacentPriceSample[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const timestamp = stringField(item, "timestamp", "time", "date");
    const price = numberField(item, "price", "close", "value");
    if (!timestamp || price == null) continue;
    samples.push({ timestamp, price });
  }
  return samples;
}

export function normalizeIndex(index: AdjacentIndex): AdjacentIndexRow {
  return {
    id: index.index_id,
    ticker: index.ticker?.trim() || index.index_id.toUpperCase(),
    name: index.name,
    value: index.latest_price,
    change1d: index.change_1d ?? null,
    change7d: index.change_7d ?? null,
    category: index.office_category ?? undefined,
  };
}

export function normalizeRate(rate: AdjacentRate): AdjacentRateRow {
  return {
    id: rate.rate_id,
    name: rate.name,
    value: rate.latest_price ?? null,
    spread: rate.spread ?? null,
    change1d: rate.price_change_1d ?? null,
  };
}

export function samplesToPoints(samples: AdjacentPriceSample[]): PricePoint[] {
  return samples.flatMap((sample) => {
    if (sample.price == null) return [];
    const date = new Date(sample.timestamp);
    if (!Number.isFinite(date.getTime())) return [];
    return [{ date, value: sample.price }];
  });
}

export function matchesQuery(haystack: string, query: string): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = haystack.toLowerCase();
  return tokens.every((token) => hay.includes(token));
}
