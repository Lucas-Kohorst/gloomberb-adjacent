import { describe, expect, test } from "bun:test";
import { priceColor } from "gloomberb/theme";
import { resolveAdjacentSeries } from "./series";

describe("resolveAdjacentSeries", () => {
  test("sorts the window, colors the line by the move, and uses the right axis", async () => {
    const client = {
      async getIndexPrices() {
        return [
          { timestamp: "2026-10-02T00:00:00Z", price: 90 },
          { timestamp: "2026-07-05T00:00:00Z", price: 100 },
        ];
      },
      async getRatePrices() {
        return [];
      },
    };
    const series = await resolveAdjacentSeries(client, "ADJ:hou_nti");
    expect(series.axis).toBe("right");
    expect(series.style).toBe("line");
    expect(series.points.map((point) => point.value)).toEqual([100, 90]);
    expect(series.color).toBe(priceColor(-10));
  });
});
