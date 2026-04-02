# TODO's
- i want every internal link to be paired from these articles if there is a match.
- initialize a git repo which can be private for now, but we can move on the current workload to main
- i want links to be clickable for earch node, and i want a all links to be pickable. the edges should be more visible and i I'd like more interactivef features like hightlight all of the links to nodes when clicked.
- what if i want to see all the article's that are connected to these. we should probably use arrow for that (i think cosmo already does but i meant to load). Check with me about that. we could highlight the ones i started with. would be nice to have some widgets for this to toggle the missing links on and off and build a network (that is add nodes) maybe marimo is better if it is compatible. don't mind using huggingface for this.
- i'd like to use fullscreen in jupyter in vscode but that may be limited to jupyterlab, another reason to look into marimo, in fact i will be using the browser when i click on the links to read.
- might want to upgrade to the browser app at some point
* please follow up if you have questions

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

