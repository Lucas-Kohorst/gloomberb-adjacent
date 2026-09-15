import { EmptyState, StaticChartSurface, type PaneFooterSegment, type PaneHint } from "gloomberb/components";
import { useConnectionHealth } from "gloomberb/react";
import { colors } from "gloomberb/theme";
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

export function HistoryChart({ points, width, height }: { points: PricePoint[]; width: number; height: number }) {
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
