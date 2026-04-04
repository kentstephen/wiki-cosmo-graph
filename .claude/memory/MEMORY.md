# Project Memory

## cosmos.gl Design System (from cosmogl-graph/graph source review)

### Colors
- Background: `#2d313a` (primary), `#252830` (variant)
- Nodes: `#4B5BBF` (periwinkle blue default), `#F069B4` (pink alt)
- Links: `#5F74C2`
- Hovered ring: `#4B5BBF`
- UI text: `#ccc`, headers `#fff`

### Typography
- Font: `"Nunito Sans", -apple-system, ".SFNSText-Regular", "San Francisco", BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif`
- Controls: `10pt`, bold header
- No HTML buttons — underlined `div`s with `cursor: pointer`, `text-decoration: underline`

### Default simulation config (from create-cosmos.ts)
```
simulationGravity: 0.02, simulationRepulsion: 0.5, simulationLinkSpring: 2
simulationFriction: 0.7, simulationDecay: 10000000
linkGreyoutOpacity: 0, curvedLinks: true, enableDrag: true
pointDefaultSize: 3, linkDefaultWidth: 0.8
```

### Layout
- Graph fills 100vh, full width
- Controls: `position: absolute; top: 10px; left: 10px`
- Use `graph.render()` not `restart()` for initial render
- `rescalePositions: true` handles arbitrary input coordinates
- `fitViewDelay: 1000, fitViewPadding: 0.3` for auto-fit

### Attribution
- Every story includes: `attribution: 'visualized with <a href="https://cosmograph.app/" ...>Cosmograph</a>'`

## Session Notes (2026-04-03) — cosmos-william-james-blake-static

### What was done (04-03)
- Rank-based continuous 50-step colormap for even node size/color distribution
- Seed nodes (William James, William Blake) rendered distinctly from expanded nodes
- Filtered out 8 Wikipedia utility nodes (ISBN, JSTOR, Wayback, OCLC, DOI, PMID, S2CID, ISSN) and ~5,700 noisy edges
- Escape key exits drill-down view

### What was done (04-04) — simplified subgraph drill-down
- **Removed** BFS path subgraph (`buildPathSubgraph`, `findPath`) — was too complex and confusing
- **Removed** NodePanel entirely — side panel with neighbor lists was unhelpful noise
- **New interaction model** (graph is the whole interface):
  - **Full graph**: hover highlights node + neighbors (via `selectPointByIndex`), tooltip shows name. Click drills into neighborhood subgraph.
  - **Subgraph**: completely static — no highlighting, no greyout, no hover ring. Hover only shows tooltip. Click opens Wikipedia. "Open {name} in Wikipedia" link at top right. Back button + Escape to return.
  - Right-click always opens Wikipedia (both views)
- **New color palette**: shades of gold for nodes (dark bronze → bright gold by degree), ruby/crimson for seeds, white-silver edges, dark background `#111318`
- **Subgraph layout improvements**: `forceCollide` based on node radius to prevent overlap, adaptive force params based on node count (stronger repulsion + larger link distance for 200+ node neighborhoods), smaller node sizes for large neighborhoods
- **Tooltip fix**: clears properly on mouse move by checking cosmos `store.hoveredPoint` directly

### Key design decisions (IMPORTANT — do not re-propose)
- **No side panel** — Stephen found it confusing and unhelpful. The graph IS the interface.
- **Subgraph must be static** — no highlighting, no greyout, no visual changes on hover/click. Just nodes, edges, tooltip.
- **Click in subgraph = open Wikipedia** — not drill deeper, not re-trigger subgraph. Static view, click opens article.
- **Do NOT rebuild subgraph on click within subgraph** — this was explicitly rejected multiple times
- **Do NOT add complex UI overlays** — keep it minimal: tooltip, back button, Wikipedia link

### Longer-term: build graph with this tool
- The full browser app vision (file drop → Wikipedia API → graph construction) from STEPHENS-TODO.md
- SQLRooms / cosmos.gl / DuckDB-WASM stack
- Stephen wants to build a tool he can use himself to create connections and explore data

## Current Direction (updated 2026-04-03)

**All Python notebooks are deprecated.** Building a browser-side visualization of a Wikipedia entity network.

### Visualization Decision
- **cosmos.gl static** (`cosmos-william-james-blake-static`): pre-computed d3-force positions, `graph.render(0)` = zero simulation, no movement/shake/float ever
  - d3-force params: `forceManyBody().strength(-200)`, `forceLink().strength(0.05).distance(50)`, 500 ticks
  - Click selects + highlights neighbors only — NO auto-zoom on click
  - `fitView(0)` on load, no animation
  - 175,614 edges across 1782 nodes (William James / William Blake full internal link network)
- **FlowMap.Blue** (`flowmap-william-james-blake-duckdb-edges`): alternate viz with `@flowmap.gl/core` + Deck.gl + MapLibre
  - Synthetic lat/lon from d3-force layout
  - MapLibre blank dark basemap (no Mapbox token)
- **NOT ArcLayer** — Stephen explicitly does not want this
- **Graph must NEVER move on its own** — no simulation, no jitter, no floating, no shaking

### App Architecture
- `flowmap/` — standalone Vite/React app (separate package.json, own node_modules)
- Uses `@flowmap.gl/core` v7.3.4 + deck.gl v8 + maplibre-gl + react-map-gl v7
- Runs at localhost:5173 from within `flowmap/` directory
- Data: `public/graph.json` (shared via vite publicDir pointing to `../public`)
- DuckDB + SQLRooms for persistence (future — start with static data)

### Branches
- `explore-interaction` — original cosmos.gl app with live simulation
- `flowmap-william-james-blake-duckdb-edges` — FlowMap viz + data pipeline (175k edges)
- `flowmap-viz` — earlier FlowMap work
- `cosmos-william-james-blake-static` — static cosmos.gl with d3-force pre-computed positions

### Data Status (2026-04-03)
- fetch-links.mjs completed: 1782/1782 articles fetched, 175,614 edges built
- Re-fetched 5 initially missed: Konrad Wallenrod, Konstantin Batyushkov, Kornelije Stanković, Kresge Auditorium, Kurt Lewin
- graph.json and links-cache.json both complete
- Wikipedia API rate limit workaround: batch 5, delay 3s, skip-on-fail with cache

### Data Problem (ORIGINAL — now resolved)
Current `public/graph.json` is **wrong for the visualization**:
- 1782 nodes, but only 1808 edges — ALL involving only 2 seed nodes (William James, William Blake)
- Expanded nodes have zero edges between them
- This creates hub-and-spoke pinwheels in FlowMap, not a network

### What the graph should be
- Nodes: all 1782 Wikipedia articles
- Edges: any two articles that mutually link to each other via Wikipedia internal links
- "Fill in the gaps" = fetch links for ALL nodes, not just seeds
- This shows the connected network, not just direct neighbors of 2 hub articles

### Data Pipeline Approach
- **Wikipedia API** (`scripts/fetch-links.mjs`) — rate limited after ~400 requests, but has 220 articles cached in `public/links-cache.json`
- **DuckDB + HuggingFace hf://** — tried, HTTP errors (needs auth or path format issues)
- **zipfs community extension** — tried on wikimedia/structured-wikipedia (17GB single zip), crashed OOM
- **wikimedia/wikipedia parquet** — accessible via direct HTTPS, but only has `id, url, title, text` — no links field
- **WikiLinkGraphs (Zenodo)** — complete Wikipedia link graph TSV, but large download
- **Next attempt**: Fix Wikipedia API script rate limit (2s delay, batches of 10), run with 220 cached

### Rules / Preferences
- **New branch for every new feature** — name descriptively (e.g. `duckdb-zenodo-fetch`, not `data-pipeline`)
- **No rewrites of existing files** — new files in new directories
- **Ask before every creative/design decision**
- **No ArcLayer suggestions**
- Token count discipline — don't spawn expensive explore agents for simple lookups

## Reference: Observable Notebooks (Mike Bostock / Wikipedia)
- https://observablehq.com/@mbostock/working-with-wikipedia-data
- https://observablehq.com/@mbostock/wikipedia-recent-changes

These are reference notebooks for working with the Wikipedia API in the browser. Relevant for the all-browser architecture — check these for patterns on fetching/parsing Wikipedia data client-side.


## Venv Auto-Activation (DO NOT TOUCH .zshrc FOR THIS)

**The user was extremely frustrated by Claude modifying `.zshrc` to auto-activate the venv.**

### What happened
- Claude added an `auto_activate_venv` function to `~/.zshrc` to solve VS Code terminal venv activation
- This caused the `source .venv/bin/activate` command to run every time Claude launched (because Claude starts a shell from the project directory)
- Had to be reverted, breaking the user's setup again

### Correct solution (already in place)
Venv auto-activation is handled via `.vscode/settings.json` **only**:
```json
{
  "python.defaultInterpreterPath": "${workspaceFolder}/.venv/bin/python",
  "python.terminal.activateEnvironment": true,
  "terminal.integrated.env.osx": {
    "VIRTUAL_ENV": "${workspaceFolder}/.venv",
    "PATH": "${workspaceFolder}/.venv/bin:${env:PATH}"
  }
}
```

### Rules
- **NEVER modify `~/.zshrc` to activate a venv** — it affects all shells including Claude's
- VS Code handles venv activation via `terminal.integrated.env.osx` — this is VS Code-only and doesn't affect Claude
- Do not "fix" venv activation again unless the user explicitly asks and you use a VS Code-only approach
