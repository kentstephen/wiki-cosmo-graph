import { create } from 'zustand'
import { fetchLinks } from './wikipedia'
import { buildGraphData, GraphData } from './graph'

export type FetchStatus = 'idle' | 'fetching' | 'done' | 'error'

export const SEED_ARTICLES = ['William James', 'William Blake']

interface State {
  seeds: string[]
  linkMap: Map<string, string[]>
  showExpanded: boolean
  fetchStatus: FetchStatus
  fetchProgress: { done: number; total: number }
  selectedNode: string | null
  hoveredNode: string | null
  graphData: GraphData | null

  fetchAllLinks: () => Promise<void>
  toggleExpanded: () => void
  selectNode: (title: string | null) => void
  setHoveredNode: (title: string | null) => void
}

export const useStore = create<State>((set, get) => ({
  seeds: SEED_ARTICLES,
  linkMap: new Map(),
  showExpanded: false,
  fetchStatus: 'idle',
  fetchProgress: { done: 0, total: 0 },
  selectedNode: null,
  hoveredNode: null,
  graphData: null,

  fetchAllLinks: async () => {
    const { seeds } = get()
    set({ fetchStatus: 'fetching', fetchProgress: { done: 0, total: seeds.length } })
    const linkMap = new Map<string, string[]>()
    for (let i = 0; i < seeds.length; i++) {
      try {
        linkMap.set(seeds[i], await fetchLinks(seeds[i]))
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
    set({ showExpanded: next, graphData: buildGraphData(seeds, linkMap, next) })
  },

  selectNode: (title) => set({ selectedNode: title }),
  setHoveredNode: (title) => set({ hoveredNode: title }),
}))
