import { describe, expect, test } from "bun:test";
import { matchesQuery, normalizeIndex, normalizeRate, samplesToPoints, unwrapList, unwrapPriceSamples } from "./normalize";

describe("adjacent normalize", () => {
  test("unwraps a { data } list", () => {
    const rows = unwrapList<{ index_id: string }>({ data: [{ index_id: "red" }] }, "index_id");
    expect(rows).toEqual([{ index_id: "red" }]);
  });

  test("reads price samples from timestamp/price or date/close", () => {
    expect(unwrapPriceSamples({
      data: [
        { timestamp: "2026-09-01T00:00:00Z", price: 104.2 },
        { date: "2026-09-02", close: "105" },
      ],
    })).toEqual([
      { timestamp: "2026-09-01T00:00:00Z", price: 104.2 },
      { timestamp: "2026-09-02", price: 105 },
    ]);
  });

  test("normalizes index and rate rows", () => {
    expect(normalizeIndex({
      index_id: "red",
      name: "Red",
      ticker: "RED",
      latest_price: 108.4,
      change_1d: 0.012,
      change_7d: -0.02,
    })).toEqual({
      id: "red",
      ticker: "RED",
      name: "Red",
      value: 108.4,
      change1d: 0.012,
      change7d: -0.02,
      category: undefined,
    });
    expect(normalizeRate({
      rate_id: "house",
      name: "House",
      latest_price: 52.1,
      spread: 0.8,
      price_change_1d: 0.01,
    })).toEqual({
      id: "house",
      name: "House",
      value: 52.1,
      spread: 0.8,
      change1d: 0.01,
    });
  });

  test("drops invalid price samples", () => {
    expect(samplesToPoints([
      { timestamp: "nope", price: 1 },
      { timestamp: "2026-09-01T00:00:00Z", price: null },
      { timestamp: "2026-09-01T00:00:00Z", price: 100 },
    ])).toHaveLength(1);
  });

  test("matches all query tokens", () => {
    expect(matchesQuery("RED House control", "red house")).toBe(true);
    expect(matchesQuery("RED House control", "blue")).toBe(false);
  });
});
