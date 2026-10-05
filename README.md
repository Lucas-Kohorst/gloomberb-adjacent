# Adjacent

Prediction-market **indices**, **reference rates**, and **CFTC filings** from [Adjacent](https://adjacent.markets) as one Gloomberb pane and chart series.

Listed in the [Gloomberb plugin directory](https://gloom.sh/plugins) via the `gloomberb-plugin` GitHub topic.

## Install

```bash
gloomberb install Lucas-Kohorst/gloomberb-adjacent
```

Installing from the Plugins pane (`PL`) loads it straight away; from the CLI, restart Gloomberb. Enable **Adjacent** if it is not already on.

Requires Gloomberb 0.13.3 or newer.

## What it adds

| Surface | Shortcut | What it is |
| --- | --- | --- |
| Adjacent | `ADJ` | One pane. Tabs: Indices, Rates, CFTC |
| Chart series | `G CAP:adjacent-indices:ADJ:red` | History for any index or rate id; or search "adjacent" from a chart's **add series** |

`h` and `l` move between Indices, Rates, and CFTC. `/` filters the table. Open an index for its chart, constituents, related news, and filings. Those related filings need an API key. Open a rate for its chart and sources. Open a CFTC filing for its text. `o` opens the selected link. Public CFTC filings cover the last 90 days.

## API key (optional)

Public Adjacent endpoints work without a key. For the authenticated catalog, run **Adjacent: set API key** in the command bar, or set `ADJACENT_API_KEY` in the process environment before launching Gloomberb.

## Headless

```bash
gloomberb fn ADJ
gloomberb fn ADJ --tab rates
gloomberb fn ADJ --tab cftc --json
gloomberb catalog adjacent
```

## Network

Talks to `api.adjacent.markets` only.

## License

MIT. Adjacent names identify the data provider and do not grant trademark rights.
