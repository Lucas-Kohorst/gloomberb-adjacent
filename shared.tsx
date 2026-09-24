import {
  EmptyState,
  StatGrid,
  StaticChartSurface,
  statGridRows,
  type PaneFooterSegment,
  type PaneHint,
  type StatItem,
} from "gloomberb/components";
import { useConnectionHealth } from "gloomberb/react";
import { colors, priceColor } from "gloomberb/theme";
import { Box } from "gloomberb/ui";
import { formatPercentRaw } from "gloomberb/utils";
import { useMemo } from "react";
import { AdjacentClient } from "./client";
import { CONNECTION_ID, type PricePoint } from "./types";

/** A client whose requests report into the host's connection health for this plugin. */
export function useAdjacentClient(apiKey: string): AdjacentClient {
  const health = useConnectionHealth();
  return useMemo(
    () => new AdjacentClient(apiKey || null, (operation, run) => health.track(CONNECTION_ID, operation, run)),
    [apiKey, health],
  );
}

export function searchHint(onPress: () => void): PaneHint {
  return { id: "search", key: "/", label: "search", onPress };
}

export function errorSegment(error: string | null): PaneFooterSegment | null {
  return error ? { id: "error", parts: [{ text: error, tone: "warning" }] } : null;
}

export interface SortState<Id extends string> {
  columnId: Id;
  direction: "asc" | "desc";
}

/** Clicking the sorted column flips it; clicking another column sorts by it in its natural direction. */
export function nextSortState<Id extends string>(
  current: SortState<Id>,
  columnId: Id,
  defaultDirection: "asc" | "desc",
): SortState<Id> {
  if (current.columnId === columnId) {
    return { columnId, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { columnId, direction: defaultDirection };
}

/** A value, or a dash when the source has none. */
export function formatValue(value: number | null): string {
  return value == null ? "—" : value.toFixed(2);
}

/** A percent change figure for the detail's stat band, coloured like the table cell. */
export function changeStat(id: string, label: string, value: number | null): StatItem {
  return value == null
    ? { id, label, value: "—", tone: "muted" }
    : { id, label, value: formatPercentRaw(value), color: priceColor(value) };
}

/**
 * The open row: its figures in a stat band, then its history. The stack bar
 * above already names the item, so the body starts with the figures.
 */
export function HistoryDetail({ stats, points, width, height }: {
  stats: StatItem[];
  points: PricePoint[];
  width: number;
  height: number;
}) {
  const chartHeight = Math.max(6, Math.floor(height - statGridRows(stats, width)));
  return (
    <Box flexDirection="column" width={width} height={height}>
      <StatGrid items={stats} width={width} />
      <Box paddingX={1} flexGrow={1} minHeight={0}>
        <HistoryChart points={points} width={Math.max(20, width - 2)} height={chartHeight} />
      </Box>
    </Box>
  );
}

function HistoryChart({ points, width, height }: { points: PricePoint[]; width: number; height: number }) {
  if (points.length === 0) {
    return <EmptyState title="No history." />;
  }
  return (
    <StaticChartSurface
      points={points.map((point) => ({
        date: point.date,
        open: point.value,
        high: point.value,
        low: point.value,
        close: point.value,
        volume: 0,
      }))}
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
