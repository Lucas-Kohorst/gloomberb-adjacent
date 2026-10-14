import { formatPercentRaw } from "gloomberb/utils";
import type { AdjacentIndexRow, AdjacentNewsArticle, AdjacentRateRow, PricePoint } from "./types";

const MIN_CLOSES = 3;
const NO_CLOSES = "No daily closes.";

export type SeriesKind = "index" | "rate";

export interface ListCursor {
  selectedId: string | null;
  openId: string | null;
  sort: { column: string; direction: "asc" | "desc" };
  query: string;
}

export interface Close {
  date: Date;
  value: number;
}

export type History =
  | { status: "pending"; closes: readonly Close[] }
  | { status: "ready"; closes: readonly Close[] }
  | { status: "short"; closes: readonly Close[] }
  | { status: "failed"; closes: readonly Close[] };

export interface Figure {
  id: "level" | "1d" | "7d" | "spread";
  label: string;
  value: string;
}

export interface Band {
  seriesLabel: string;
  closes: readonly Close[];
  loading: boolean;
  empty?: string;
  formatValue: (value: number) => string;
  formatAxisValue: (value: number, domain: { min: number; max: number }) => string;
}

export interface OpenTarget {
  url: string;
}

export type BreakdownTab = "constituents" | "news" | "filings" | "sources";

export interface Breakdown {
  kind: SeriesKind;
  id: string;
  title: string;
  description: string | null;
  tabs: readonly BreakdownTab[];
}

export interface BoardView<Row> {
  rows: readonly Row[];
  figures: readonly Figure[];
  band: Band;
  breakdown: Breakdown | null;
  /** Null omits `o`. */
  openTarget: OpenTarget | null;
}

export interface Story {
  id: string;
  source: string;
  title: string;
  publishedAt: string;
  summary: string | null;
  url: string | null;
}

export interface FeedItem {
  id: string;
  eyebrow: string;
  title: string;
  timestamp: string;
  detailTitle: string;
  detailMeta: string[];
  detailBody: string;
}

export interface FilingText {
  title: string;
  meta: readonly string[];
  body: string;
  sourceUrl: string | null;
}

export interface FilingFacts {
  title: string;
  org: string;
  kind: string;
  status: string;
  day: string;
  description: string | null;
  sourceUrl: string | null;
}

export function closesFromPoints(points: readonly PricePoint[]): Close[] {
  return points.flatMap((point) => (
    Number.isFinite(point.date.getTime()) && Number.isFinite(point.value)
      ? [{ date: point.date, value: point.value }]
      : []
  ));
}

export function historyFromPoints(
  points: readonly PricePoint[],
  status: "pending" | "settled" | "failed",
): History {
  const closes = closesFromPoints(points);
  if (status === "pending") return { status: "pending", closes };
  if (status === "failed") return { status: "failed", closes };
  return closes.length >= MIN_CLOSES
    ? { status: "ready", closes }
    : { status: "short", closes };
}

function levelText(value: number | null): string {
  return value == null ? "—" : value.toFixed(2);
}

function changeText(value: number | null): string {
  return value == null ? "—" : formatPercentRaw(value);
}

function indexFigures(row: AdjacentIndexRow | null): Figure[] {
  return [
    { id: "level", label: "Level", value: levelText(row?.value ?? null) },
    { id: "1d", label: "1D", value: changeText(row?.change1d ?? null) },
    { id: "7d", label: "7D", value: changeText(row?.change7d ?? null) },
  ];
}

function rateFigures(row: AdjacentRateRow | null): Figure[] {
  return [
    { id: "level", label: "Level", value: levelText(row?.value ?? null) },
    { id: "1d", label: "1D", value: changeText(row?.change1d ?? null) },
    { id: "spread", label: "Spread", value: levelText(row?.spread ?? null) },
  ];
}

const formatLevel = (value: number) => value.toFixed(2);

function axisDigits(span: number): number {
  if (!Number.isFinite(span) || span >= 10) return 0;
  if (span >= 1) return 1;
  if (span >= 0.1) return 2;
  return 3;
}

function formatAxis(value: number, domain: { min: number; max: number }): string {
  return value.toFixed(axisDigits(Math.abs(domain.max - domain.min)));
}

function bandFor(label: string, history: History): Band {
  const drawable = history.status === "ready" || (history.status === "failed" && history.closes.length >= MIN_CLOSES);
  const pending = history.status === "pending" && history.closes.length < MIN_CLOSES;
  return {
    seriesLabel: label,
    closes: drawable || history.status === "pending" ? history.closes : [],
    loading: pending,
    empty: drawable ? undefined : NO_CLOSES,
    formatValue: formatLevel,
    formatAxisValue: formatAxis,
  };
}

function indexTitle(row: AdjacentIndexRow): string {
  return `${row.ticker}  ${row.name}`;
}

export function listedBoard(
  kind: "index",
  rows: readonly AdjacentIndexRow[],
  cursor: ListCursor,
  history: History,
  focus?: OpenTarget | null,
): BoardView<AdjacentIndexRow>;
export function listedBoard(
  kind: "rate",
  rows: readonly AdjacentRateRow[],
  cursor: ListCursor,
  history: History,
  focus?: OpenTarget | null,
): BoardView<AdjacentRateRow>;
export function listedBoard(
  kind: SeriesKind,
  rows: readonly (AdjacentIndexRow | AdjacentRateRow)[],
  cursor: ListCursor,
  history: History,
  focus?: OpenTarget | null,
): BoardView<AdjacentIndexRow | AdjacentRateRow> {
  const selected = rows.find((row) => row.id === cursor.selectedId) ?? rows[0] ?? null;
  const open = cursor.openId ? rows.find((row) => row.id === cursor.openId) ?? null : null;
  const label = selected
    ? "ticker" in selected ? selected.ticker : selected.name
    : "";
  const figures = kind === "index"
    ? indexFigures(selected && "ticker" in selected ? selected : null)
    : rateFigures(selected && !("ticker" in selected) ? selected : null);
  const breakdown = open
    ? {
      kind,
      id: open.id,
      title: "ticker" in open ? indexTitle(open) : open.name,
      description: null,
      tabs: kind === "index"
        ? ["constituents", "news", "filings"] as const
        : ["sources"] as const,
    }
    : null;
  return {
    rows,
    figures,
    band: bandFor(label || "—", history),
    breakdown,
    openTarget: focus?.url ? focus : null,
  };
}

export function storyStack(
  stories: readonly Story[],
  openId: string | null,
): { items: FeedItem[]; openTarget: OpenTarget | null } {
  const items = stories.map((story) => ({
    id: story.id,
    eyebrow: story.source,
    title: story.title,
    timestamp: story.publishedAt,
    detailTitle: story.title,
    detailMeta: story.source ? [story.source] : [],
    detailBody: story.summary?.trim() || "No summary.",
  }));
  const open = openId ? stories.find((story) => story.id === openId) : null;
  return {
    items,
    openTarget: open?.url ? { url: open.url } : null,
  };
}

export function storyFromArticle(article: AdjacentNewsArticle): Story {
  return {
    id: article.id,
    source: article.source,
    title: article.title,
    publishedAt: article.publishedAt,
    summary: article.summary,
    url: article.url,
  };
}

export function filingText(facts: FilingFacts, markdown: string | null): FilingText {
  const meta = [facts.org, facts.kind, facts.status, facts.day].filter((part) => part.length > 0);
  const body = markdown?.trim() || facts.description?.trim() || "No filing text.";
  return {
    title: facts.title,
    meta,
    body,
    sourceUrl: facts.sourceUrl,
  };
}
