import { create } from 'zustand'
import { loadGraphFromDb } from './db'
import { buildGraphDataFromRows, buildPathSubgraph, GraphData } from './graph'

export type FetchStatus = 'idle' | 'loading' | 'done' | 'error'

export const SEED_ARTICLES = ['William James', 'William Blake']

interface State {
  fetchStatus: FetchStatus
  selectedNode: string | null
  hoveredNode: string | null
  graphData: GraphData | null
  fullGraphData: GraphData | null
  pathGraphData: GraphData | null
  viewMode: 'full' | 'path'
  allNodes: { id: string; node_type: string; wiki_url: string }[]
  allEdges: { source: string; target: string }[]

  loadData: () => Promise<void>
  selectNode: (title: string | null) => void
  exitPathView: () => void
  setHoveredNode: (title: string | null) => void
}

export const useStore = create<State>((set, get) => ({
  fetchStatus: 'idle',
  selectedNode: null,
  hoveredNode: null,
  graphData: null,
  fullGraphData: null,
  pathGraphData: null,
  viewMode: 'full',
  allNodes: [],
  allEdges: [],

  loadData: async () => {
    set({ fetchStatus: 'loading' })
    try {
      const { nodes, edges } = await loadGraphFromDb()
      const graphData = buildGraphDataFromRows(nodes, edges, true, SEED_ARTICLES)
      set({ allNodes: nodes, allEdges: edges, graphData, fullGraphData: graphData, fetchStatus: 'done' })
    } catch (e) {
      console.error(e)
      set({ fetchStatus: 'error' })
    }
  },

  selectNode: (title) => {
    if (!title) {
      set({ selectedNode: null })
      return
    }
    const { fullGraphData } = get()
    if (!fullGraphData) return

    const seedSet = new Set(SEED_ARTICLES)
    if (seedSet.has(title)) {
      // Clicking a seed just selects it, no path view
      set({ selectedNode: title })
      return
    }

    const pathGraph = buildPathSubgraph(fullGraphData, title, SEED_ARTICLES)
    if (pathGraph) {
      set({ selectedNode: title, pathGraphData: pathGraph, graphData: pathGraph, viewMode: 'path' })
    } else {
      set({ selectedNode: title })
    }
  },

  exitPathView: () => {
    const { fullGraphData } = get()
    set({ selectedNode: null, pathGraphData: null, graphData: fullGraphData, viewMode: 'full' })
  },

  setHoveredNode: (title) => set({ hoveredNode: title }),
}))
