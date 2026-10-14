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
import { RateDetail } from "./detail";
import { matchesQuery, normalizeRate, samplesToPoints } from "./normalize";
import { nextSortState, useAdjacentClient } from "./shared";
import { API_KEY_CONFIG, type AdjacentRateRow, type PricePoint } from "./types";

const COLUMNS: DataTableColumn[] = [
  { id: "name", label: "RATE", width: 16, align: "left", flexGrow: 1 },
  { id: "value", label: "VALUE", width: 8, align: "right" },
  { id: "chg1d", label: "1D", width: 7, align: "right" },
  { id: "spread", label: "SPREAD", width: 8, align: "right" },
];

type SortColumn = "name" | "value" | "chg1d" | "spread";

function renderCell(row: AdjacentRateRow, column: DataTableColumn, _index: number, rowState: { selected: boolean }): DataTableCell {
  const sel = rowState.selected ? colors.selectedText : undefined;
  switch (column.id) {
    case "name":
      return { text: row.name, color: sel ?? colors.textBright, attributes: TextAttributes.BOLD };
    case "value":
      return { text: row.value == null ? "—" : row.value.toFixed(2), color: sel ?? colors.text };
    case "chg1d":
      if (row.change1d == null) return { text: "—", color: sel ?? colors.textDim };
      return { text: formatPercentRaw(row.change1d), color: sel ?? priceColor(row.change1d) };
    case "spread":
      if (row.spread == null) return { text: "—", color: sel ?? colors.textDim };
      return { text: row.spread.toFixed(2), color: sel ?? colors.text };
    default:
      return { text: "" };
  }
}

export function AdjacentRatesPane({ paneId, focused, width, height }: PaneProps) {
  const [apiKey] = usePluginConfigState<string>(API_KEY_CONFIG, "");
  const client = useAdjacentClient(apiKey);
  const [openedQuery] = usePaneSettingValue("query", "");
  const [query, setQuery] = useState(openedQuery.trim());
  const search = useQueryBarSearch();
  const [catalog, setCatalog] = useState<AdjacentRateRow[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sortColumnId, setSortColumnId] = useState<SortColumn>("chg1d");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [history, setHistory] = useState<History>({ status: "pending", closes: [] });
  const reloadDetail = useRef<() => void>(() => {});
  const updatedAgo = useUpdatedAgo(updatedAt);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const next = (await client.listRates()).map(normalizeRate);
      setCatalog(next);
      setUpdatedAt(Date.now());
      setSelectedId((current) => current ?? next[0]?.id ?? null);
    } catch (cause) {
      setCatalogError(cause instanceof Error ? cause.message : "Rates unavailable.");
    } finally {
      setCatalogLoading(false);
    }
  }, [client]);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);
  useAutoRefresh(updatedAt, () => { void loadCatalog(); });

  const visible = useMemo(() => {
    const filtered = catalog.filter((row) => matchesQuery(`${row.name} ${row.id}`, query));
    const dir = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((left, right) => {
      const lv = sortColumnId === "name" ? left.name : sortColumnId === "value" ? left.value : sortColumnId === "spread" ? left.spread : left.change1d;
      const rv = sortColumnId === "name" ? right.name : sortColumnId === "value" ? right.value : sortColumnId === "spread" ? right.spread : right.change1d;
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
    void client.getRatePrices(selected.id).then(samplesToPoints).then((points) => {
      if (!cancelled) setHistory(historyFromPoints(points, "settled"));
    }).catch(() => {
      if (cancelled) return;
      setHistory((current) => historyFromPoints(current.closes as PricePoint[], "failed"));
    });
    return () => { cancelled = true; };
  }, [client, selected]);

  useShortcut((event) => {
    if (!focused || search.active || openId) return;
    if (!isPlainKey(event, "r")) return;
    event.preventDefault?.();
    void loadCatalog();
  }, { enabled: focused && !search.active && !openId });

  const board = listedBoard("rate", visible, {
    selectedId: selected?.id ?? null,
    openId,
    sort: { column: sortColumnId, direction: sortDirection },
    query,
  }, history);

  const series = useMemo(() => {
    if (board.band.closes.length < 3) return [];
    const first = board.band.closes[0]?.value ?? 0;
    const last = board.band.closes[board.band.closes.length - 1]?.value ?? first;
    return [staticSeries(board.band.closes.map((close) => ({
      date: close.date,
      observedAt: close.date,
      value: close.value,
    })), {
      id: selected?.id ?? "rate",
      label: board.band.seriesLabel,
      color: priceColor(last - first),
    })];
  }, [board.band.closes, board.band.seriesLabel, selected?.id]);

  const figures: StatItem[] = board.figures.map((figure) => ({
    id: figure.id,
    label: figure.label,
    value: figure.value,
  }));

  usePaneStatusLinkFooter({
    registrationId: `${paneId}:status`,
    focused,
    loading: catalogLoading && catalog.length === 0,
    error: catalog.length === 0 ? catalogError : null,
    url: null,
    showOpenHint: false,
    info: updatedAgo ? [{ id: "updated", parts: [{ text: updatedAgo, tone: "muted" as const }] }] : [],
  });

  const detail = selected && openId ? (
    <RateDetail
      client={client}
      row={selected}
      width={Math.max(20, width - 2)}
      height={Math.max(8, height - 2)}
      focused={focused && !search.active}
      reloadRef={reloadDetail}
    />
  ) : null;

  return (
    <PaneStatusBody
      width={width}
      height={height}
      loading={catalogLoading && catalog.length === 0}
      error={catalog.length === 0 ? catalogError : null}
      subject="rates"
      empty={!catalogLoading && !catalogError && catalog.length === 0}
      emptyTitle="No rates."
    >
      <DataTableStackView<AdjacentRateRow, DataTableColumn>
        focused={focused && !search.active}
        detailOpen={!!openId && !!selected}
        onBack={() => setOpenId(null)}
        detailContent={detail}
        detailTitle={selected?.name}
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
                  placeholder: "rate name",
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
              remoteKind: "adjacent-rate",
            }}
          />
        )}
        sortColumnId={sortColumnId}
        sortDirection={sortDirection}
        onHeaderClick={(columnId) => {
          const next = nextSortState(
            { columnId: sortColumnId, direction: sortDirection },
            columnId as SortColumn,
            columnId === "name" ? "asc" : "desc",
          );
          setSortColumnId(next.columnId);
          setSortDirection(next.direction);
        }}
        getItemKey={(row) => row.id}
        renderCell={renderCell}
        emptyStateTitle={query ? "No rates match." : "No rates."}
      />
    </PaneStatusBody>
  );
}
