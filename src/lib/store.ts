import { create } from 'zustand'
import { loadGraphFromDb } from './db'
import { buildGraphDataFromRows, buildNeighborhoodSubgraph, GraphData } from './graph'

export type FetchStatus = 'idle' | 'loading' | 'done' | 'error'

export const SEED_ARTICLES = ['William James', 'William Blake']

interface State {
  fetchStatus: FetchStatus
  hoveredNode: string | null
  graphData: GraphData | null
  fullGraphData: GraphData | null
  navStack: string[]

  loadData: () => Promise<void>
  drillDown: (title: string) => void
  goBack: () => void
  setHoveredNode: (title: string | null) => void
}

export const useStore = create<State>((set, get) => ({
  fetchStatus: 'idle',
  hoveredNode: null,
  graphData: null,
  fullGraphData: null,
  navStack: [],

  loadData: async () => {
    set({ fetchStatus: 'loading' })
    try {
      const { nodes, edges } = await loadGraphFromDb()
      const graphData = buildGraphDataFromRows(nodes, edges, true, SEED_ARTICLES)
      set({ graphData, fullGraphData: graphData, fetchStatus: 'done' })
    } catch (e) {
      console.error(e)
      set({ fetchStatus: 'error' })
    }
  },

  drillDown: (title) => {
    const { fullGraphData } = get()
    if (!fullGraphData) return

    const neighborhood = buildNeighborhoodSubgraph(fullGraphData, title, SEED_ARTICLES)
    if (neighborhood) {
      set({ graphData: neighborhood, navStack: [title] })
    }
  },

  goBack: () => {
    const { fullGraphData, navStack } = get()
    if (!fullGraphData || navStack.length === 0) return
    set({ graphData: fullGraphData, navStack: [] })
  },

  setHoveredNode: (title) => set({ hoveredNode: title }),
}))
