import { chartSeriesProvider } from "gloomberb/capabilities";
import type { GloomPlugin, GloomPluginContext, HeadlessPaneDefinition, HeadlessPaneLoadArgs, PaneTemplateCreateOptions } from "gloomberb/types/plugin";
import { AdjacentPane } from "./pane";
import { AdjacentClient } from "./client";
import { filingKindLabel, formatFilingDay } from "./cftc";
import { loadCatalogEntries, resolveAdjacentSeries, toCatalogItem } from "./series";
import { adjacentTab, API_KEY_CONFIG, CONNECTION_ID, PLUGIN_ID, type AdjacentTab } from "./types";
import { matchesQuery, normalizeIndex, normalizeRate } from "./normalize";

export { registerAdjacentDetailPreload } from "./detail-preload";

function templateInstance(_context: unknown, options?: PaneTemplateCreateOptions) {
  const query = (options?.arg ?? "").trim();
  return {
    placement: "floating" as const,
    ...(query
      ? { params: { query }, settings: { defaultTabId: "indices", query }, title: query }
      : { settings: { defaultTabId: "indices" } }),
  };
}

function argumentText(argument: HeadlessPaneLoadArgs["argument"]): string {
  if (typeof argument === "string") return argument.trim();
  if (Array.isArray(argument)) return argument.join(" ").trim();
  return "";
}

const adjacentHeadless = {
  shape: "rows" as const,
  argument: {
    kind: "free-text" as const,
    placeholder: "filter",
    description: "Filters the indices, rates, or CFTC list.",
    optional: true,
  },
  options: [
    {
      key: "tab",
      description: "Which list to print.",
      type: "enum" as const,
      values: [
        { value: "indices" },
        { value: "rates" },
        { value: "cftc" },
      ],
      defaultValue: "indices",
    },
  ],
  describe: (args: HeadlessPaneLoadArgs) => `Adjacent ${adjacentTab(args.options.tab)}`,
  async load(args) {
    const tab: AdjacentTab = adjacentTab(args.options.tab);
    const query = argumentText(args.argument);
    const client = new AdjacentClient(process.env.ADJACENT_API_KEY ?? null);
    if (tab === "rates") {
      const rows = (await client.listRates()).map(normalizeRate).filter((row) => matchesQuery(`${row.name} ${row.id}`, query));
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
    }
    if (tab === "cftc") {
      const page = await client.listFilings({ search: query, perPage: 100 });
      return {
        columns: [
          { key: "org", header: "Org" },
          { key: "type", header: "Type" },
          { key: "status", header: "Status" },
          { key: "day", header: "Day" },
          { key: "title", header: "Filing" },
        ],
        rows: page.filings.map((row) => ({
          org: row.orgCode,
          type: filingKindLabel(row.feed),
          status: row.status,
          day: formatFilingDay(row.statusDate),
          title: row.title,
        })),
      };
    }
    const rows = (await client.listIndices()).map(normalizeIndex).filter((row) => matchesQuery(`${row.ticker} ${row.name} ${row.id}`, query));
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

function clientFrom(ctx: GloomPluginContext): AdjacentClient {
  const stored = ctx.configState.get<string>(API_KEY_CONFIG);
  return new AdjacentClient(
    stored || process.env.ADJACENT_API_KEY || null,
    (operation, run) => ctx.connectionHealth.track(CONNECTION_ID, operation, run),
  );
}

export const adjacentIndicesPlugin: GloomPlugin = {
  id: PLUGIN_ID,
  name: "Adjacent",
  version: "0.1.0",
  description: "Adjacent prediction-market indices, reference rates, and CFTC filings.",
  toggleable: true,
  panes: [
    {
      id: "adjacent",
      name: "Adjacent",
      icon: "A",
      component: AdjacentPane,
      defaultPosition: "right",
      defaultMode: "floating",
      defaultFloatingSize: { width: 72, height: 30 },
      headless: adjacentHeadless,
    },
  ],
  paneTemplates: [
    {
      id: "adjacent-pane",
      paneId: "adjacent",
      label: "Adjacent",
      description: "Indices, reference rates, and CFTC filings. Chart a series with G CAP:adjacent-indices:ADJ:red.",
      keywords: ["adjacent", "indices", "rates", "cftc", "filings", "prediction", "markets", "red", "blue", "nti", "house"],
      shortcut: { prefix: "ADJ", argPlaceholder: "filter", argKind: "text", argOptional: true },
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
      description: "Store an Adjacent API key. Public endpoints serve indices, rates, CFTC filings, and a short news list. Related index filings need a key.",
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
