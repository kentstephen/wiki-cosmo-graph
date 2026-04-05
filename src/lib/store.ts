import { create } from 'zustand'
import { loadGraphFromDb } from './db'
import { graphDataFromPreBaked, buildNeighborhoodSubgraph, buildPathBetweenSeeds, GraphData } from './graph'

export type FetchStatus = 'idle' | 'loading' | 'done' | 'error'

const GRAPHS = [
  { file: 'graph.json', label: 'Nikolai Fyodorov · Elon Musk' },
  { file: 'graph-williams.json', label: 'William James · William Blake' },
]

interface State {
  fetchStatus: FetchStatus
  hoveredNode: string | null
  graphData: GraphData | null
  fullGraphData: GraphData | null
  navStack: string[]
  seedArticles: string[]
  currentGraphIndex: number
  graphs: typeof GRAPHS

  showingPath: boolean

  loadGraph: (index: number) => Promise<void>
  drillDown: (title: string) => void
  goBack: () => void
  setHoveredNode: (title: string | null) => void
  togglePath: () => void
}

export const useStore = create<State>((set, get) => ({
  fetchStatus: 'idle',
  hoveredNode: null,
  graphData: null,
  fullGraphData: null,
  navStack: [],
  seedArticles: [],
  currentGraphIndex: 0,
  graphs: GRAPHS,
  showingPath: false,

  loadGraph: async (index: number) => {
    set({ fetchStatus: 'loading', navStack: [], currentGraphIndex: index })
    try {
      const preBaked = await loadGraphFromDb(GRAPHS[index].file)
      const seedArticles = preBaked.seeds && preBaked.seeds.length > 0 ? preBaked.seeds : []
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
    const { fullGraphData, navStack, showingPath } = get()
    if (!fullGraphData) return
    if (showingPath) {
      set({ graphData: fullGraphData, showingPath: false, navStack: [] })
      return
    }
    if (navStack.length === 0) return
    set({ graphData: fullGraphData, navStack: [] })
  },

  setHoveredNode: (title) => set({ hoveredNode: title }),

  togglePath: () => {
    const { showingPath, fullGraphData, seedArticles } = get()
    if (showingPath) {
      // Go back to full graph
      set({ graphData: fullGraphData, showingPath: false, navStack: [] })
    } else {
      if (!fullGraphData) return
      const pathGraph = buildPathBetweenSeeds(fullGraphData, seedArticles)
      if (pathGraph) {
        set({ graphData: pathGraph, showingPath: true, navStack: [] })
      }
    }
  },
}))
