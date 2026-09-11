# Adjacent Indices

Prediction-market **indices** and **reference rates** from [Adjacent](https://adjacent.markets) as Gloomberb panes and chart series.

Listed in the [Gloomberb plugin directory](https://gloom.sh/plugins) via the `gloomberb-plugin` GitHub topic.

## Install

```bash
gloomberb install Lucas-Kohorst/gloomberb-adjacent
```

Restart Gloomberb and enable **Adjacent Indices** if it is not already on.

Requires Gloomberb 0.13.3 or newer.

## What it adds

| Surface | Shortcut | What it is |
| --- | --- | --- |
| Adjacent Indices | `ADI` | Blended indices (RED, BLUE, NTI, House, …) |
| Adjacent Rates | `ADR` | Cross-venue reference rates |
| Chart series | `G ADJ:red` | History for any index or rate id |

`/` filters the table. Open a row for constituents/sources and a history chart. `o` opens Adjacent.

## API key (optional)

Public Adjacent endpoints work without a key. For the authenticated catalog, run **Adjacent: set API key** in the command bar, or set `ADJACENT_API_KEY` in the process environment before launching Gloomberb.

## Headless

```bash
gloomberb fn ADI
gloomberb fn ADR --json
gloomberb catalog ADJ red
```

## Network

Talks to `api.adjacent.markets` only.

## License

MIT. Adjacent names identify the data provider and do not grant trademark rights.
