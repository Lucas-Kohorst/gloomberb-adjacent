import { createThrottledFetch } from "gloomberb/utils";
import type {
  AdjacentConstituent,
  AdjacentFiling,
  AdjacentIndex,
  AdjacentNewsArticle,
  AdjacentPriceSample,
  AdjacentRate,
  CftcFilingDetail,
  CftcPage,
} from "./types";
import { unwrapCftcDetail, unwrapCftcPage, unwrapFilings, unwrapList, unwrapNews, unwrapPriceSamples } from "./normalize";

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

const DETAIL_FRESH_MS = 60_000;

export class AdjacentClient {
  private readonly cache = new Map<string, { at: number; value: unknown }>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly apiKey: string | null,
    private readonly track: RequestTracker = (_operation, run) => run(),
  ) {}

  get isPublic(): boolean {
    return !this.apiKey;
  }

  /** Drop cached detail for one id so a reload fetches it again. */
  invalidate(id: string): void {
    const token = encodeURIComponent(id);
    for (const key of this.cache.keys()) {
      if (key.includes(token)) this.cache.delete(key);
    }
  }

  private cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < DETAIL_FRESH_MS) return Promise.resolve(hit.value as T);
    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<T>;
    const request = load().then(
      (value) => {
        this.cache.set(key, { at: Date.now(), value });
        this.inflight.delete(key);
        return value;
      },
      (error: unknown) => {
        this.inflight.delete(key);
        throw error;
      },
    );
    this.inflight.set(key, request);
    return request;
  }

  private path(kind: "indices" | "rates"): string {
    return this.isPublic ? `/public/${kind}` : `/${kind}`;
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
    const path = `${this.path("indices")}/${encodeURIComponent(id)}/prices?interval=1d`;
    return this.cached(path, async () => unwrapPriceSamples(await this.get(path)));
  }

  async getRatePrices(id: string): Promise<AdjacentPriceSample[]> {
    const path = `${this.path("rates")}/${encodeURIComponent(id)}/prices?interval=1d`;
    return this.cached(path, async () => unwrapPriceSamples(await this.get(path)));
  }

  async getConstituents(id: string): Promise<AdjacentConstituent[]> {
    const path = `${this.path("indices")}/${encodeURIComponent(id)}/constituents`;
    return this.cached(path, async () => (
      unwrapList<AdjacentConstituent>(await this.get(path), "market_id")
    ));
  }

  /**
   * Related news for one index. Public `per_page` is capped at 3 by the server.
   * Keyed requests ask for 40.
   */
  async getIndexNews(id: string): Promise<AdjacentNewsArticle[]> {
    const perPage = this.isPublic ? 3 : 40;
    const path = `${this.path("indices")}/${encodeURIComponent(id)}/news?per_page=${perPage}`;
    return this.cached(path, async () => unwrapNews(await this.get(path)));
  }

  /**
   * Related filings. There is no public twin of this route, so a public client
   * refuses before any request.
   */
  async getIndexFilings(id: string): Promise<AdjacentFiling[]> {
    if (this.isPublic) {
      throw new Error("Related filings need an Adjacent API key.");
    }
    const path = `/indices/${encodeURIComponent(id)}/filings?per_page=40`;
    return this.cached(path, async () => unwrapFilings(await this.get(path)));
  }

  /** CFTC industry filings. The public route is the catalog; a key uses the private twin. */
  private filingsPath(): string {
    return this.isPublic ? "/public/filings" : "/filings";
  }

  async listFilings(query: { search?: string; page?: number; perPage?: number } = {}): Promise<CftcPage> {
    const params = new URLSearchParams();
    const search = query.search?.trim();
    if (search) params.set("search", search);
    if (query.page && query.page > 1) params.set("page", String(query.page));
    const perPage = Math.min(Math.max(query.perPage ?? 100, 1), 100);
    params.set("per_page", String(perPage));
    params.set("sort", "first_seen");
    params.set("sort_dir", "desc");
    return unwrapCftcPage(await this.get(`${this.filingsPath()}?${params.toString()}`));
  }

  async getFilingDetail(id: number): Promise<CftcFilingDetail | null> {
    const path = `${this.filingsPath()}/${encodeURIComponent(String(id))}/markdown`;
    return this.cached(path, async () => {
      try {
        return unwrapCftcDetail(await this.get(path));
      } catch (error) {
        if (error instanceof Error && error.message.includes("(404)")) return null;
        throw error;
      }
    });
  }
}
