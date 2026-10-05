import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Box, Text, TextAttributes, type InputRenderable, type ScrollBoxRenderable } from "gloomberb/ui";
import {
  DataTableStackView,
  DetailScrollBody,
  EmptyState,
  InputSearchBar,
  MarkdownText,
  Spinner,
  useExternalLinkFooter,
  usePaneFooter,
  useTableLoadMore,
  type DataTableCell,
  type DataTableColumn,
} from "gloomberb/components";
import { colors } from "gloomberb/theme";
import { isPlainKey } from "gloomberb/utils";
import { useAutoRefresh, usePaneSettingValue, usePluginConfigState, useShortcut } from "gloomberb/react";
import type { PaneProps } from "gloomberb/types/plugin";
import {
  buildDetailBody,
  buildDetailMeta,
  filingKindLabel,
  filingSeenAt,
  filingSeenLabel,
  filingSortTime,
  formatFilingDay,
} from "./cftc";
import { errorSegment, searchHint, useAdjacentClient } from "./shared";
import { API_KEY_CONFIG, type CftcFiling, type CftcFilingDetail } from "./types";

type Status = "idle" | "loading" | "loaded" | "error";
type SortColumn = "seen" | "day" | "org" | "type" | "status" | "filing";

const PAGE_SIZE = 100;

const COLUMNS: DataTableColumn[] = [
  { id: "seen", label: "SEEN", width: 8, align: "left" },
  { id: "day", label: "DAY", width: 8, align: "left" },
  { id: "org", label: "ORG", width: 8, align: "left" },
  { id: "type", label: "TYPE", width: 13, align: "left" },
  { id: "status", label: "STATUS", width: 14, align: "left" },
  { id: "filing", label: "FILING", width: 16, align: "left", flexGrow: 1 },
];

function renderCell(row: CftcFiling, column: DataTableColumn, _index: number, rowState: { selected: boolean }): DataTableCell {
  const sel = rowState.selected ? colors.selectedText : undefined;
  switch (column.id) {
    case "seen":
      return { text: filingSeenLabel(filingSeenAt(row)), color: sel ?? colors.textDim };
    case "day":
      return { text: formatFilingDay(row.statusDate), color: sel ?? colors.textDim };
    case "org":
      return { text: row.orgCode || "—", color: sel ?? colors.textMuted };
    case "type":
      return { text: filingKindLabel(row.feed), color: sel ?? colors.textDim };
    case "status":
      return { text: row.status.trim() || "—", color: sel ?? colors.textDim };
    case "filing":
      return { text: row.title, color: sel ?? colors.text, attributes: TextAttributes.BOLD };
    default:
      return { text: "" };
  }
}

function sortValue(row: CftcFiling, column: SortColumn): string | number {
  switch (column) {
    case "seen":
      return filingSortTime(filingSeenAt(row));
    case "day":
      return filingSortTime(row.statusDate);
    case "org":
      return row.orgCode;
    case "type":
      return filingKindLabel(row.feed);
    case "status":
      return row.status;
    case "filing":
      return row.title;
  }
}

function FilingDetail({
  filing,
  detail,
  loading,
  width,
  scrollRef,
}: {
  filing: CftcFiling;
  detail: CftcFilingDetail | null;
  loading: boolean;
  width: number;
  scrollRef: RefObject<ScrollBoxRenderable | null>;
}) {
  const lineWidth = Math.max(width - 2, 1);
  const meta = buildDetailMeta(filing);
  return (
    <DetailScrollBody ref={scrollRef} resetScrollKey={filing.id}>
      <Box flexDirection="column" gap={1}>
        {meta.map((line, index) => (
          <Text key={`${index}:${line}`} fg={colors.textMuted}>{line}</Text>
        ))}
        <MarkdownText
          text={buildDetailBody(filing, detail?.markdown ?? "", loading && !detail)}
          lineWidth={lineWidth}
          textColor={colors.text}
        />
      </Box>
    </DetailScrollBody>
  );
}

export function AdjacentFilingsPane({ paneId, focused, width, height }: PaneProps) {
  const [apiKey] = usePluginConfigState<string>(API_KEY_CONFIG, "");
  const client = useAdjacentClient(apiKey);
  const [openedQuery] = usePaneSettingValue("query", "");
  const [query, setQuery] = useState(openedQuery.trim());
  const [searchFocused, setSearchFocused] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<CftcFiling[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<CftcFilingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sortColumnId, setSortColumnId] = useState<SortColumn>("seen");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [searchToken, setSearchToken] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const searchInputRef = useRef<InputRenderable | null>(null);
  const tableScrollRef = useRef<ScrollBoxRenderable | null>(null);
  const detailScrollRef = useRef<ScrollBoxRenderable | null>(null);
  const generation = useRef(0);

  const loadedQuery = useRef<string | null>(null);
  const load = useCallback(async (nextQuery: string) => {
    const request = ++generation.current;
    const replace = loadedQuery.current !== nextQuery;
    if (replace) {
      setRows([]);
      setSelectedId(null);
      setDetailOpen(false);
    }
    setStatus("loading");
    setError(null);
    setLoadingMore(false);
    try {
      const result = await client.listFilings({ search: nextQuery, page: 1, perPage: PAGE_SIZE });
      if (request !== generation.current) return;
      loadedQuery.current = nextQuery;
      setRows(result.filings);
      setPage(result.page);
      setHasMore(result.hasNext);
      setStatus("loaded");
      setUpdatedAt(Date.now());
      setSelectedId((current) => current ?? (result.filings[0] ? String(result.filings[0].id) : null));
    } catch (cause) {
      if (request !== generation.current) return;
      setError(cause instanceof Error ? cause.message : "CFTC filings unavailable.");
      setStatus("error");
    }
  }, [client]);

  useEffect(() => {
    const delay = query.trim() ? 250 : 0;
    const timer = setTimeout(() => { void load(query); }, delay);
    return () => clearTimeout(timer);
  }, [load, query]);

  useAutoRefresh(updatedAt, () => { void load(query); });

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || status !== "loaded") return;
    const request = generation.current;
    const nextPage = page + 1;
    setLoadingMore(true);
    void client.listFilings({ search: query, page: nextPage, perPage: PAGE_SIZE })
      .then((result) => {
        if (generation.current !== request) return;
        setRows((current) => {
          const seen = new Set(current.map((row) => row.id));
          const extra = result.filings.filter((row) => !seen.has(row.id));
          return extra.length === 0 ? current : [...current, ...extra];
        });
        setPage(result.page || nextPage);
        setHasMore(result.hasNext && result.filings.length > 0);
      })
      .catch(() => {
        if (generation.current === request) setHasMore(false);
      })
      .finally(() => {
        if (generation.current === request) setLoadingMore(false);
      });
  }, [client, hasMore, loadingMore, page, query, status]);

  const onFilingsScroll = useTableLoadMore(
    tableScrollRef,
    hasMore && !loadingMore && status === "loaded" && !detailOpen,
    loadMore,
  );

  const visible = useMemo(() => {
    const dir = sortDirection === "asc" ? 1 : -1;
    return [...rows].sort((left, right) => {
      const lv = sortValue(left, sortColumnId);
      const rv = sortValue(right, sortColumnId);
      if (typeof lv === "number" && typeof rv === "number") return (lv - rv) * dir;
      return String(lv).localeCompare(String(rv), undefined, { sensitivity: "base" }) * dir;
    });
  }, [rows, sortColumnId, sortDirection]);

  const selected = visible.find((row) => String(row.id) === selectedId) ?? visible[0] ?? null;

  const detailId = selected?.id ?? null;
  useEffect(() => {
    if (detailId == null) {
      setDetail(null);
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    setDetail(null);
    setDetailLoading(true);
    const timer = setTimeout(() => {
      void client.getFilingDetail(detailId)
        .then((next) => {
          if (cancelled) return;
          setDetail(next);
          setDetailLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          setDetail(null);
          setDetailLoading(false);
        });
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, detailId]);

  useShortcut((event) => {
    if (!focused || searchFocused) return;
    if (isPlainKey(event, "/") || isPlainKey(event, "s")) {
      event.preventDefault?.();
      setSearchFocused(true);
      setSearchToken((token) => token + 1);
    }
  }, { enabled: focused && !searchFocused && !detailOpen });

  const errorInfo = errorSegment(error);
  usePaneFooter(paneId, () => ({
    info: [
      ...(status === "loading" || loadingMore
        ? [{ id: "loading", parts: [{ text: loadingMore ? "loading more" : "loading", tone: "muted" as const }] }]
        : []),
      ...(client.isPublic
        ? [{ id: "tier", parts: [{ text: "public, last 90d", tone: "muted" as const }] }]
        : []),
      ...(errorInfo ? [errorInfo] : []),
    ],
    hints: [searchHint(() => { setSearchFocused(true); setSearchToken((token) => token + 1); })],
  }), [client.isPublic, errorInfo, loadingMore, status]);

  useExternalLinkFooter({
    registrationId: `${paneId}:filing`,
    focused,
    url: detail?.sourceUrl ?? null,
    showHint: !!detail?.sourceUrl,
  });

  const searchBar = (
    <InputSearchBar
      value={query}
      focused={focused}
      active={searchFocused}
      width={width}
      focusToken={searchToken}
      inputRef={searchInputRef}
      placeholder="organization, product, or description"
      debounceMs={80}
      onFocus={() => setSearchFocused(true)}
      onBlur={() => setSearchFocused(false)}
      onNavigateDown={() => setSearchFocused(false)}
      onQueryChange={(next) => {
        setSelectedId(null);
        setDetailOpen(false);
        setQuery(next);
      }}
    />
  );

  if (status === "loading" && rows.length === 0) {
    return (
      <Box width={width} height={height} flexDirection="column">
        {searchBar}
        <Box flexGrow={1} justifyContent="center" alignItems="center">
          <Spinner label={query.trim() ? `Searching CFTC filings for ${query.trim()}...` : "Loading CFTC filings..."} />
        </Box>
      </Box>
    );
  }

  if (status === "error" && rows.length === 0) {
    return (
      <Box width={width} height={height} flexDirection="column">
        {searchBar}
        <Box flexGrow={1} justifyContent="center" alignItems="center" padding={1}>
          <EmptyState title="CFTC filings unavailable." message={error ?? undefined} />
        </Box>
      </Box>
    );
  }

  const detailView = selected && detailOpen ? (
    <FilingDetail
      filing={detail?.filing ?? selected}
      detail={detail}
      loading={detailLoading}
      width={Math.max(20, width - 2)}
      scrollRef={detailScrollRef}
    />
  ) : null;

  return (
    <DataTableStackView<CftcFiling, DataTableColumn>
      focused={focused && !searchFocused}
      detailOpen={detailOpen && !!selected}
      onBack={() => setDetailOpen(false)}
      detailContent={detailView}
      detailTitle={selected?.title}
      selection={{
        kind: "id",
        selectedId: selected ? String(selected.id) : null,
        getId: (row) => String(row.id),
        onChange: setSelectedId,
      }}
      onActivate={() => setDetailOpen(true)}
      detailScrollRef={detailScrollRef}
      rootWidth={width}
      rootHeight={height}
      columns={COLUMNS}
      items={visible}
      scrollRef={tableScrollRef}
      onBodyScrollActivity={onFilingsScroll}
      rootBefore={searchBar}
      sortColumnId={sortColumnId}
      sortDirection={sortDirection}
      onHeaderClick={(columnId) => {
        if (columnId !== "seen" && columnId !== "day" && columnId !== "org" && columnId !== "type" && columnId !== "status" && columnId !== "filing") return;
        if (sortColumnId === columnId) {
          setSortDirection((direction) => direction === "asc" ? "desc" : "asc");
          return;
        }
        setSortColumnId(columnId);
        setSortDirection(columnId === "seen" || columnId === "day" ? "desc" : "asc");
      }}
      getItemKey={(row) => String(row.id)}
      renderCell={renderCell}
      emptyStateTitle={query.trim() ? `No CFTC filings match ${query.trim()}.` : "No recent CFTC filings."}
      onRootKeyDown={(event) => {
        if (isPlainKey(event, "r")) {
          void load(query);
          return true;
        }
        return false;
      }}
    />
  );
}
