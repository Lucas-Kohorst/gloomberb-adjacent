import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TextAttributes } from "gloomberb/ui";
import {
  ChartTableHeader,
  DataTableStackView,
  PaneStatusBody,
  QueryBar,
  staticSeries,
  usePaneStatusLinkFooter,
  useQueryBarSearch,
  type DataTableCell,
  type DataTableColumn,
  type StatItem,
} from "gloomberb/components";
import { colors, priceColor } from "gloomberb/theme";
import { formatPercentRaw, isPlainKey } from "gloomberb/utils";
import { useAutoRefresh, usePaneSettingValue, usePluginConfigState, useShortcut, useUpdatedAgo } from "gloomberb/react";
import type { PaneProps } from "gloomberb/types/plugin";
import { historyFromPoints, listedBoard, type History } from "./board";
import { IndexDetail } from "./detail";
import { prefetchAdjacentIndexDetail } from "./detail-preload";
import { matchesQuery, normalizeIndex, samplesToPoints } from "./normalize";
import { nextSortState, useAdjacentClient } from "./shared";
import { API_KEY_CONFIG, type AdjacentIndexRow, type PricePoint } from "./types";

const COLUMNS: DataTableColumn[] = [
  { id: "ticker", label: "TICKER", width: 8, align: "left" },
  { id: "name", label: "NAME", width: 16, align: "left", flexGrow: 1 },
  { id: "value", label: "VALUE", width: 8, align: "right" },
  { id: "chg1d", label: "1D", width: 7, align: "right" },
  { id: "chg7d", label: "7D", width: 7, align: "right" },
];

type SortColumn = "ticker" | "name" | "value" | "chg1d" | "chg7d";

function renderCell(row: AdjacentIndexRow, column: DataTableColumn, _index: number, rowState: { selected: boolean }): DataTableCell {
  const sel = rowState.selected ? colors.selectedText : undefined;
  switch (column.id) {
    case "ticker":
      return { text: row.ticker, color: sel ?? colors.textBright, attributes: TextAttributes.BOLD };
    case "name":
      return { text: row.name, color: sel ?? colors.text };
    case "value":
      return { text: row.value == null ? "—" : row.value.toFixed(2), color: sel ?? colors.text };
    case "chg1d":
      return cellChange(row.change1d, sel);
    case "chg7d":
      return cellChange(row.change7d, sel);
    default:
      return { text: "" };
  }
}

function cellChange(value: number | null, sel?: string): DataTableCell {
  if (value == null) return { text: "—", color: sel ?? colors.textDim };
  return { text: formatPercentRaw(value), color: sel ?? priceColor(value) };
}

export function AdjacentIndicesPane({ paneId, focused, width, height }: PaneProps) {
  const [apiKey] = usePluginConfigState<string>(API_KEY_CONFIG, "");
  const client = useAdjacentClient(apiKey);
  const [openedQuery] = usePaneSettingValue("query", "");
  const [query, setQuery] = useState(openedQuery.trim());
  const search = useQueryBarSearch();
  const [catalog, setCatalog] = useState<AdjacentIndexRow[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sortColumnId, setSortColumnId] = useState<SortColumn>("chg1d");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [storyUrl, setStoryUrl] = useState<string | null>(null);
  const reloadDetail = useRef<() => void>(() => {});
  const [history, setHistory] = useState<History>({ status: "pending", closes: [] });
  const updatedAgo = useUpdatedAgo(updatedAt);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const next = (await client.listIndices()).map(normalizeIndex);
      setCatalog(next);
      setUpdatedAt(Date.now());
      setSelectedId((current) => current ?? next[0]?.id ?? null);
    } catch (cause) {
      setCatalogError(cause instanceof Error ? cause.message : "Indices unavailable.");
    } finally {
      setCatalogLoading(false);
    }
  }, [client]);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);
  useAutoRefresh(updatedAt, () => { void loadCatalog(); });

  const visible = useMemo(() => {
    const filtered = catalog.filter((row) => matchesQuery(`${row.ticker} ${row.name} ${row.id}`, query));
    const dir = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((left, right) => {
      const key = sortColumnId;
      const lv = key === "ticker" ? left.ticker : key === "name" ? left.name : key === "value" ? left.value : key === "chg7d" ? left.change7d : left.change1d;
      const rv = key === "ticker" ? right.ticker : key === "name" ? right.name : key === "value" ? right.value : key === "chg7d" ? right.change7d : right.change1d;
      if (lv == null && rv == null) return 0;
      if (lv == null) return 1;
      if (rv == null) return -1;
      return lv < rv ? -dir : lv > rv ? dir : 0;
    });
  }, [catalog, query, sortColumnId, sortDirection]);

  const selected = visible.find((row) => row.id === selectedId) ?? visible[0] ?? null;

  useEffect(() => {
    if (!selected) {
      setHistory({ status: "short", closes: [] });
      return;
    }
    let cancelled = false;
    setHistory((current) => ({ status: "pending", closes: current.closes }));
    void client.getIndexPrices(selected.id).then(samplesToPoints).then((points) => {
      if (!cancelled) setHistory(historyFromPoints(points, "settled"));
    }).catch(() => {
      if (cancelled) return;
      setHistory((current) => historyFromPoints(current.closes as PricePoint[], "failed"));
    });
    const timer = setTimeout(() => prefetchAdjacentIndexDetail(client, selected.id), 80);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, selected]);

  useShortcut((event) => {
    if (!focused || search.active || openId) return;
    if (!isPlainKey(event, "r")) return;
    event.preventDefault?.();
    void loadCatalog();
  }, { enabled: focused && !search.active && !openId });

  const board = listedBoard("index", visible, {
    selectedId: selected?.id ?? null,
    openId,
    sort: { column: sortColumnId, direction: sortDirection },
    query,
  }, history, storyUrl ? { url: storyUrl } : null);

  const series = useMemo(() => {
    if (board.band.closes.length < 3) return [];
    const first = board.band.closes[0]?.value ?? 0;
    const last = board.band.closes[board.band.closes.length - 1]?.value ?? first;
    return [staticSeries(board.band.closes.map((close) => ({
      date: close.date,
      observedAt: close.date,
      value: close.value,
    })), {
      id: selected?.id ?? "index",
      label: board.band.seriesLabel,
      color: priceColor(last - first),
    })];
  }, [board.band.closes, board.band.seriesLabel, selected?.id]);

  const figures: StatItem[] = board.figures.map((figure) => ({
    id: figure.id,
    label: figure.label,
    value: figure.value,
    tone: figure.id === "1d" || figure.id === "7d" ? undefined : "muted",
  }));

  usePaneStatusLinkFooter({
    registrationId: `${paneId}:open`,
    focused,
    loading: catalogLoading && catalog.length === 0,
    error: catalog.length === 0 ? catalogError : null,
    url: board.openTarget?.url ?? null,
    showOpenHint: !!board.openTarget,
    info: updatedAgo ? [{ id: "updated", parts: [{ text: updatedAgo, tone: "muted" as const }] }] : [],
  });

  const detail = selected && openId ? (
    <IndexDetail
      client={client}
      row={selected}
      width={Math.max(20, width - 2)}
      height={Math.max(8, height - 2)}
      focused={focused && !search.active}
      onLink={setStoryUrl}
      reloadRef={reloadDetail}
    />
  ) : null;

  return (
    <PaneStatusBody
      width={width}
      height={height}
      loading={catalogLoading && catalog.length === 0}
      error={catalog.length === 0 ? catalogError : null}
      subject="indices"
      empty={!catalogLoading && !catalogError && catalog.length === 0}
      emptyTitle="No indices."
    >
      <DataTableStackView<AdjacentIndexRow, DataTableColumn>
        focused={focused && !search.active}
        detailOpen={!!openId && !!selected}
        onBack={() => {
          setOpenId(null);
          setStoryUrl(null);
        }}
        detailContent={detail}
        detailTitle={selected ? `${selected.ticker}  ${selected.name}` : undefined}
        selection={{
          kind: "id",
          selectedId: selected?.id ?? null,
          getId: (row) => row.id,
          onChange: setSelectedId,
        }}
        onActivate={() => {
          if (selected) setOpenId(selected.id);
        }}
        onDetailKeyDown={(event) => {
          if (!isPlainKey(event, "r")) return false;
          event.preventDefault?.();
          reloadDetail.current();
          return true;
        }}
        rootWidth={width}
        rootHeight={height}
        columns={COLUMNS}
        items={visible}
        rootBefore={(
          <ChartTableHeader
            width={width}
            height={height}
            tableRows={visible.length}
            tableColumns={COLUMNS}
            query={(
              <QueryBar
                width={width}
                search={{
                  ...search.searchProps,
                  value: query,
                  onChange: setQuery,
                  placeholder: "ticker or name",
                  focused,
                }}
              />
            )}
            figures={figures}
            chart={{
              series,
              formatValue: board.band.formatValue,
              formatAxisValue: board.band.formatAxisValue,
              loading: board.band.loading,
              empty: board.band.empty,
              remoteKind: "adjacent-index",
            }}
          />
        )}
        sortColumnId={sortColumnId}
        sortDirection={sortDirection}
        onHeaderClick={(columnId) => {
          const next = nextSortState(
            { columnId: sortColumnId, direction: sortDirection },
            columnId as SortColumn,
            columnId === "ticker" || columnId === "name" ? "asc" : "desc",
          );
          setSortColumnId(next.columnId);
          setSortDirection(next.direction);
        }}
        getItemKey={(row) => row.id}
        renderCell={renderCell}
        emptyStateTitle={query ? "No indices match." : "No indices."}
      />
    </PaneStatusBody>
  );
}
