import { describe, expect, test } from "bun:test";
import { matchesQuery, normalizeIndex, normalizeRate, samplesToPoints, unwrapFilings, unwrapList, unwrapNews, unwrapPriceSamples } from "./normalize";

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
      sources: [],
    });
  });

  test("sorts price samples oldest first", () => {
    const points = samplesToPoints([
      { timestamp: "2026-10-02T00:00:00Z", price: 98 },
      { timestamp: "2026-07-05T00:00:00Z", price: 74 },
    ]);
    expect(points.map((point) => point.value)).toEqual([74, 98]);
  });

  test("reads related news from data or news, including article_id rows", () => {
    const article = {
      article_id: "hou-1",
      title: "Texans injury report",
      url: "https://example.com/texans",
      source: "USA Today",
      published_date: "2026-09-25T17:42:11Z",
      via_market_question: "Will Houston win at least 3 games?",
    };
    expect(unwrapNews({ data: [article] })).toEqual([{
      id: "hou-1",
      title: "Texans injury report",
      url: "https://example.com/texans",
      source: "USA Today",
      summary: "Will Houston win at least 3 games?",
      publishedAt: "2026-09-25T17:42:11Z",
    }]);
    expect(unwrapNews({ news: [article] })).toHaveLength(1);
  });

  test("reads filings from filing_id", () => {
    expect(unwrapFilings({
      data: [{
        filing_id: 63380,
        title: "NFL Starter Designation Contracts",
        org_code: "QCEX",
        status: "Certified",
        status_date: "2026-08-25",
      }],
    })).toEqual([{
      id: 63380,
      title: "NFL Starter Designation Contracts",
      orgCode: "QCEX",
      status: "Certified",
      statusDate: "2026-08-25",
      url: null,
    }]);
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
