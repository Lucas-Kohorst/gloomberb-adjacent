import { Box } from "gloomberb/ui";
import { usePaneTabs } from "gloomberb/components";
import { usePaneSettingValue, usePluginPaneState } from "gloomberb/react";
import type { PaneProps } from "gloomberb/types/plugin";
import { AdjacentFilingsPane } from "./filings";
import { AdjacentIndicesPane } from "./indices";
import { AdjacentRatesPane } from "./rates";
import { adjacentTab } from "./types";

const ADJACENT_TABS = [
  { label: "Indices", value: "indices" },
  { label: "Rates", value: "rates" },
  { label: "CFTC", value: "cftc" },
];

export function AdjacentPane({ width, height, focused, ...rest }: PaneProps) {
  const [defaultTabId] = usePaneSettingValue("defaultTabId", "indices");
  const fallback = adjacentTab(defaultTabId);
  const [storedTab, setActiveTab] = usePluginPaneState<string>("activeTab", fallback);
  const activeTab = adjacentTab(storedTab);
  const { strip, rows } = usePaneTabs({
    tabs: ADJACENT_TABS,
    activeValue: activeTab,
    onSelect: (value) => setActiveTab(adjacentTab(value)),
    focused,
    compact: true,
  });
  const bodyHeight = Math.max(1, height - rows);
  const body = { ...rest, width, height: bodyHeight, focused };

  return (
    <Box flexDirection="column" width={width} height={height}>
      {strip}
      {activeTab === "indices" ? <AdjacentIndicesPane {...body} /> : null}
      {activeTab === "rates" ? <AdjacentRatesPane {...body} /> : null}
      {activeTab === "cftc" ? <AdjacentFilingsPane {...body} /> : null}
    </Box>
  );
}
