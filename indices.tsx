import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, TextAttributes, type InputRenderable } from "gloomberb/ui";
import {
  DataTableStackView,
  EmptyState,
  InputSearchBar,
  Spinner,
  useExternalLinkFooter,
  usePaneFooter,
  type DataTableCell,
  type DataTableColumn,
} from "gloomberb/components";
import { colors, priceColor } from "gloomberb/theme";
import { formatPercentRaw, isPlainKey } from "gloomberb/utils";
import { useAutoRefresh, usePaneSettingValue, usePluginConfigState, useShortcut } from "gloomberb/react";
import type { PaneProps } from "gloomberb/types/plugin";
import { IndexDetail } from "./detail";
import { prefetchAdjacentIndexDetail } from "./detail-preload";
import { matchesQuery, normalizeIndex } from "./normalize";
import { errorSegment, nextSortState, searchHint, useAdjacentClient } from "./shared";
import { API_KEY_CONFIG, type AdjacentIndexRow } from "./types";

type Status = "idle" | "loading" | "loaded" | "error";

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
  const seed = openedQuery.trim();
  const [query, setQuery] = useState(seed);
  const [searchFocused, setSearchFocused] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<AdjacentIndexRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [sortColumnId, setSortColumnId] = useState<SortColumn>("chg1d");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [detailUrl, setDetailUrl] = useState<string | null>(null);
  const [searchToken, setSearchToken] = useState(0);
  const reloadDetail = useRef<() => void>(() => {});
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const searchInputRef = useRef<InputRenderable | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const next = (await client.listIndices()).map(normalizeIndex);
      setRows(next);
      setStatus("loaded");
      setUpdatedAt(Date.now());
      setSelectedId((current) => current ?? next[0]?.id ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Adjacent indices unavailable.");
      setStatus("error");
    }
  }, [client]);

  useEffect(() => { void load(); }, [load]);
  useAutoRefresh(updatedAt, () => { void load(); });

  const visible = useMemo(() => {
    const filtered = rows.filter((row) => matchesQuery(`${row.ticker} ${row.name} ${row.id}`, query));
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
  }, [query, rows, sortColumnId, sortDirection]);

  const selected = visible.find((row) => row.id === selectedId) ?? visible[0] ?? null;

  useEffect(() => {
    if (!selected) return;
    const id = selected.id;
    const timer = setTimeout(() => prefetchAdjacentIndexDetail(client, id), 80);
    return () => clearTimeout(timer);
  }, [client, selected]);

  useShortcut((event) => {
    if (!focused || searchFocused) return;
    if (isPlainKey(event, "/") || isPlainKey(event, "s")) {
      event.preventDefault?.();
      setSearchFocused(true);
      setSearchToken((token) => token + 1);
    }
  }, { enabled: focused && !searchFocused });

  const errorInfo = errorSegment(error);
  usePaneFooter(paneId, () => ({
    info: [
      ...(status === "loading" ? [{ id: "loading", parts: [{ text: "loading", tone: "muted" as const }] }] : []),
      ...(errorInfo ? [errorInfo] : []),
    ],
    hints: [searchHint(() => { setSearchFocused(true); setSearchToken((token) => token + 1); })],
  }), [errorInfo, status]);

  const onDetailLink = useCallback((url: string | null) => {
    setDetailUrl(url);
  }, []);

  useExternalLinkFooter({
    registrationId: `${paneId}:open`,
    focused,
    url: detailOpen && detailUrl ? detailUrl : selected ? "https://adjacent.markets" : null,
    showHint: !!selected,
  });

  if (status === "loading" && rows.length === 0) {
    return (
      <Box width={width} height={height} justifyContent="center" alignItems="center">
        <Spinner label="Loading Adjacent indices..." />
      </Box>
    );
  }

  if (status === "error" && rows.length === 0) {
    return (
      <Box width={width} height={height} padding={1}>
        <EmptyState title="Adjacent indices unavailable." message={error ?? undefined} />
      </Box>
    );
  }

  const detail = selected && detailOpen ? (
    <IndexDetail
      client={client}
      row={selected}
      width={Math.max(20, width - 2)}
      height={Math.max(8, height - 2)}
      focused={focused && !searchFocused}
      onLink={onDetailLink}
      reloadRef={reloadDetail}
    />
  ) : null;

  return (
    <DataTableStackView<AdjacentIndexRow, DataTableColumn>
      focused={focused && !searchFocused}
      detailOpen={detailOpen && !!selected}
      onBack={() => {
        setDetailOpen(false);
        setDetailUrl(null);
      }}
      detailContent={detail}
      detailTitle={selected ? `${selected.ticker}  ${selected.name}` : undefined}
      selection={{
        kind: "id",
        selectedId: selected?.id ?? null,
        getId: (row) => row.id,
        onChange: setSelectedId,
      }}
      onActivate={() => setDetailOpen(true)}
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
        <InputSearchBar
          value={query}
          focused={focused}
          active={searchFocused}
          width={width}
          focusToken={searchToken}
          inputRef={searchInputRef}
          placeholder="ticker or name"
          debounceMs={80}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          onNavigateDown={() => setSearchFocused(false)}
          onQueryChange={setQuery}
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
      emptyStateTitle="No indices."
      onRootKeyDown={(event) => {
        if (isPlainKey(event, "r")) {
          void load();
          return true;
        }
        return false;
      }}
    />
  );
}
