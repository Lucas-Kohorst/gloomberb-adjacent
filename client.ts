import { createThrottledFetch } from "gloomberb/utils";
import type {
  AdjacentConstituent,
  AdjacentIndex,
  AdjacentPriceSample,
  AdjacentRate,
} from "./types";
import { unwrapList, unwrapPriceSamples } from "./normalize";

/**
 * Reports a request into the host's connection health. The plugin passes
 * `ctx.connectionHealth.track` bound to its source id; a headless caller with
 * no host context leaves it out and the request runs untracked.
 */
export type RequestTracker = <T>(operation: string, run: () => Promise<T>) => Promise<T>;

const BASE_URL = "https://api.adjacent.markets/api/v1";

const fetchJson = createThrottledFetch({
  requestsPerMinute: 60,
  maxRetries: 2,
  timeoutMs: 10_000,
  backoffBaseMs: 500,
  dedupeGetRequests: true,
  defaultHeaders: {
    Accept: "application/json",
    "User-Agent": "gloomberb-adjacent",
  },
});

export class AdjacentClient {
  constructor(
    private readonly apiKey: string | null,
    private readonly track: RequestTracker = (_operation, run) => run(),
  ) {}

  private publicMode(): boolean {
    return !this.apiKey;
  }

  private path(kind: "indices" | "rates"): string {
    return this.publicMode() ? `/public/${kind}` : `/${kind}`;
  }

  private headers(): Record<string, string> {
    return this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {};
  }

  private async get<T>(path: string): Promise<T> {
    return this.track("fetch", async () => {
      const response = await fetchJson.fetch(`${BASE_URL}${path}`, { headers: this.headers() });
      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? "Adjacent request unauthorized."
            : `Adjacent request failed (${response.status}).`,
        );
      }
      return JSON.parse(await response.text()) as T;
    });
  }

  async listIndices(): Promise<AdjacentIndex[]> {
    return unwrapList<AdjacentIndex>(await this.get(this.path("indices")), "index_id");
  }

  async listRates(): Promise<AdjacentRate[]> {
    return unwrapList<AdjacentRate>(await this.get(this.path("rates")), "rate_id");
  }

  async getIndexPrices(id: string): Promise<AdjacentPriceSample[]> {
    return unwrapPriceSamples(await this.get(`${this.path("indices")}/${encodeURIComponent(id)}/prices`));
  }

  async getRatePrices(id: string): Promise<AdjacentPriceSample[]> {
    return unwrapPriceSamples(await this.get(`${this.path("rates")}/${encodeURIComponent(id)}/prices`));
  }

  async getConstituents(id: string): Promise<AdjacentConstituent[]> {
    return unwrapList<AdjacentConstituent>(
      await this.get(`${this.path("indices")}/${encodeURIComponent(id)}/constituents`),
      "market_id",
    );
  }
}
