import { EmptyState, Spinner, StaticChartSurface, type PaneFooterSegment, type PaneHint } from "gloomberb/components";
import { useConnectionHealth } from "gloomberb/react";
import { colors, priceColor } from "gloomberb/theme";
import { useMemo } from "react";
import { Box } from "gloomberb/ui";
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

export function HistoryChart({
  points,
  width,
  height,
  loading = false,
}: {
  points: PricePoint[];
  width: number;
  height: number;
  loading?: boolean;
}) {
  const first = points[0];
  const last = points[points.length - 1];
  if (loading && !first) {
    return (
      <Box width={width} height={height} justifyContent="center" alignItems="center">
        <Spinner label="Loading history..." />
      </Box>
    );
  }
  if (!first || !last) {
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
        lineColor: priceColor(last.value - first.value),
        gridColor: colors.borderFocused,
        crosshairColor: colors.textMuted,
        bgColor: colors.bg,
        axisColor: colors.textDim,
      }}
      showTimeAxis
    />
  );
}
