import type { GloomPlugin, HeadlessPaneDefinition, PaneTemplateCreateOptions } from "gloomberb/types/plugin";
import { createChartSource } from "gloomberb/plugins";
import { AdjacentIndicesPane } from "./indices";
import { AdjacentRatesPane } from "./rates";
import { AdjacentClient } from "./client";
import { loadCatalogEntries, resolveAdjacentSeries } from "./series";
import { API_KEY_CONFIG, CONNECTION_ID, PLUGIN_ID } from "./types";
import { normalizeIndex, normalizeRate } from "./normalize";

function templateInstance(_context: unknown, options?: PaneTemplateCreateOptions) {
  const query = (options?.arg ?? "").trim();
  return {
    placement: "floating" as const,
    ...(query ? { params: { query }, title: query } : {}),
  };
}

const indicesHeadless = {
  shape: "rows" as const,
  argument: { kind: "none" as const, placeholder: "", description: "Lists Adjacent indices." },
  options: [],
  describe: () => "Adjacent indices",
  async load() {
    const key = process.env.ADJACENT_API_KEY ?? null;
    const rows = (await new AdjacentClient(key).listIndices()).map(normalizeIndex);
    return {
      columns: [
        { key: "ticker", header: "Ticker" },
        { key: "name", header: "Name" },
        { key: "value", header: "Value" },
        { key: "change1d", header: "1D" },
      ],
      rows: rows.map((row) => ({
        ticker: row.ticker,
        name: row.name,
        value: row.value,
        change1d: row.change1d,
      })),
    };
  },
} satisfies HeadlessPaneDefinition<"rows">;

const ratesHeadless = {
  shape: "rows" as const,
  argument: { kind: "none" as const, placeholder: "", description: "Lists Adjacent reference rates." },
  options: [],
  describe: () => "Adjacent rates",
  async load() {
    const key = process.env.ADJACENT_API_KEY ?? null;
    const rows = (await new AdjacentClient(key).listRates()).map(normalizeRate);
    return {
      columns: [
        { key: "name", header: "Rate" },
        { key: "value", header: "Value" },
        { key: "change1d", header: "1D" },
        { key: "spread", header: "Spread" },
      ],
      rows: rows.map((row) => ({
        name: row.name,
        value: row.value,
        change1d: row.change1d,
        spread: row.spread,
      })),
    };
  },
} satisfies HeadlessPaneDefinition<"rows">;

function clientFrom(ctx: { configState?: { get<T>(key: string): T | undefined } }): AdjacentClient {
  const stored = ctx.configState?.get<string>(API_KEY_CONFIG);
  return new AdjacentClient(stored || process.env.ADJACENT_API_KEY || null);
}

export const adjacentIndicesPlugin: GloomPlugin = {
  id: PLUGIN_ID,
  name: "Adjacent Indices",
  version: "0.1.0",
  description: "Adjacent prediction-market indices and reference rates.",
  toggleable: true,
  panes: [
    {
      id: "adjacent-indices",
      name: "Adjacent Indices",
      icon: "A",
      component: AdjacentIndicesPane,
      defaultPosition: "right",
      defaultMode: "floating",
      defaultFloatingSize: { width: 72, height: 30 },
      headless: indicesHeadless,
    },
    {
      id: "adjacent-rates",
      name: "Adjacent Rates",
      icon: "A",
      component: AdjacentRatesPane,
      defaultPosition: "right",
      defaultMode: "floating",
      defaultFloatingSize: { width: 60, height: 24 },
      headless: ratesHeadless,
    },
  ],
  paneTemplates: [
    {
      id: "adjacent-indices-pane",
      paneId: "adjacent-indices",
      label: "Adjacent Indices",
      description: "Browse Adjacent prediction-market indices (RED, BLUE, NTI, house). Chart one with G ADJ:red.",
      keywords: ["adjacent", "indices", "prediction", "markets", "red", "blue", "nti", "house"],
      category: "Data",
      shortcut: { prefix: "ADI", argPlaceholder: "ticker or name", argKind: "text", argOptional: true },
      createInstance: templateInstance,
    },
    {
      id: "adjacent-rates-pane",
      paneId: "adjacent-rates",
      label: "Adjacent Reference Rates",
      description: "Cross-platform prediction market reference rates. Chart one with G ADJ:house.",
      keywords: ["adjacent", "rates", "reference", "prediction", "markets"],
      category: "Data",
      shortcut: { prefix: "ADR", argPlaceholder: "rate", argKind: "text", argOptional: true },
      createInstance: templateInstance,
    },
  ],
  setup(ctx) {
    createChartSource(ctx, {
      id: PLUGIN_ID,
      name: "Adjacent",
      catalog: {
        id: PLUGIN_ID,
        name: "Adjacent",
        sourceId: PLUGIN_ID,
        minQueryLength: 2,
        assist: {
          keywords: ["adjacent", "index", "rate", "prediction"],
          examples: ["ADJ:red", "house", "nti"],
        },
        async search(query) {
          const entries = await loadCatalogEntries(clientFrom(ctx));
          const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
          return entries.filter((entry) => tokens.every((token) => entry.searchText.toLowerCase().includes(token)));
        },
      },
      resolve: (seriesId) => resolveAdjacentSeries(clientFrom(ctx), seriesId),
      connection: { kind: "api", authRequired: false },
    });

    ctx.registerCommand({
      id: "adjacent-set-api-key",
      label: "Adjacent: set API key",
      description: "Store an Adjacent API key for the authenticated catalog. Leave blank for public endpoints.",
      keywords: ["adjacent", "api", "key"],
      category: "config",
      wizard: [
        {
          key: "apiKey",
          label: "Adjacent API key",
          placeholder: "optional — blank uses public endpoints",
          type: "password",
          required: false,
        },
      ],
      execute: async (values) => {
        const next = (values?.apiKey ?? "").trim();
        await ctx.configState?.set(API_KEY_CONFIG, next);
        ctx.notify({
          body: next ? "Adjacent API key saved." : "Adjacent is using public endpoints.",
          type: "success",
        });
      },
    });

    ctx.registerAgentPromptFragment(
      "Adjacent indices: pane.createFromTemplate adjacent-indices-pane (ADI). Rates: adjacent-rates-pane (ADR). Chart with G ADJ:<id>.",
    );
  },
};

export default adjacentIndicesPlugin;
