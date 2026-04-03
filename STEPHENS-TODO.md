# TODO's

## ⚠️ DIRECTION CHANGE — All-Browser App (SQLRooms + cosmos.gl)

**All Python notebooks are DEPRECATED.** `graph.ipynb`, `graph.py`, `main.py` are legacy and will be removed when the browser app is built.

### New Architecture (fully browser-side, no server, no Python)
1. **File drop** — user drops any CSV or Parquet containing Wikipedia article URLs into the browser
2. **DuckDB-WASM** — reads the file in-browser, extracts Wikipedia article titles from URLs
3. **Wikipedia PHP API (CORS-compliant)** — browser calls `https://en.wikipedia.org/w/api.php?origin=*` directly to fetch internal links for each seed article
4. **Optional gap-fill** — same API call, fetches links for articles connected to seeds; cosmos.gl handles large graphs natively via GPU; toggle expanded nodes on/off. Inspired by [6 Degrees of Wikipedia](https://www.sixdegreesofwikipedia.com/) — could let users choose hop depth or a node count cap, with a warning that going deep is at their own risk (graph gets very large very fast)
   - **Pre-query metadata** — before a large expansion, do a lightweight API pass to collect signal: how many new nodes would be added, which candidate articles are linked to by the most seeds (high connectivity = more meaningful), categories of candidate articles. Surface this to the user so they can make an informed decision or filter before committing to the full fetch.
   - **Drill-down granularity** — as the user explores deeper (selecting a node, expanding a subgraph), the metadata should get more specific: e.g. which articles does *this* node link to, how many of those are already in the graph vs new, what categories do they fall into. Progressively richer context as you go deeper, not just top-level counts.
5. **cosmos.gl via `@sqlrooms/cosmos`** — renders the force graph entirely in-browser
6. **Click node** → opens Wikipedia article URL in new tab
7. **Click node** → highlights all connected edges + neighbor nodes
8. **Toggle** expanded/gap-fill nodes on/off

### Wikipedia Browser API Details

**Base URL:** `https://en.wikipedia.org/w/api.php`
**CORS:** Add `origin=*` to any request — Wikipedia sets `Access-Control-Allow-Origin` header, works directly from browser with no proxy needed. No auth required for read operations.

**Key endpoints for this app:**

| Use | Params |
|---|---|
| Internal links from article | `action=query&prop=links&titles=<title>&pllimit=max&plnamespace=0&format=json&origin=*` |
| Backlinks to article | `action=query&list=backlinks&bltitle=<title>&bllimit=max&format=json&origin=*` |
| Page metadata (link count, size) | `action=query&prop=info&titles=<title>&format=json&origin=*` |
| Categories | `action=query&prop=categories&titles=<title>&cllimit=max&format=json&origin=*` |
| Parse wikitext to HTML | `action=parse&prop=text&page=<title>&format=json&origin=*` |
| Multiple titles at once | `titles=Title1|Title2|Title3` (up to 50 per request) |

**Pagination:** responses include a `continue` object when there are more results — re-request with those params merged in until no `continue` is returned.

**Rate limits:** generous for anonymous read-only (~200 req/s per IP). Recommend a small delay (100ms) between requests to be polite.

**Pre-query metadata pattern:** use `prop=info` first — returns link counts and page size without fetching actual links. Use this to show users "this expansion would add ~N nodes" before they commit to a full `prop=links` fetch.

**Data flow for this app:**
1. User drops CSV → DuckDB-WASM extracts Wikipedia titles from URLs
2. Batch fetch `prop=links` for all seed titles (50 at a time via `titles=A|B|C`)
3. Build edges where seed articles mutually link to each other
4. Optional gap-fill: fetch `prop=links` for expanded nodes; pre-flight with `prop=info` to show scope first
5. cosmos.gl renders — all in browser, nothing leaves the machine

### Reference: Observable Notebooks (Mike Bostock)
- https://observablehq.com/@mbostock/working-with-wikipedia-data
- https://observablehq.com/@mbostock/wikipedia-recent-changes

Study these for browser-side Wikipedia API patterns before building.

### When ready to build
- New directory (or new repo) for the JS/React app
- Stack: SQLRooms + `@sqlrooms/cosmos` + DuckDB-WASM + React
- Reference: https://github.com/sqlrooms/sqlrooms, https://github.com/jjballano/sqlrooms-examples
- cosmos.gl (OpenJS, MIT): https://github.com/cosmograph-org/cosmos
- Do NOT use `@cosmograph/cosmograph` (no license)
- Seed articles visually distinct from expanded nodes

### Legacy TODOs (Python era — no longer relevant)
- ~~clickable nodes, highlight edges, Marimo, ipywidgets, HuggingFace, fullscreen Jupyter~~

---

## Claude's Plan (2026-04-02)

### 1. Edge / Connection Logic
- An edge exists between two seed articles when either article's title appears in the other's Wikipedia internal link list (bidirectional check, already partially working)
- "Fill in what we don't have" = ensure all 60 seed articles have their full link lists fetched and cached; re-fetch any missing ones
- No fuzzy/substring title matching — only exact Wikipedia internal link title matches to keep it clean

### 2. Data Layer
- Switch from pandas to **pyarrow / polars** for node/edge DataFrames
- Pass to Cosmograph via Arrow-backed structures (cosmo already supports this)
- Keeps things fast and sets up for potential HuggingFace dataset export later

### 3. Marimo Notebook (primary)
- Build `graph.py` as a Marimo app (runs in browser, supports reactive widgets natively)
- Features to include:
  - Clickable nodes → open Wikipedia article URL in new browser tab
  - Visible edges (thicker/colored)
  - Click a node → highlight all its connected edges and neighbor nodes
  - Widget to toggle display of "expanded" nodes (articles connected to seed set but not in it) on/off
  - Seed articles visually distinguished (color/size) from expanded nodes
  - Marimo handles fullscreen naturally since it runs in the browser

### 4. Jupyter Fallback (`graph.ipynb`)
- Keep existing notebook updated with the same edge logic + pyarrow handoff
- Add ipywidgets where feasible (limited compared to Marimo)

### Open Questions / Decisions Made
- Arrow for data handoff: confirmed, use pyarrow
- Marimo: **deprecated** — Cosmograph anywidget ESM doesn't initialize in Marimo's browser runtime; graph.py kept but non-functional, remove when ready
- HuggingFace: possible future destination for the dataset, not blocking
- Browser app upgrade: see notes below

---

## Browser Upgrade Notes (2026-04-02)

### Cosmograph JS library (`@cosmograph/cosmograph`, `@cosmograph/react`)
- Accepts Parquet (`.parquet`/`.pq`) and Apache Arrow natively — **no DuckDB required**
- Also accepts CSV, JSON, JS objects, URLs
- Has a `MosaicVgplotComponent` in the API — some Mosaic.js integration exists
- No SQLROOMS integration documented
- Docs: https://cosmograph.app/docs-lib/

### Apple Embedding Atlas (https://github.com/apple/embedding-atlas)
- Fully OSS (Apple), MIT licensed
- **Not a replacement for Cosmograph** — it's a scatter plot / embedding explorer, not a network graph
- Renders UMAP/t-SNE style 2D density maps with auto-clustering, nearest-neighbor search, cross-filtering
- Python widget + CLI, accepts Parquet, WebGPU rendering
- **Potential complement**: embed Wikipedia article text (e.g. via sentence-transformers), UMAP to 2D, explore semantic clusters alongside the link graph — "which articles are semantically close?" vs "which articles link to each other?"
- Future idea, not blocking

### Cosmograph 2.0 Stack Breakdown (2026-04-02)

Cosmograph 2.0 is built on four OSS layers — all usable independently:

| Layer | Package | Role |
|---|---|---|
| GPU rendering + layout | `cosmos.gl` (OpenJS) | WebGL force simulation on GPU — faster than d3-force or 3d-force-graph (CPU) |
| Data pipeline | DuckDB-WASM + Apache Arrow | In-browser SQL queries, filtering, aggregation; zero-copy columnar transfer to WebGL |
| Cross-filtering framework | Mosaic (UW IDL) | Linked views, interactive filtering across charts |
| React app shell | SQLRooms | Zustand state, composable layout, DuckDB hooks, plugin system |

**Two sources of speed:**
- *Rendering speed*: cosmos.gl runs the entire force simulation as WebGL shaders on the GPU
- *Data speed*: DuckDB-WASM + Arrow handles filtering/aggregation in-browser without a server

**SQLRooms has `@sqlrooms/cosmos`** — React components + hooks wrapping cosmos.gl with Zustand state management. Working example app: https://github.com/jjballano/sqlrooms-examples (cosmos graph + cosmos 2D embedding examples).

**Decision: no 3D needed** — cosmos.gl is 2D only, which is fine. 3D (via 3d-force-graph) loses GPU simulation and falls back to CPU d3-force-3d. Not worth it for this project.

**Preferred browser architecture for this project:**
1. Python pipeline → `nodes.parquet` + `edges.parquet` (via pyarrow) — or just CSV
2. **No server needed** — drag and drop file into the browser app; DuckDB-WASM reads it entirely in-memory, nothing leaves the machine
3. SQLRooms app: file drop → DuckDB-WASM → SQL filter/query → cosmos.gl renders via `@sqlrooms/cosmos`
4. Mosaic for cross-filtering (e.g. filter by connection count, article category)
5. Click node → open Wikipedia URL
6. Can also host the static app on Cloudflare Pages (free) if sharing — user still drops their own data file

**References:**
- cosmos.gl: https://github.com/cosmograph-org/cosmos (now OpenJS)
- SQLRooms: https://github.com/sqlrooms/sqlrooms
- SQLRooms examples: https://github.com/jjballano/sqlrooms-examples
- Mosaic: https://github.com/uwdata/mosaic

**License clarity:**
- `cosmos.gl` (OpenJS): MIT ✓
- `@cosmograph/cosmograph`: no license stated = all rights reserved. Avoid.
- `@sqlrooms/cosmos` wraps cosmos.gl directly — bypasses Cosmograph's proprietary layer entirely ✓
- **Decision: SQLRooms all the way. Drop @cosmograph/cosmograph.**

**Status:** hold, build when ready to go browser/public

---

### D3 + Observable + Cloudflare (simpler alternative)
- **D3 force graph**: fully OSS (ISC license), complete control over interaction — click to open Wikipedia, highlight neighbors, custom tooltips, everything
- **Observable notebooks**: shareable URL, runs in browser, D3 native, collaborative, free tier — send a link and anyone sees the live graph
- **Cloudflare R2**: host `nodes.parquet` + `edges.parquet`, free tier, CORS-friendly; Workers available if ETL ever needs a server-side step
- **Data flow**: Python pipeline → parquet on R2 → Observable fetches via URL → D3 renders
- Observable supports Apache Arrow/Parquet natively via `apache-arrow` npm package
- More setup than Cosmograph but fully open, shareable, and maintainable long-term
- **On Cosmograph**: Python wrapper is open but core JS renderer (`@cosmograph/cosmograph`) is source-available only — no license for self-hosting or modification. This is the reason to move on.
- **Status**: hold — SQLRooms/cosmos.gl stack above is preferred for performance at scale; D3/Observable is simpler if the graph stays small

### Browser upgrade path
- Python pipeline exports `nodes.parquet` + `edges.parquet`
- Browser JS app reads them directly
- Could wire up Mosaic.js for linked views (histogram of connection counts, etc.) if desired later
- TODO: remove Marimo (`graph.py`, `marimo` dep from pyproject.toml) when ready

