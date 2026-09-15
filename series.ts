import type { ChartSeriesCatalogItem } from "gloomberb/capabilities";
import { colors } from "gloomberb/theme";
import type { ResolvedSeries } from "gloomberb/time-series";
import type { AdjacentClient } from "./client";
import { normalizeIndex, normalizeRate, samplesToPoints } from "./normalize";

/** A catalog row plus the text the search matches against, which the host does not need. */
export interface AdjacentCatalogEntry extends ChartSeriesCatalogItem {
  searchText: string;
}

export function catalogEntry(kind: "index" | "rate", id: string, label: string, extra = ""): AdjacentCatalogEntry {
  return {
    seriesId: `ADJ:${id}`,
    label,
    description: kind === "index" ? "Adjacent prediction-market index" : "Adjacent reference rate",
    detail: "Adjacent",
    searchText: [id, label, extra, "adjacent", kind].join(" "),
  };
}

/** What the host's catalog receives: the entry without the search text. */
export function toCatalogItem(entry: AdjacentCatalogEntry): ChartSeriesCatalogItem {
  const { searchText: _searchText, ...item } = entry;
  return item;
}

export async function loadCatalogEntries(client: AdjacentClient): Promise<AdjacentCatalogEntry[]> {
  const [indices, rates] = await Promise.all([
    client.listIndices().catch(() => []),
    client.listRates().catch(() => []),
  ]);
  return [
    ...indices.map((index) => {
      const row = normalizeIndex(index);
      return catalogEntry("index", row.id, `${row.ticker}  ${row.name}`, row.category ?? "");
    }),
    ...rates.map((rate) => {
      const row = normalizeRate(rate);
      return catalogEntry("rate", row.id, row.name);
    }),
  ];
}

export async function resolveAdjacentSeries(
  client: AdjacentClient,
  seriesId: string,
): Promise<ResolvedSeries> {
  const id = seriesId.replace(/^ADJ:/i, "").trim();
  let points = samplesToPoints(await client.getIndexPrices(id).catch(() => []));
  let kind: "index" | "rate" = "index";
  if (points.length === 0) {
    points = samplesToPoints(await client.getRatePrices(id).catch(() => []));
    kind = "rate";
  }
  return {
    id: `ADJ:${id}`,
    label: id,
    // The host rejects an empty colour; the chart recolours per slot anyway.
    color: colors.textBright,
    unit: kind === "index" ? "index" : "percent",
    unitGroup: kind === "index" ? "level" : "percent",
    nativeFrequency: "daily",
    dataShape: "scalar",
    style: "line",
    transform: "raw",
    axis: "left",
    panelId: "main",
    interpolation: "none",
    points: points.map((point) => ({
      date: point.date,
      observedAt: point.date,
      value: point.value,
      provenance: { providerId: "adjacent", quality: "reported" },
    })),
  };
}
