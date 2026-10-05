import { PaneListChrome } from "gloomberb/components";
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
  const bodyHeight = Math.max(1, height - 1);
  const body = { ...rest, width, height: bodyHeight, focused };

  return (
    <PaneListChrome
      width={width}
      height={height}
      focused={focused}
      tabs={ADJACENT_TABS}
      activeValue={activeTab}
      onSelect={(value) => setActiveTab(adjacentTab(value))}
    >
      {activeTab === "indices" ? <AdjacentIndicesPane {...body} /> : null}
      {activeTab === "rates" ? <AdjacentRatesPane {...body} /> : null}
      {activeTab === "cftc" ? <AdjacentFilingsPane {...body} /> : null}
    </PaneListChrome>
  );
}
