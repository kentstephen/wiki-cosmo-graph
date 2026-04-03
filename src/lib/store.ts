import { create } from 'zustand'
import { titleFromUrl, fetchLinks } from './wikipedia'
import { buildGraphData, GraphData } from './graph'

export type FetchStatus = 'idle' | 'fetching' | 'done' | 'error'

interface State {
  seeds: string[]
  linkMap: Map<string, string[]>
  showExpanded: boolean
  fetchStatus: FetchStatus
  fetchProgress: { done: number; total: number }
  selectedNode: string | null
  graphData: GraphData | null

  loadCsv: (text: string) => void
  fetchAllLinks: () => Promise<void>
  toggleExpanded: () => void
  selectNode: (title: string | null) => void
}

function parseTitlesFromCsv(text: string): string[] {
  const titles = new Set<string>()
  for (const line of text.split('\n')) {
    for (const cell of line.split(',')) {
      const clean = cell.replace(/^"|"$/g, '').trim()
      const t = titleFromUrl(clean)
      if (t) titles.add(t)
    }
  }
  return Array.from(titles)
}

export const useStore = create<State>((set, get) => ({
  seeds: [],
  linkMap: new Map(),
  showExpanded: false,
  fetchStatus: 'idle',
  fetchProgress: { done: 0, total: 0 },
  selectedNode: null,
  graphData: null,

  loadCsv: (text) => {
    const seeds = parseTitlesFromCsv(text)
    set({ seeds, linkMap: new Map(), fetchStatus: 'idle', graphData: null, selectedNode: null })
  },

  fetchAllLinks: async () => {
    const { seeds } = get()
    if (!seeds.length) return
    set({ fetchStatus: 'fetching', fetchProgress: { done: 0, total: seeds.length } })
    const linkMap = new Map<string, string[]>()
    for (let i = 0; i < seeds.length; i++) {
      try {
        const links = await fetchLinks(seeds[i])
        linkMap.set(seeds[i], links)
      } catch {
        linkMap.set(seeds[i], [])
      }
      set({ fetchProgress: { done: i + 1, total: seeds.length } })
    }
    const graphData = buildGraphData(seeds, linkMap, get().showExpanded)
    set({ linkMap, fetchStatus: 'done', graphData })
  },

  toggleExpanded: () => {
    const { showExpanded, seeds, linkMap } = get()
    const next = !showExpanded
    const graphData = buildGraphData(seeds, linkMap, next)
    set({ showExpanded: next, graphData })
  },

  selectNode: (title) => set({ selectedNode: title }),
}))
