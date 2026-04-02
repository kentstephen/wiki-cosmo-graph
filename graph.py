import marimo

__generated_with = "0.22.0"
app = marimo.App(width="full")


@app.cell
def _():
    import json
    import time
    import re
    from pathlib import Path
    from urllib.parse import urlparse, unquote

    import marimo as mo
    import polars as pl
    import requests
    from cosmograph import Cosmograph

    return (
        Cosmograph,
        Path,
        json,
        mo,
        pl,
        re,
        requests,
        time,
        unquote,
        urlparse,
    )


@app.cell
def _(mo, pl, re, unquote, urlparse):
    # ── Load raindrop export ──────────────────────────────────────────────────
    df_raw = pl.read_csv("raindrop-export-2026-04-02/export.csv")

    def extract_wiki_title(url: str) -> str | None:
        try:
            parsed = urlparse(url)
            if "wikipedia.org" not in parsed.netloc:
                return None
            match = re.match(r"/wiki/(.+)", parsed.path)
            if not match:
                return None
            title = unquote(match.group(1)).replace("_", " ").split("#")[0].strip()
            return title or None
        except Exception:
            return None

    wiki_titles = df_raw["url"].map_elements(extract_wiki_title, return_dtype=pl.String)
    df_raw = df_raw.with_columns(wiki_titles.alias("wiki_title"))
    wiki_articles = (
        df_raw.filter(pl.col("wiki_title").is_not_null())
        .select(["wiki_title", "title", "url"])
        .unique("wiki_title")
    )

    mo.md(f"**Seed articles loaded:** {len(wiki_articles)}")
    return df_raw, extract_wiki_title, wiki_articles


@app.cell
def _(Path, json, mo, requests, time, wiki_articles):
    # ── Fetch / load Wikipedia internal links ────────────────────────────────
    WIKI_API = "https://en.wikipedia.org/w/api.php"
    CACHE_FILE = Path(".wiki_links_cache.json")

    cache: dict = json.loads(CACHE_FILE.read_text()) if CACHE_FILE.exists() else {}

    def fetch_links(title: str) -> list[str]:
        if title in cache:
            return cache[title]
        links = []
        params = {
            "action": "query",
            "prop": "links",
            "titles": title,
            "pllimit": "max",
            "format": "json",
            "plnamespace": 0,
        }
        while True:
            r = requests.get(
                WIKI_API, params=params, headers={"User-Agent": "wiki-cosmo-graph/1.0"}
            )
            data = r.json()
            for page in data.get("query", {}).get("pages", {}).values():
                for link in page.get("links", []):
                    links.append(link["title"])
            if "continue" not in data:
                break
            params.update(data["continue"])
            time.sleep(0.1)
        cache[title] = links
        CACHE_FILE.write_text(json.dumps(cache, indent=2))
        return links

    article_titles = set(wiki_articles["wiki_title"].to_list())
    missing = [t for t in article_titles if t not in cache]
    if missing:
        for t in missing:
            fetch_links(t)

    mo.md(f"**Cache:** {len(cache)} articles | **Missing fetched:** {len(missing)}")
    return CACHE_FILE, WIKI_API, article_titles, cache, fetch_links, missing


@app.cell
def _(article_titles, cache, mo, pl, wiki_articles):
    # ── Build nodes & edges ───────────────────────────────────────────────────
    # Nodes: seed articles with Wikipedia URL
    nodes_df = wiki_articles.rename({"wiki_title": "id"}).with_columns(
        pl.lit("seed").alias("node_type"),
        (
            "https://en.wikipedia.org/wiki/"
            + pl.col("id").str.replace_all(" ", "_")
        ).alias("wiki_url"),
    )

    # Edges: A→B if B's title appears in A's internal link list (bidirectional check)
    edges = []
    for _src in article_titles:
        for _linked in cache.get(_src, []):
            if _linked in article_titles and _linked != _src:
                edges.append({"source": _src, "target": _linked})

    edges_df = pl.DataFrame(edges).unique(["source", "target"]) if edges else pl.DataFrame({"source": [], "target": []})

    mo.md(f"**Nodes:** {len(nodes_df)} | **Edges:** {len(edges_df)}")
    return edges_df, edges, nodes_df


@app.cell
def _(mo):
    # ── Controls ──────────────────────────────────────────────────────────────
    show_arrows = mo.ui.switch(label="Show arrows", value=False)
    curved = mo.ui.switch(label="Curved links", value=False)
    mo.hstack([show_arrows, curved], gap=2)
    return curved, show_arrows


@app.cell
def _(Cosmograph, curved, edges_df, mo, nodes_df, show_arrows):
    # ── Render graph ──────────────────────────────────────────────────────────
    graph = mo.ui.anywidget(
        Cosmograph(
            points=nodes_df.to_pandas(),
            links=edges_df.to_pandas(),
            point_id_by="id",
            point_label_by="id",
            point_color_by="node_type",
            point_color_by_map={"seed": "#60a5fa"},
            link_source_by="source",
            link_target_by="target",
            link_width=1.5,
            link_color="#94a3b8",
            link_greyout_opacity=0.05,
            point_greyout_opacity=0.1,
            select_point_on_click=True,
            render_hovered_point_ring=True,
            link_arrows=show_arrows.value,
            curved_links=curved.value,
            simulation_gravity=0.1,
            simulation_repulsion=2.0,
            simulation_link_spring=1.0,
            simulation_friction=0.85,
            show_labels=True,
            show_hovered_point_label=True,
            fit_view_on_init=True,
            background_color="#0f172a",
            point_label_color="#e2e8f0",
        )
    )
    graph
    return (graph,)


@app.cell
def _(graph, mo, nodes_df):
    # ── Clicked node info + Wikipedia link ───────────────────────────────────
    clicked_id = graph._widget.clicked_point_id  # type: ignore[attr-defined]

    if clicked_id:
        _row = nodes_df.filter(nodes_df["id"] == clicked_id)
        _url = _row["wiki_url"][0] if len(_row) > 0 else f"https://en.wikipedia.org/wiki/{clicked_id.replace(' ', '_')}"
        info = mo.md(f"**Selected:** [{clicked_id}]({_url}) — [open Wikipedia ↗]({_url}){{target='_blank'}}")
    else:
        info = mo.md("_Click a node to open its Wikipedia article_")

    info
    return (clicked_id, info)
