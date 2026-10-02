import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import {
  DataTableView,
  EmptyState,
  Spinner,
  Tabs,
  openUrl,
  type DataTableCell,
  type DataTableColumn,
} from "gloomberb/components";
import { colors } from "gloomberb/theme";
import { Box, Text } from "gloomberb/ui";
import { formatPercentRaw } from "gloomberb/utils";
import type { AdjacentClient } from "./client";
import { samplesToPoints } from "./normalize";
import { HistoryChart, nextSortState, type SortState } from "./shared";
import type {
  AdjacentConstituent,
  AdjacentFiling,
  AdjacentIndexRow,
  AdjacentNewsArticle,
  AdjacentRateRow,
  AdjacentRateSource,
  PricePoint,
} from "./types";

type SliceStatus = "loading" | "ready" | "error";
type IndexTab = "chart" | "constituents" | "news" | "filings";
type RateTab = "chart" | "sources";

const INDEX_TABS: { label: string; value: IndexTab }[] = [
  { label: "Chart", value: "chart" },
  { label: "Constituents", value: "constituents" },
  { label: "News", value: "news" },
  { label: "Filings", value: "filings" },
];

const RATE_TABS: { label: string; value: RateTab }[] = [
  { label: "Chart", value: "chart" },
  { label: "Sources", value: "sources" },
];

function dayLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return value.slice(0, 10) || "—";
}

function sortRows<T>(
  items: readonly T[],
  state: SortState<string>,
  value: (item: T) => string | number | null,
): T[] {
  const dir = state.direction === "asc" ? 1 : -1;
  return [...items].sort((left, right) => {
    const lv = value(left);
    const rv = value(right);
    if (lv == null && rv == null) return 0;
    if (lv == null) return 1;
    if (rv == null) return -1;
    return lv < rv ? -dir : lv > rv ? dir : 0;
  });
}

function useSlice<T>(
  client: AdjacentClient,
  id: string,
  reload: number,
  read: (client: AdjacentClient, id: string) => Promise<T[]>,
  enabled = true,
): { rows: T[]; status: SliceStatus } {
  const [rows, setRows] = useState<T[]>([]);
  const [status, setStatus] = useState<SliceStatus>(enabled ? "loading" : "ready");
  const hasRows = useRef(false);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setRows([]);
      setStatus("ready");
      hasRows.current = false;
      loadedFor.current = null;
      return;
    }
    let cancelled = false;
    const keep = hasRows.current && loadedFor.current === id;
    if (!keep) {
      hasRows.current = false;
      setRows([]);
    }
    setStatus("loading");
    void read(client, id).then((next) => {
      if (cancelled) return;
      loadedFor.current = id;
      hasRows.current = next.length > 0;
      setRows(next);
      setStatus("ready");
    }).catch(() => {
      if (cancelled) return;
      if (!keep) {
        hasRows.current = false;
        setRows([]);
      }
      setStatus("error");
    });
    return () => { cancelled = true; };
  }, [client, enabled, id, read, reload]);

  return { rows, status };
}

function SliceFrame({
  status,
  count,
  loadingLabel,
  emptyTitle,
  errorTitle,
  children,
}: {
  status: SliceStatus;
  count: number;
  loadingLabel: string;
  emptyTitle: string;
  errorTitle: string;
  children: ReactNode;
}) {
  if (status === "loading" && count === 0) {
    return (
      <Box flexGrow={1} justifyContent="center" alignItems="center">
        <Spinner label={loadingLabel} />
      </Box>
    );
  }
  if (count === 0) {
    return (
      <Box flexGrow={1} justifyContent="center" alignItems="center">
        <EmptyState
          title={status === "error" ? errorTitle : emptyTitle}
          hint={status === "error" ? "Press r to retry." : undefined}
        />
      </Box>
    );
  }
  return children;
}

function loadConstituents(client: AdjacentClient, id: string): Promise<AdjacentConstituent[]> {
  return client.getConstituents(id).then((rows) => rows.filter((row) => row.excluded !== true));
}

function loadNews(client: AdjacentClient, id: string): Promise<AdjacentNewsArticle[]> {
  return client.getIndexNews(id);
}

function loadFilings(client: AdjacentClient, id: string): Promise<AdjacentFiling[]> {
  return client.getIndexFilings(id);
}

function loadIndexPrices(client: AdjacentClient, id: string): Promise<PricePoint[]> {
  return client.getIndexPrices(id).then(samplesToPoints);
}

function loadRatePrices(client: AdjacentClient, id: string): Promise<PricePoint[]> {
  return client.getRatePrices(id).then(samplesToPoints);
}

function LevelLine({ value, change }: { value: number | null; change: number | null }) {
  return (
    <Text fg={colors.textMuted}>
      {value == null ? "—" : value.toFixed(2)}
      {change == null ? "" : `   1D ${formatPercentRaw(change)}`}
    </Text>
  );
}

export function IndexDetail({
  client,
  row,
  width,
  height,
  focused,
  onLink,
  reloadRef,
}: {
  client: AdjacentClient;
  row: AdjacentIndexRow;
  width: number;
  height: number;
  focused: boolean;
  onLink: (url: string | null) => void;
  reloadRef: MutableRefObject<() => void>;
}) {
  const [tab, setTab] = useState<IndexTab>("chart");
  const [reload, setReload] = useState({ constituents: 0, news: 0, filings: 0, prices: 0 });
  const [constituentSort, setConstituentSort] = useState<SortState<"weight" | "venue" | "name" | "price">>({
    columnId: "weight",
    direction: "desc",
  });
  const [newsSort, setNewsSort] = useState<SortState<"day" | "source" | "title">>({
    columnId: "day",
    direction: "desc",
  });
  const [filingSort, setFilingSort] = useState<SortState<"day" | "org" | "title">>({
    columnId: "day",
    direction: "desc",
  });
  const [selectedConstituentId, setSelectedConstituentId] = useState<string | null>(null);
  const [selectedNewsId, setSelectedNewsId] = useState<string | null>(null);
  const [selectedFilingId, setSelectedFilingId] = useState<string | null>(null);

  const constituents = useSlice(client, row.id, reload.constituents, loadConstituents);
  const news = useSlice(client, row.id, reload.news, loadNews);
  const filings = useSlice(client, row.id, reload.filings, loadFilings, !client.isPublic);
  const prices = useSlice(client, row.id, reload.prices, loadIndexPrices);

  reloadRef.current = () => {
    client.invalidate(row.id);
    setReload((current) => {
      if (tab === "constituents") return { ...current, constituents: current.constituents + 1 };
      if (tab === "news") return { ...current, news: current.news + 1 };
      if (tab === "filings") return { ...current, filings: current.filings + 1 };
      return { ...current, prices: current.prices + 1 };
    });
  };

  const sortedConstituents = useMemo(() => sortRows(constituents.rows, constituentSort, (item) => {
    if (constituentSort.columnId === "weight") return item.weight;
    if (constituentSort.columnId === "venue") return item.platform;
    if (constituentSort.columnId === "price") return item.price ?? null;
    return item.name ?? item.display_ticker ?? item.market_id;
  }), [constituentSort, constituents.rows]);

  const sortedNews = useMemo(() => sortRows(news.rows, newsSort, (item) => {
    if (newsSort.columnId === "source") return item.source;
    if (newsSort.columnId === "title") return item.title;
    return item.publishedAt;
  }), [news.rows, newsSort]);

  const sortedFilings = useMemo(() => sortRows(filings.rows, filingSort, (item) => {
    if (filingSort.columnId === "org") return item.orgCode;
    if (filingSort.columnId === "title") return item.title;
    return item.statusDate;
  }), [filingSort, filings.rows]);

  const selectedNews = sortedNews.find((item) => item.id === selectedNewsId) ?? sortedNews[0] ?? null;
  const selectedFiling = sortedFilings.find((item) => String(item.id) === selectedFilingId) ?? sortedFilings[0] ?? null;

  useEffect(() => {
    if (tab === "news" && selectedNews) onLink(selectedNews.url);
    else if (tab === "filings" && selectedFiling?.url) onLink(selectedFiling.url);
    else onLink(null);
  }, [onLink, selectedFiling, selectedNews, tab]);

  const bodyWidth = Math.max(20, width);
  const bodyHeight = Math.max(6, height - 3);

  return (
    <Box flexDirection="column" width={width} height={height} gap={1}>
      <LevelLine value={row.value} change={row.change1d} />
      <Tabs
        tabs={INDEX_TABS}
        activeValue={tab}
        onSelect={(value) => {
          if (value === "chart" || value === "constituents" || value === "news" || value === "filings") setTab(value);
        }}
        focused={focused}
        compact
      />
      {tab === "chart" ? (
        <SliceFrame
          status={prices.status}
          count={prices.rows.length}
          loadingLabel="Loading chart..."
          emptyTitle="No price history."
          errorTitle="Price history unavailable."
        >
          <HistoryChart points={prices.rows} width={bodyWidth} height={bodyHeight} loading={prices.status === "loading"} />
        </SliceFrame>
      ) : null}
      {tab === "constituents" ? (
        <SliceFrame
          status={constituents.status}
          count={sortedConstituents.length}
          loadingLabel="Loading constituents..."
          emptyTitle="No constituents."
          errorTitle="Constituents unavailable."
        >
          <DataTableView
            focused={focused}
            rootWidth={bodyWidth}
            rootHeight={bodyHeight}
            columns={CONSTITUENT_COLUMNS}
            items={sortedConstituents}
            getItemKey={(item) => item.market_id}
            selection={{
              kind: "id",
              selectedId: selectedConstituentId,
              getId: (item) => item.market_id,
              onChange: setSelectedConstituentId,
            }}
            sortColumnId={constituentSort.columnId}
            sortDirection={constituentSort.direction}
            onHeaderClick={(columnId) => {
              if (columnId !== "weight" && columnId !== "venue" && columnId !== "name" && columnId !== "price") return;
              setConstituentSort((current) => nextSortState(current, columnId, columnId === "name" || columnId === "venue" ? "asc" : "desc"));
            }}
            renderCell={renderConstituent}
            emptyStateTitle="No constituents."
          />
        </SliceFrame>
      ) : null}
      {tab === "news" ? (
        <SliceFrame
          status={news.status}
          count={sortedNews.length}
          loadingLabel="Loading news..."
          emptyTitle="No related news."
          errorTitle="Related news unavailable."
        >
          <DataTableView
            focused={focused}
            rootWidth={bodyWidth}
            rootHeight={bodyHeight}
            columns={NEWS_COLUMNS}
            items={sortedNews}
            getItemKey={(item) => item.id}
            selection={{
              kind: "id",
              selectedId: selectedNews?.id ?? null,
              getId: (item) => item.id,
              onChange: setSelectedNewsId,
            }}
            sortColumnId={newsSort.columnId}
            sortDirection={newsSort.direction}
            onHeaderClick={(columnId) => {
              if (columnId !== "day" && columnId !== "source" && columnId !== "title") return;
              setNewsSort((current) => nextSortState(current, columnId, columnId === "day" ? "desc" : "asc"));
            }}
            onActivate={(item) => openUrl(item.url)}
            renderCell={renderNews}
            emptyStateTitle="No related news."
          />
        </SliceFrame>
      ) : null}
      {tab === "filings" ? (
        client.isPublic ? (
          <Box flexGrow={1} justifyContent="center" alignItems="center">
            <EmptyState
              title="Related filings need an Adjacent API key."
              hint="Run Adjacent: set API key. Public index routes do not include filings."
            />
          </Box>
        ) : (
          <SliceFrame
            status={filings.status}
            count={sortedFilings.length}
            loadingLabel="Loading filings..."
            emptyTitle="No related filings."
            errorTitle="Related filings unavailable."
          >
            <DataTableView
              focused={focused}
              rootWidth={bodyWidth}
              rootHeight={bodyHeight}
              columns={FILING_COLUMNS}
              items={sortedFilings}
              getItemKey={(item) => String(item.id)}
              selection={{
                kind: "id",
                selectedId: selectedFiling ? String(selectedFiling.id) : null,
                getId: (item) => String(item.id),
                onChange: setSelectedFilingId,
              }}
              sortColumnId={filingSort.columnId}
              sortDirection={filingSort.direction}
              onHeaderClick={(columnId) => {
                if (columnId !== "day" && columnId !== "org" && columnId !== "title") return;
                setFilingSort((current) => nextSortState(current, columnId, columnId === "day" ? "desc" : "asc"));
              }}
              onActivate={(item) => {
                if (item.url) openUrl(item.url);
              }}
              renderCell={renderFiling}
              emptyStateTitle="No related filings."
            />
          </SliceFrame>
        )
      ) : null}
    </Box>
  );
}

const CONSTITUENT_COLUMNS: DataTableColumn[] = [
  { id: "weight", label: "WEIGHT", width: 7, align: "right" },
  { id: "venue", label: "VENUE", width: 10, align: "left" },
  { id: "name", label: "NAME", width: 12, align: "left", flexGrow: 1 },
  { id: "price", label: "PRICE", width: 7, align: "right" },
];

function renderConstituent(row: AdjacentConstituent, column: DataTableColumn, _index: number, rowState: { selected: boolean }): DataTableCell {
  const sel = rowState.selected ? colors.selectedText : undefined;
  const name = row.name ?? row.display_ticker ?? row.ticker ?? row.market_id;
  switch (column.id) {
    case "weight":
      return { text: `${(row.weight * 100).toFixed(1)}%`, color: sel ?? colors.textDim };
    case "venue":
      return { text: row.platform, color: sel ?? colors.textDim };
    case "name":
      return { text: name, color: sel ?? colors.text };
    case "price":
      return { text: row.price == null ? "—" : row.price.toFixed(1), color: sel ?? colors.text };
    default:
      return { text: "" };
  }
}

const NEWS_COLUMNS: DataTableColumn[] = [
  { id: "day", label: "DAY", width: 10, align: "left" },
  { id: "source", label: "SOURCE", width: 12, align: "left" },
  { id: "title", label: "TITLE", width: 12, align: "left", flexGrow: 1 },
];

function renderNews(row: AdjacentNewsArticle, column: DataTableColumn, _index: number, rowState: { selected: boolean }): DataTableCell {
  const sel = rowState.selected ? colors.selectedText : undefined;
  switch (column.id) {
    case "day":
      return { text: dayLabel(row.publishedAt), color: sel ?? colors.textDim };
    case "source":
      return { text: row.source, color: sel ?? colors.textDim };
    case "title":
      return { text: row.title, color: sel ?? colors.text };
    default:
      return { text: "" };
  }
}

const FILING_COLUMNS: DataTableColumn[] = [
  { id: "day", label: "DAY", width: 10, align: "left" },
  { id: "org", label: "ORG", width: 6, align: "left" },
  { id: "title", label: "FILING", width: 12, align: "left", flexGrow: 1 },
];

function renderFiling(row: AdjacentFiling, column: DataTableColumn, _index: number, rowState: { selected: boolean }): DataTableCell {
  const sel = rowState.selected ? colors.selectedText : undefined;
  switch (column.id) {
    case "day":
      return { text: dayLabel(row.statusDate), color: sel ?? colors.textDim };
    case "org":
      return { text: row.orgCode || "—", color: sel ?? colors.textDim };
    case "title":
      return { text: row.title, color: sel ?? colors.text };
    default:
      return { text: "" };
  }
}

export function RateDetail({
  client,
  row,
  width,
  height,
  focused,
  reloadRef,
}: {
  client: AdjacentClient;
  row: AdjacentRateRow;
  width: number;
  height: number;
  focused: boolean;
  reloadRef: MutableRefObject<() => void>;
}) {
  const [tab, setTab] = useState<RateTab>("chart");
  const [reload, setReload] = useState(0);
  const [sourceSort, setSourceSort] = useState<SortState<"weight" | "venue" | "name">>({
    columnId: "weight",
    direction: "desc",
  });
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const prices = useSlice(client, row.id, reload, loadRatePrices);

  reloadRef.current = () => {
    if (tab !== "chart") return;
    client.invalidate(row.id);
    setReload((current) => current + 1);
  };

  const sources = useMemo(() => sortRows(row.sources, sourceSort, (item) => {
    if (sourceSort.columnId === "weight") return item.weight;
    if (sourceSort.columnId === "venue") return item.platform;
    return item.question ?? item.display_ticker ?? item.market_id;
  }), [row.sources, sourceSort]);

  const bodyWidth = Math.max(20, width);
  const bodyHeight = Math.max(6, height - 3);

  return (
    <Box flexDirection="column" width={width} height={height} gap={1}>
      <LevelLine value={row.value} change={row.change1d} />
      <Tabs
        tabs={RATE_TABS}
        activeValue={tab}
        onSelect={(value) => {
          if (value === "chart" || value === "sources") setTab(value);
        }}
        focused={focused}
        compact
      />
      {tab === "chart" ? (
        <SliceFrame
          status={prices.status}
          count={prices.rows.length}
          loadingLabel="Loading chart..."
          emptyTitle="No price history."
          errorTitle="Price history unavailable."
        >
          <HistoryChart points={prices.rows} width={bodyWidth} height={bodyHeight} loading={prices.status === "loading"} />
        </SliceFrame>
      ) : (
        <DataTableView
          focused={focused}
          rootWidth={bodyWidth}
          rootHeight={bodyHeight}
          columns={SOURCE_COLUMNS}
          items={sources}
          getItemKey={(item) => item.market_id}
          selection={{
            kind: "id",
            selectedId: selectedSourceId,
            getId: (item) => item.market_id,
            onChange: setSelectedSourceId,
          }}
          sortColumnId={sourceSort.columnId}
          sortDirection={sourceSort.direction}
          onHeaderClick={(columnId) => {
            if (columnId !== "weight" && columnId !== "venue" && columnId !== "name") return;
            setSourceSort((current) => nextSortState(current, columnId, columnId === "name" || columnId === "venue" ? "asc" : "desc"));
          }}
          renderCell={renderSource}
          emptyStateTitle="No sources."
        />
      )}
    </Box>
  );
}

const SOURCE_COLUMNS: DataTableColumn[] = [
  { id: "weight", label: "WEIGHT", width: 7, align: "right" },
  { id: "venue", label: "VENUE", width: 10, align: "left" },
  { id: "name", label: "NAME", width: 12, align: "left", flexGrow: 1 },
];

function renderSource(row: AdjacentRateSource, column: DataTableColumn, _index: number, rowState: { selected: boolean }): DataTableCell {
  const sel = rowState.selected ? colors.selectedText : undefined;
  switch (column.id) {
    case "weight":
      return { text: `${(row.weight * 100).toFixed(1)}%`, color: sel ?? colors.textDim };
    case "venue":
      return { text: row.platform, color: sel ?? colors.textDim };
    case "name":
      return { text: row.question ?? row.display_ticker ?? row.market_id, color: sel ?? colors.text };
    default:
      return { text: "" };
  }
}
