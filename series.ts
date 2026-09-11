import type { ResolvedSeries } from "gloomberb/capabilities";
import type { ChartSeriesCatalogEntry } from "gloomberb/types/plugin";
import type { AdjacentClient } from "./client";
import { normalizeIndex, normalizeRate, samplesToPoints } from "./normalize";

export function catalogEntry(kind: "index" | "rate", id: string, label: string, extra = ""): ChartSeriesCatalogEntry {
  return {
    id: `ADJ:${id}`,
    expression: `ADJ:${id}`,
    label,
    source: "Adjacent",
    searchText: [id, label, extra, "adjacent", kind].join(" "),
    description: kind === "index" ? "Adjacent prediction-market index" : "Adjacent reference rate",
    unit: kind === "index" ? "index" : "percent",
    frequency: "daily",
  };
}

export async function loadCatalogEntries(client: AdjacentClient): Promise<ChartSeriesCatalogEntry[]> {
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
    color: "",
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
