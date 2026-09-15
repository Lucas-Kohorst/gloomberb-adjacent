import { chartSeriesProvider } from "gloomberb/capabilities";
import type { GloomPlugin, GloomPluginContext, HeadlessPaneDefinition, PaneTemplateCreateOptions } from "gloomberb/types/plugin";
import { AdjacentIndicesPane } from "./indices";
import { AdjacentRatesPane } from "./rates";
import { AdjacentClient } from "./client";
import { loadCatalogEntries, resolveAdjacentSeries, toCatalogItem } from "./series";
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

function clientFrom(ctx: GloomPluginContext): AdjacentClient {
  const stored = ctx.configState.get<string>(API_KEY_CONFIG);
  return new AdjacentClient(
    stored || process.env.ADJACENT_API_KEY || null,
    (operation, run) => ctx.connectionHealth.track(CONNECTION_ID, operation, run),
  );
}

export const adjacentIndicesPlugin: GloomPlugin = {
  id: PLUGIN_ID,
  name: "Adjacent Indices",
  version: "0.1.0",
  description: "Adjacent prediction-market indices and reference rates.",
  toggleable: true,
  hosts: ["api.adjacent.markets"],
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
      description: "Browse Adjacent prediction-market indices (RED, BLUE, NTI, house). Chart one with G CAP:adjacent-indices:ADJ:red.",
      keywords: ["adjacent", "indices", "prediction", "markets", "red", "blue", "nti", "house"],
      shortcut: { prefix: "ADI", argPlaceholder: "ticker or name", argKind: "text", argOptional: true },
      createInstance: templateInstance,
    },
    {
      id: "adjacent-rates-pane",
      paneId: "adjacent-rates",
      label: "Adjacent Reference Rates",
      description: "Cross-platform prediction market reference rates. Chart one with G CAP:adjacent-indices:ADJ:house.",
      keywords: ["adjacent", "rates", "reference", "prediction", "markets"],
      shortcut: { prefix: "ADR", argPlaceholder: "rate", argKind: "text", argOptional: true },
      createInstance: templateInstance,
    },
  ],
  setup(ctx) {
    // Shows up in the Connections pane, and every request the client makes
    // reports its outcome there.
    ctx.connectionHealth.registerSource({
      id: CONNECTION_ID,
      name: "Adjacent",
      kind: "api",
      ownerId: PLUGIN_ID,
    });

    // `G CAP:adjacent-indices:ADJ:red` and the chart composer's series search
    // resolve through this.
    ctx.registerCapability(chartSeriesProvider({
      id: PLUGIN_ID,
      name: "Adjacent",
      provider: {
        async catalog() {
          return (await loadCatalogEntries(clientFrom(ctx))).map(toCatalogItem);
        },
        async search({ query, limit }) {
          const tokens = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
          if (tokens.length === 0) return [];
          const entries = await loadCatalogEntries(clientFrom(ctx));
          const matches = entries
            .filter((entry) => tokens.every((token) => entry.searchText.toLowerCase().includes(token)))
            .map(toCatalogItem);
          return limit ? matches.slice(0, limit) : matches;
        },
        resolve: ({ seriesId }) => resolveAdjacentSeries(clientFrom(ctx), seriesId),
      },
    }));

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
  },
};

export default adjacentIndicesPlugin;
