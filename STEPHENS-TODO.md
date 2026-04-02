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
- Marimo: confirmed, try first; Jupyter as fallback
- HuggingFace: possible future destination for the dataset, not blocking
- Browser app upgrade: deferred

