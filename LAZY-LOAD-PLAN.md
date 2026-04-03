# Lazy-Load Missing Wikipedia Links on Graph Zoom

## What & Why
As the user zooms into the force graph, nodes come into view that may not have edge data yet.
Instead of pre-fetching everything, fetch only what's visible — and only after the user stops moving.

All browser-side JS. No Python. Uses native `fetch()` + `Promise.all()`.

---

## Implementation

### 1. Debounce on camera idle (500ms)
```js
let idleTimer;
cosmos.on('move', () => {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(onViewportIdle, 500);
});
```

### 2. Find missing nodes in viewport
```js
function onViewportIdle() {
  const visible = cosmos.getVisibleNodes();
  const missing = visible.filter(n => !cache.has(n.id));
  if (missing.length === 0) return;
  fetchMissingLinks(missing.map(n => n.id));
}
```

### 3. Batch fetch (50 titles per request)
```js
async function fetchMissingLinks(titles) {
  const batches = chunk(titles, 50);
  const results = await Promise.all(batches.map(batch => {
    const t = batch.map(encodeURIComponent).join('|');
    return fetch(
      `https://en.wikipedia.org/w/api.php?action=query&prop=links` +
      `&titles=${t}&pllimit=max&plnamespace=0&format=json&origin=*`
    ).then(r => r.json());
  }));
  updateGraph(results); // parse + add new edges to cosmos
}
```

> `origin=*` is required for CORS from the browser.

### 4. Cache to skip re-fetching
`Map<title, links[]>` — populated on each fetch. Zoom in/out to same area = no new requests.

### 5. Backlinks (future)
`list=backlinks` doesn't support multi-title batching. Add with `Promise.all()` + a semaphore
capping concurrency at ~10 to stay within Wikipedia's rate limit.

---

## Key Constants
| Setting | Value |
|---|---|
| Idle debounce | 500ms |
| Batch size (links) | 50 titles |
| Batch size (backlinks) | 1 per request |
| CORS param | `origin=*` |
| Rate limit safe zone | <200 req/s |

## Verification
1. Open graph in browser
2. Zoom into a node cluster with no edges
3. Stop moving → after 500ms, Network tab shows batched Wikipedia requests
4. Edges appear for newly fetched links
5. Zoom out + back in → no new requests (cache hit)
