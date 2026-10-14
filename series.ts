import type { ChartSeriesCatalogItem } from "gloomberb/capabilities";
import type { ResolvedSeries } from "gloomberb/time-series";
import { priceColor } from "gloomberb/theme";
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
    description: kind === "index" ? "Prediction-market index" : "Reference rate",
    detail: kind,
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
  client: Pick<AdjacentClient, "getIndexPrices" | "getRatePrices">,
  seriesId: string,
): Promise<ResolvedSeries> {
  const id = seriesId.replace(/^ADJ:/i, "").trim();
  const [indexPoints, ratePoints] = await Promise.all([
    client.getIndexPrices(id).then(samplesToPoints).catch(() => []),
    client.getRatePrices(id).then(samplesToPoints).catch(() => []),
  ]);
  const kind: "index" | "rate" = indexPoints.length > 0 ? "index" : "rate";
  const points = kind === "index" ? indexPoints : ratePoints;
  const first = points[0]?.value ?? 0;
  const last = points[points.length - 1]?.value ?? first;
  return {
    id: `ADJ:${id}`,
    label: id,
    color: priceColor(last - first),
    unit: kind === "index" ? "index" : "percent",
    unitGroup: kind === "index" ? "level" : "percent",
    nativeFrequency: "daily",
    dataShape: "scalar",
    style: "line",
    transform: "raw",
    axis: "right",
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
