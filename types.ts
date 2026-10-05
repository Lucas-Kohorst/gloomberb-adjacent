export const PLUGIN_ID = "adjacent-indices";
export const API_KEY_CONFIG = "adjacentApiKey";
export const CONNECTION_ID = "adjacent-indices";

export interface AdjacentIndex {
  index_id: string;
  name: string;
  ticker?: string;
  description?: string;
  office_category?: string | null;
  latest_price: number | null;
  change_1d?: number | null;
  change_7d?: number | null;
  updated_at?: string | null;
}

export interface AdjacentRate {
  rate_id: string;
  name: string;
  description?: string | null;
  latest_price: number | null;
  spread?: number | null;
  price_change_1d?: number | null;
  sources?: AdjacentRateSource[];
}

export interface AdjacentRateSource {
  market_id: string;
  display_ticker?: string;
  platform: string;
  weight: number;
  question?: string | null;
  latest_price?: number | null;
}

export interface AdjacentConstituent {
  market_id: string;
  ticker?: string;
  display_ticker?: string;
  platform: string;
  weight: number;
  price?: number | null;
  name?: string | null;
  /** Nested index sleeve vs a venue market. */
  kind?: string;
  excluded?: boolean;
}

export interface AdjacentNewsArticle {
  id: string;
  title: string;
  url: string;
  source: string;
  summary: string | null;
  publishedAt: string;
}

export interface AdjacentFiling {
  id: number;
  title: string;
  orgCode: string;
  status: string;
  statusDate: string | null;
  url: string | null;
}

export interface AdjacentPriceSample {
  timestamp: string;
  price: number | null;
}

export interface AdjacentIndexRow {
  id: string;
  ticker: string;
  name: string;
  value: number | null;
  change1d: number | null;
  change7d: number | null;
  category?: string;
}

export interface AdjacentRateRow {
  id: string;
  name: string;
  value: number | null;
  spread: number | null;
  change1d: number | null;
  sources: AdjacentRateSource[];
}

export interface PricePoint {
  date: Date;
  value: number;
}

export type AdjacentTab = "indices" | "rates" | "cftc";

export function adjacentTab(value: unknown): AdjacentTab {
  return value === "rates" || value === "cftc" ? value : "indices";
}

/** One CFTC industry filing from Adjacent's filings list. */
export interface CftcFiling {
  id: number;
  title: string;
  feed: string;
  orgCode: string;
  status: string;
  statusDate: string | null;
  receiptDate: string | null;
  predictedEffectiveDate: string | null;
  docCount: number;
  description: string | null;
  productName: string | null;
  productType: string | null;
  category: string | null;
  subcategory: string | null;
  productsAffected: string | null;
  remarks: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
}

export interface CftcPage {
  filings: CftcFiling[];
  page: number;
  perPage: number;
  hasNext: boolean;
}

export interface CftcFilingDetail {
  filing: CftcFiling;
  markdown: string;
  sourceUrl: string | null;
}
