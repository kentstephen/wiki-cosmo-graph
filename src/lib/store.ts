import { create } from 'zustand'
import { loadGraphFromDb } from './db'
import { graphDataFromPreBaked, buildNeighborhoodSubgraph, GraphData } from './graph'

export type FetchStatus = 'idle' | 'loading' | 'done' | 'error'

const DEFAULT_SEEDS = ['William James', 'William Blake']

interface State {
  fetchStatus: FetchStatus
  hoveredNode: string | null
  graphData: GraphData | null
  fullGraphData: GraphData | null
  navStack: string[]
  seedArticles: string[]

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
  seedArticles: DEFAULT_SEEDS,

  loadData: async () => {
    set({ fetchStatus: 'loading' })
    try {
      const preBaked = await loadGraphFromDb()
      const seedArticles = preBaked.seeds && preBaked.seeds.length > 0 ? preBaked.seeds : DEFAULT_SEEDS
      const graphData = graphDataFromPreBaked(preBaked)
      set({ graphData, fullGraphData: graphData, seedArticles, fetchStatus: 'done' })
    } catch (e) {
      console.error(e)
      set({ fetchStatus: 'error' })
    }
  },

  drillDown: (title) => {
    const { fullGraphData, seedArticles } = get()
    if (!fullGraphData) return

    const neighborhood = buildNeighborhoodSubgraph(fullGraphData, title, seedArticles)
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
