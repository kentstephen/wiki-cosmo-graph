const WIKI_API = 'https://en.wikipedia.org/w/api.php'
const HEADERS = { 'User-Agent': 'wiki-cosmo-graph/1.0' }

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
export async function fetchLinks(title: string): Promise<string[]> {
  const links: string[] = []
  const params: Record<string, string> = {
    action: 'query', prop: 'links', titles: title,
    pllimit: 'max', plnamespace: '0', format: 'json', origin: '*',
  }
  while (true) {
    const url = `${WIKI_API}?${new URLSearchParams(params)}`
    const res = await fetch(url, { headers: HEADERS })
    const data = await res.json()
    for (const page of Object.values(data.query?.pages ?? {}) as any[]) {
      for (const link of page.links ?? []) links.push(link.title)
    }
    if (!data.continue) break
    Object.assign(params, data.continue)
    await sleep(80)
  }
  return links
}

/** Lightweight pre-query: returns link count + categories for up to 50 titles at once. */
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
    if (titles.length > 50) await sleep(80)
  }
  return result
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }
