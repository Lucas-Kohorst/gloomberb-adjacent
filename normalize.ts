import type {
  AdjacentFiling,
  AdjacentIndex,
  AdjacentIndexRow,
  AdjacentNewsArticle,
  AdjacentPriceSample,
  AdjacentRate,
  AdjacentRateRow,
  AdjacentRateSource,
  CftcFiling,
  CftcFilingDetail,
  CftcPage,
  PricePoint,
} from "./types";

function stringField(item: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function numberField(item: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

export function unwrapList<T>(raw: unknown, idKey: string): T[] {
  const rows = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)
      ? (raw as { data: unknown[] }).data
      : [];
  return rows.filter((row): row is T => (
    !!row && typeof row === "object" && typeof (row as Record<string, unknown>)[idKey] === "string"
  ));
}

export function unwrapPriceSamples(raw: unknown): AdjacentPriceSample[] {
  const rows = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? Array.isArray((raw as { data?: unknown }).data)
        ? (raw as { data: unknown[] }).data
        : Array.isArray((raw as { points?: unknown }).points)
          ? (raw as { points: unknown[] }).points
          : []
      : [];
  const samples: AdjacentPriceSample[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const timestamp = stringField(item, "timestamp", "time", "date");
    const price = numberField(item, "price", "close", "value");
    if (!timestamp || price == null) continue;
    samples.push({ timestamp, price });
  }
  return samples;
}

export function normalizeIndex(index: AdjacentIndex): AdjacentIndexRow {
  return {
    id: index.index_id,
    ticker: index.ticker?.trim() || index.index_id.toUpperCase(),
    name: index.name,
    value: index.latest_price,
    change1d: index.change_1d ?? null,
    change7d: index.change_7d ?? null,
    category: index.office_category ?? undefined,
  };
}

function normalizeSources(sources: AdjacentRate["sources"]): AdjacentRateSource[] {
  if (!sources) return [];
  return sources.filter((source) => typeof source?.market_id === "string" && source.market_id.length > 0);
}

export function normalizeRate(rate: AdjacentRate): AdjacentRateRow {
  return {
    id: rate.rate_id,
    name: rate.name,
    value: rate.latest_price ?? null,
    spread: rate.spread ?? null,
    change1d: rate.price_change_1d ?? null,
    sources: normalizeSources(rate.sources),
  };
}

export function samplesToPoints(samples: AdjacentPriceSample[]): PricePoint[] {
  const points = samples.flatMap((sample) => {
    if (sample.price == null) return [];
    const date = new Date(sample.timestamp);
    if (!Number.isFinite(date.getTime())) return [];
    return [{ date, value: sample.price }];
  });
  points.sort((left, right) => left.date.getTime() - right.date.getTime());
  return points;
}

/** Related news is `{ data: [...] }` on the live API and `{ news: [...] }` on older payloads. */
export function unwrapNews(raw: unknown): AdjacentNewsArticle[] {
  if (!raw || typeof raw !== "object") return [];
  const record = raw as Record<string, unknown>;
  const rows = Array.isArray(record.news)
    ? record.news
    : Array.isArray(record.data)
      ? record.data
      : [];
  const articles: AdjacentNewsArticle[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const id = stringField(item, "article_id", "id");
    const title = stringField(item, "title");
    const url = stringField(item, "url");
    if (!id || !title || !url) continue;
    articles.push({
      id,
      title,
      url,
      source: stringField(item, "source") ?? "Adjacent",
      summary: stringField(item, "summary", "via_market_question"),
      publishedAt: stringField(item, "published_at", "published_date") ?? "",
    });
  }
  return articles;
}

export function unwrapFilings(raw: unknown): AdjacentFiling[] {
  if (!raw || typeof raw !== "object") return [];
  const record = raw as Record<string, unknown>;
  const rows = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.filings)
      ? record.filings
      : [];
  const filings: AdjacentFiling[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const rawId = item.filing_id ?? item.id;
    const id = typeof rawId === "number" ? rawId : typeof rawId === "string" ? Number(rawId) : Number.NaN;
    const title = stringField(item, "title");
    if (!Number.isFinite(id) || !title) continue;
    filings.push({
      id,
      title,
      orgCode: stringField(item, "org_code") ?? "",
      status: stringField(item, "status") ?? "",
      statusDate: stringField(item, "status_date"),
      url: stringField(item, "url", "link"),
    });
  }
  return filings;
}

function recordOf(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value));
}

function finiteId(value: unknown): number | null {
  const id = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(id) ? id : null;
}

export function parseCftcFiling(value: unknown): CftcFiling | null {
  const item = recordOf(value);
  if (!item) return null;
  const id = finiteId(item.filing_id ?? item.id);
  const title = stringField(item, "title");
  if (id == null || !title) return null;
  return {
    id,
    title,
    feed: stringField(item, "feed") ?? "",
    orgCode: stringField(item, "org_code") ?? "",
    status: stringField(item, "status") ?? "",
    statusDate: stringField(item, "status_date"),
    receiptDate: stringField(item, "receipt_date"),
    predictedEffectiveDate: stringField(item, "predicted_effective_date"),
    docCount: numberField(item, "doc_count") ?? 0,
    description: stringField(item, "description"),
    productName: stringField(item, "product_name"),
    productType: stringField(item, "product_type"),
    category: stringField(item, "category"),
    subcategory: stringField(item, "subcategory"),
    productsAffected: stringField(item, "products_affected"),
    remarks: stringField(item, "remarks"),
    firstSeenAt: stringField(item, "first_seen_at"),
    lastSeenAt: stringField(item, "last_seen_at"),
  };
}

function cftcSourceUrl(markdown: string): string | null {
  const match = /https:\/\/www\.cftc\.gov\/[^\s)]+/.exec(markdown);
  return match?.[0] ?? null;
}

export function unwrapCftcPage(raw: unknown): CftcPage {
  const record = recordOf(raw);
  const rows = record && Array.isArray(record.data) ? record.data : [];
  const filings = rows.map(parseCftcFiling).filter((row): row is CftcFiling => row !== null);
  const meta = record ? recordOf(record.meta) : null;
  const page = meta ? numberField(meta, "page") ?? 1 : 1;
  const perPage = meta ? numberField(meta, "per_page") ?? filings.length : filings.length;
  const totalPages = meta ? numberField(meta, "total_pages") : null;
  const total = meta ? numberField(meta, "total") : null;
  const hasNext = meta?.has_next === true
    || (totalPages != null && page < totalPages)
    || (total != null && perPage > 0 && page * perPage < total);
  return { filings, page, perPage, hasNext };
}

export function unwrapCftcDetail(raw: unknown): CftcFilingDetail | null {
  const record = recordOf(raw);
  if (!record) return null;
  const filing = parseCftcFiling(record.filing);
  if (!filing) return null;
  const markdown = stringField(record, "markdown") ?? "";
  return {
    filing,
    markdown,
    sourceUrl: stringField(record, "source_url") ?? cftcSourceUrl(markdown),
  };
}

export function matchesQuery(haystack: string, query: string): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = haystack.toLowerCase();
  return tokens.every((token) => hay.includes(token));
}
