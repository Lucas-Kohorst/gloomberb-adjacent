import { describe, expect, test } from "bun:test";
import { filingText, historyFromPoints, listedBoard, storyStack, type ListCursor } from "./board";
import type { AdjacentIndexRow, AdjacentRateRow, PricePoint } from "./types";

function day(iso: string, value: number): PricePoint {
  return { date: new Date(iso), value };
}

const cursor: ListCursor = {
  selectedId: "red",
  openId: null,
  sort: { column: "chg1d", direction: "desc" },
  query: "",
};

const red: AdjacentIndexRow = {
  id: "red",
  ticker: "RED",
  name: "Red",
  value: 108.4,
  change1d: 0.012,
  change7d: -0.02,
};

describe("historyFromPoints", () => {
  test("two closes are short, not a line", () => {
    const history = historyFromPoints([day("2026-09-01", 1), day("2026-09-02", 2)], "settled");
    expect(history.status).toBe("short");
  });

  test("three closes are ready", () => {
    const history = historyFromPoints([
      day("2026-09-01", 1),
      day("2026-09-02", 2),
      day("2026-09-03", 3),
    ], "settled");
    expect(history.status).toBe("ready");
    expect(history.closes).toHaveLength(3);
  });

  test("a failed refresh keeps the closes it already had", () => {
    const history = historyFromPoints([
      day("2026-09-01", 1),
      day("2026-09-02", 2),
      day("2026-09-03", 3),
    ], "failed");
    expect(history.status).toBe("failed");
    expect(history.closes).toHaveLength(3);
  });
});

describe("listedBoard", () => {
  test("an index band is named for the selected ticker and shows 7D", () => {
    const board = listedBoard("index", [red], cursor, historyFromPoints([
      day("2026-09-01", 100),
      day("2026-09-02", 101),
      day("2026-09-03", 102),
    ], "settled"));
    expect(board.band.seriesLabel).toBe("RED");
    expect(board.band.empty).toBeUndefined();
    expect(board.band.loading).toBe(false);
    expect(board.figures.map((figure) => figure.id)).toEqual(["level", "1d", "7d"]);
    expect(board.openTarget).toBeNull();
  });

  test("fewer than three closes keeps the band and does not draw", () => {
    const board = listedBoard("index", [red], cursor, historyFromPoints([
      day("2026-09-01", 100),
      day("2026-09-02", 101),
    ], "settled"));
    expect(board.band.empty).toBe("No daily closes.");
    expect(board.band.closes).toEqual([]);
    expect(board.band.loading).toBe(false);
  });

  test("a pending row with no closes holds the band", () => {
    const board = listedBoard("index", [red], cursor, historyFromPoints([], "pending"));
    expect(board.band.loading).toBe(true);
    expect(board.band.empty).toBe("No daily closes.");
  });

  test("a rate figure set is level, 1D, and spread", () => {
    const house: AdjacentRateRow = {
      id: "house",
      name: "House",
      value: 0.42,
      spread: 0.03,
      change1d: -0.01,
      sources: [],
    };
    const board = listedBoard("rate", [house], { ...cursor, selectedId: "house" }, historyFromPoints([], "pending"));
    expect(board.figures.map((figure) => figure.label)).toEqual(["Level", "1D", "Spread"]);
    expect(board.band.seriesLabel).toBe("House");
    expect(board.breakdown).toBeNull();
  });

  test("a list row has no URL, so o stays off until a story is focused", () => {
    const closed = listedBoard("index", [red], cursor, historyFromPoints([], "settled"));
    expect(closed.openTarget).toBeNull();
    const open = listedBoard("index", [red], { ...cursor, openId: "red" }, historyFromPoints([], "settled"), {
      url: "https://example.com/story",
    });
    expect(open.openTarget).toEqual({ url: "https://example.com/story" });
    expect(open.breakdown?.tabs).toEqual(["constituents", "news", "filings"]);
  });
});

describe("storyStack", () => {
  test("feed items have no url, and o is the open story", () => {
    const stack = storyStack([
      {
        id: "a",
        source: "Wire",
        title: "Move",
        publishedAt: "2026-09-01",
        summary: "Why it moved.",
        url: "https://example.com/a",
      },
    ], "a");
    expect(stack.items[0]).not.toHaveProperty("url");
    expect(stack.items[0]?.detailBody).toBe("Why it moved.");
    expect(stack.openTarget).toEqual({ url: "https://example.com/a" });
  });

  test("a missing summary is one line", () => {
    const stack = storyStack([
      { id: "a", source: "Wire", title: "Move", publishedAt: "", summary: null, url: null },
    ], null);
    expect(stack.items[0]?.detailBody).toBe("No summary.");
    expect(stack.openTarget).toBeNull();
  });
});

describe("filingText", () => {
  test("settled prose is not a loading string", () => {
    const text = filingText({
      title: "Rule",
      org: "CFTC",
      kind: "Notice",
      status: "Posted",
      day: "2026-09-01",
      description: "Fallback.",
      sourceUrl: "https://www.cftc.gov/example",
    }, null);
    expect(text.body).toBe("Fallback.");
    expect(text.body).not.toMatch(/loading/i);
    expect(text.sourceUrl).toBe("https://www.cftc.gov/example");
  });
});
