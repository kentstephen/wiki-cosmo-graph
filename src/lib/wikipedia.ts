const WIKI_API = 'https://en.wikipedia.org/w/api.php'
const HEADERS = { 'User-Agent': 'wiki-cosmo-graph/1.0' }

// Concurrency & rate limiting
const MAX_CONCURRENT = 6
const REQUEST_GAP_MS = 50

export function titleFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (!u.hostname.includes('wikipedia.org')) return null
    const m = u.pathname.match(/^\/wiki\/(.+)/)
    if (!m) return null
    return decodeURIComponent(m[1]).replace(/_/g, ' ').split('#')[0].trim() || null
  } catch {
    return null
  }
}

export function wikiUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}

/** Fetch all internal links for a single article, handling pagination. */
async function fetchLinksForTitle(title: string): Promise<string[]> {
  const links: string[] = []
  const params: Record<string, string> = {
    action: 'query', prop: 'links', titles: title,
    pllimit: 'max', plnamespace: '0', format: 'json', origin: '*',
  }
  while (true) {
    const url = `${WIKI_API}?${new URLSearchParams(params)}`
    const res = await fetch(url, { headers: HEADERS })
    if (!res.ok) throw new Error(`Wikipedia API ${res.status} for "${title}"`)
    const data = await res.json()
    for (const page of Object.values(data.query?.pages ?? {}) as any[]) {
      for (const link of page.links ?? []) links.push(link.title)
    }
    if (!data.continue) break
    Object.assign(params, data.continue)
    await sleep(REQUEST_GAP_MS)
  }
  return links
}

export type ProgressCallback = (done: number, total: number, current: string) => void

/**
 * Fetch links for many titles concurrently with a pool of workers.
 * Returns a Map of title → linked titles.
 */
export async function fetchLinksBatch(
  titles: string[],
  onProgress?: ProgressCallback,
  cache?: Map<string, string[]>,
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>()
  const queue = [...titles]
  let done = 0

  async function worker() {
    while (queue.length > 0) {
      const title = queue.shift()!
      if (cache?.has(title)) {
        result.set(title, cache.get(title)!)
        done++
        onProgress?.(done, titles.length, title)
        continue
      }
      try {
        const links = await fetchLinksForTitle(title)
        result.set(title, links)
        cache?.set(title, links)
      } catch (e) {
        console.warn(`Failed to fetch links for "${title}":`, e)
        result.set(title, [])
      }
      done++
      onProgress?.(done, titles.length, title)
      await sleep(REQUEST_GAP_MS)
    }
  }

  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, titles.length) }, () => worker())
  await Promise.all(workers)
  return result
}

/**
 * Build a full graph from seed articles:
 *   1. Fetch links for each seed (parallel)
 *   2. Collect all linked articles
 *   3. Fetch links for each linked article (parallel, pooled)
 *   4. Build nodes + edges
 *
 * Returns { nodes, edges } ready for buildGraphDataFromRows().
 */
export async function buildGraphFromSeeds(
  seeds: string[],
  onProgress?: ProgressCallback,
): Promise<{
  nodes: { id: string; node_type: string; wiki_url: string }[]
  edges: { source: string; target: string }[]
}> {
  const cache = new Map<string, string[]>()

  // Phase 1: fetch links for seed articles
  onProgress?.(0, seeds.length, `Fetching ${seeds.length} seed articles...`)
  const seedLinks = await fetchLinksBatch(seeds, onProgress, cache)

  // Collect all unique linked titles
  const allLinked = new Set<string>()
  for (const links of seedLinks.values()) {
    for (const link of links) allLinked.add(link)
  }
  // Remove seeds from expansion set (already fetched)
  for (const s of seeds) allLinked.delete(s)

  // Phase 2: fetch links for all linked articles
  const expandTitles = Array.from(allLinked)
  onProgress?.(0, expandTitles.length, `Expanding ${expandTitles.length} linked articles...`)
  const expandedLinks = await fetchLinksBatch(expandTitles, onProgress, cache)

  // Merge all link maps
  const allLinks = new Map([...seedLinks, ...expandedLinks])

  // Build node set: seeds + everything they link to
  const nodeSet = new Set<string>(seeds)
  for (const links of allLinks.values()) {
    for (const link of links) nodeSet.add(link)
  }

  const nodes = Array.from(nodeSet).map(id => ({
    id,
    node_type: seeds.includes(id) ? 'seed' : 'expanded',
    wiki_url: wikiUrl(id),
  }))

  // Build edges: for each article we fetched, add edges to its links (if both in nodeSet)
  const edges: { source: string; target: string }[] = []
  const edgeSet = new Set<string>()
  for (const [source, links] of allLinks) {
    if (!nodeSet.has(source)) continue
    for (const target of links) {
      if (!nodeSet.has(target)) continue
      const key = source < target ? `${source}|${target}` : `${target}|${source}`
      if (!edgeSet.has(key)) {
        edgeSet.add(key)
        edges.push({ source, target })
      }
    }
  }

  return { nodes, edges }
}

/** Lightweight pre-query: returns link count for up to 50 titles at once. */
export async function fetchPageInfo(titles: string[]): Promise<Map<string, { linkCount: number }>> {
  const result = new Map<string, { linkCount: number }>()
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50)
    const params = new URLSearchParams({
      action: 'query', prop: 'info', titles: batch.join('|'),
      inprop: 'url', format: 'json', origin: '*',
    })
    const res = await fetch(`${WIKI_API}?${params}`, { headers: HEADERS })
    const data = await res.json()
    for (const page of Object.values(data.query?.pages ?? {}) as any[]) {
      result.set(page.title, { linkCount: page.length ?? 0 })
    }
    if (titles.length > 50) await sleep(REQUEST_GAP_MS)
  }
  return result
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }
