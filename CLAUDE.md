# Project: Wikipedia Knowledge Graph

## Overview
Static force-directed graph visualization of Wikipedia article link neighborhoods. Currently seeded with William James and William Blake. Built for personal enjoyment/exploration.

## Stack
- **Visualization**: [cosmos.gl](https://github.com/cosmograph-org/) (`@cosmos.gl/graph`) — GPU-accelerated WebGL graph rendering
- **Layout**: d3-force (static, pre-computed positions — no live simulation)
- **Framework**: React 18 + TypeScript + Vite
- **State**: Zustand
- **Data**: Static `graph.json` in `/public` (pre-fetched nodes + edges)

## Architecture
- `src/lib/wikipedia.ts` — Wikipedia API client (concurrent fetching with 6-worker pool)
- `src/lib/graph.ts` — Graph data structures, d3-force layout, rank-based coloring
- `src/lib/store.ts` — Zustand state (navigation, hover, graph data)
- `src/lib/db.ts` — Data loading (fetches graph.json)
- `src/components/GraphView.tsx` — cosmos.gl rendering + interaction
- `src/App.tsx` — Root component, UI chrome

## Wikipedia PHP API
Base URL: `https://en.wikipedia.org/w/api.php`

Useful endpoints:
- Internal links from an article: `?action=query&prop=links&titles=<title>&pllimit=max&format=json`
- Backlinks to an article: `?action=query&list=backlinks&bltitle=<title>&bllimit=max&format=json`
- Page categories: `?action=query&prop=categories&titles=<title>&format=json`

## Design Decisions
- Graph is the interface — no side panels
- Static subgraphs — no hover effects or greyout in drill-down view
- Seed nodes always ruby/crimson, expanded nodes gold (rank-based by degree)
- Click drills down on full graph, opens Wikipedia on subgraph
- Pre-computed d3-force positions, render(0) — graph never moves

## TODO
- Allow users to create their own graphs by entering seed articles, using the Wikipedia API + `buildGraphFromSeeds()` to fetch and build graphs dynamically in-browser
- Build graphs and export them (format/mechanism TBD)
