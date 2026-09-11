import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, TextAttributes, type InputRenderable } from "gloomberb/ui";
import {
  DataTableStackView,
  EmptyState,
  InputSearchBar,
  Spinner,
  StaticChartSurface,
  footerErrorChip,
  nextStackSortPreference,
  useExternalLinkFooter,
  usePaneFooter,
  type DataTableCell,
  type DataTableColumn,
} from "gloomberb/components";
import { colors, priceColor } from "gloomberb/theme";
import { formatPercentRaw, isPlainKey } from "gloomberb/utils";
import { paneSearchHint, useAutoRefresh, usePaneInstance, usePluginConfigState, useShortcut } from "gloomberb/react";
import type { PaneProps } from "gloomberb/types/plugin";
import { AdjacentClient } from "./client";
import { matchesQuery, normalizeRate, samplesToPoints } from "./normalize";
import { API_KEY_CONFIG, type AdjacentRateRow, type PricePoint } from "./types";

type Status = "idle" | "loading" | "loaded" | "error";

const COLUMNS: DataTableColumn[] = [
  { id: "name", label: "RATE", width: 16, align: "left", flexGrow: 1 },
  { id: "value", label: "VALUE", width: 8, align: "right" },
  { id: "chg1d", label: "1D", width: 7, align: "right" },
  { id: "spread", label: "SPREAD", width: 8, align: "right" },
];

function renderCell(row: AdjacentRateRow, column: DataTableColumn, selected: boolean): DataTableCell {
  const sel = selected ? colors.selectedText : undefined;
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
      return { text: formatPercentRaw(row.spread), color: sel ?? priceColor(row.spread) };
    default:
      return { text: "" };
  }
}

function Chart({ points, width, height }: { points: PricePoint[]; width: number; height: number }) {
  if (points.length === 0) return <EmptyState title="No history." />;
  return (
    <StaticChartSurface
      points={points.map((point) => ({ date: point.date, close: point.value }))}
      width={width}
      height={height}
      mode="line"
      colors={{
        lineColor: colors.positive,
        gridColor: colors.borderFocused,
        crosshairColor: colors.textMuted,
        bgColor: colors.bg,
        axisColor: colors.textDim,
      }}
      showTimeAxis
    />
  );
}

export function AdjacentRatesPane({ paneId, focused, width, height }: PaneProps) {
  const paneInstance = usePaneInstance();
  const [apiKey] = usePluginConfigState<string>(API_KEY_CONFIG, "");
  const client = useMemo(() => new AdjacentClient(apiKey || null), [apiKey]);
  const seed = typeof paneInstance?.params?.query === "string" ? paneInstance.params.query.trim() : "";
  const [query, setQuery] = useState(seed);
  const [searchFocused, setSearchFocused] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<AdjacentRateRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [sortColumnId, setSortColumnId] = useState("chg1d");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [prices, setPrices] = useState<PricePoint[]>([]);
  const [searchToken, setSearchToken] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const searchInputRef = useRef<InputRenderable | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const next = (await client.listRates()).map(normalizeRate);
      setRows(next);
      setStatus("loaded");
      setUpdatedAt(Date.now());
      if (!selectedId && next[0]) setSelectedId(next[0].id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Adjacent rates unavailable.");
      setStatus("error");
    }
  }, [client, selectedId]);

  useEffect(() => { void load(); }, [load]);
  useAutoRefresh(updatedAt, () => { void load(); });

  const visible = useMemo(() => {
    const filtered = rows.filter((row) => matchesQuery(`${row.name} ${row.id}`, query));
    const dir = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((left, right) => {
      const lv = sortColumnId === "name" ? left.name : sortColumnId === "value" ? left.value : sortColumnId === "spread" ? left.spread : left.change1d;
      const rv = sortColumnId === "name" ? right.name : sortColumnId === "value" ? right.value : sortColumnId === "spread" ? right.spread : right.change1d;
      if (lv == null && rv == null) return 0;
      if (lv == null) return 1;
      if (rv == null) return -1;
      return lv < rv ? -dir : lv > rv ? dir : 0;
    });
  }, [query, rows, sortColumnId, sortDirection]);

  const selected = visible.find((row) => row.id === selectedId) ?? visible[0] ?? null;

  useEffect(() => {
    if (!selected) {
      setPrices([]);
      return;
    }
    let cancelled = false;
    void client.getRatePrices(selected.id).then((samples) => {
      if (!cancelled) setPrices(samplesToPoints(samples));
    }).catch(() => {
      if (!cancelled) setPrices([]);
    });
    return () => { cancelled = true; };
  }, [client, selected?.id]);

  useShortcut((event) => {
    if (!focused || searchFocused) return;
    if (isPlainKey(event, "/") || isPlainKey(event, "s")) {
      event.preventDefault?.();
      setSearchFocused(true);
      setSearchToken((token) => token + 1);
    }
  }, { enabled: focused && !searchFocused });

  const errorChip = footerErrorChip(error);
  usePaneFooter(paneId, () => ({
    info: [
      ...(status === "loading" ? [{ id: "loading", parts: [{ text: "loading", tone: "muted" as const }] }] : []),
      ...(errorChip ? [{ id: "error", parts: [errorChip] }] : []),
    ],
    hints: [paneSearchHint(() => { setSearchFocused(true); setSearchToken((token) => token + 1); })],
  }), [errorChip, status, searchToken]);

  useExternalLinkFooter({
    registrationId: `${paneId}:open`,
    focused,
    url: selected ? "https://adjacent.markets" : null,
    showHint: !!selected,
  });

  if (status === "loading" && rows.length === 0) {
    return (
      <Box width={width} height={height} justifyContent="center" alignItems="center">
        <Spinner label="Loading Adjacent rates..." />
      </Box>
    );
  }

  if (status === "error" && rows.length === 0) {
    return (
      <Box width={width} height={height} padding={1}>
        <EmptyState title="Adjacent rates unavailable." message={error ?? undefined} />
      </Box>
    );
  }

  const detail = selected && detailOpen ? (
    <Box flexDirection="column" width={width} height={Math.max(8, height - 1)} padding={1} gap={1}>
      <Text fg={colors.textBright} attributes={TextAttributes.BOLD}>{selected.name}</Text>
      <Text fg={colors.textMuted}>
        {selected.value == null ? "—" : selected.value.toFixed(2)}
        {selected.change1d == null ? "" : `   1D ${formatPercentRaw(selected.change1d)}`}
      </Text>
      <Chart points={prices} width={Math.max(20, width - 2)} height={Math.max(6, height - 8)} />
    </Box>
  ) : null;

  return (
    <DataTableStackView<AdjacentRateRow, DataTableColumn>
      focused={focused && !searchFocused}
      detailOpen={detailOpen && !!selected}
      onBack={() => setDetailOpen(false)}
      detailContent={detail}
      detailTitle={selected?.name}
      selection={{
        kind: "id",
        selectedId: selected?.id ?? null,
        getId: (row) => row.id,
        onChange: setSelectedId,
      }}
      onActivate={() => setDetailOpen(true)}
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
          placeholder="rate name"
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
        const next = nextStackSortPreference(
          { columnId: sortColumnId, direction: sortDirection },
          columnId,
          columnId === "name" ? "asc" : "desc",
        );
        setSortColumnId(next.columnId);
        setSortDirection(next.direction);
      }}
      getItemKey={(row) => row.id}
      renderCell={renderCell}
      emptyStateTitle="No rates."
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
