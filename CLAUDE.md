# Project: Biblical Entity Force Graph

## Overview
This project visualizes relationships between biblical (and related) entities using force-directed graphs. Data is sourced from Wikipedia via raindrop.io bookmarks and the Wikipedia PHP API, rendered using Cosmograph in Jupyter notebooks.

## Stack
- **Visualization**: [cosmograph-org](https://github.com/cosmograph-org/) Python library for force graph rendering
- **Notebooks**: Jupyter notebooks as the primary interface
- **Data sources**:
  - Wikipedia article links (via raindrop.io collections)
  - Wikipedia PHP API for internal link relations between articles
- **Package manager**: `uv`
- **Python version**: 3.12

## Data Pipeline
1. Pull Wikipedia article URLs from raindrop.io
2. Use the Wikipedia PHP API to fetch internal links between articles
3. Build a graph of nodes (entities) and edges (link relations)
4. Render with Cosmograph force graph

## Wikipedia PHP API
Base URL: `https://en.wikipedia.org/w/api.php`

Useful endpoints:
- Internal links from an article: `?action=query&prop=links&titles=<title>&pllimit=max&format=json`
- Backlinks to an article: `?action=query&list=backlinks&bltitle=<title>&bllimit=max&format=json`
- Page categories: `?action=query&prop=categories&titles=<title>&format=json`

## Cosmograph Usage
- Use `cosmograph` Python package from [cosmograph-org](https://github.com/cosmograph-org/)
- Nodes represent Wikipedia articles/entities
- Edges represent internal Wikipedia link relationships
- Node/edge data passed as pandas DataFrames or dicts

## Conventions
- Keep data fetching, graph building, and visualization in separate notebook cells or modules
- Cache API responses locally to avoid redundant requests
- Node IDs should use Wikipedia article titles (URL-decoded)
