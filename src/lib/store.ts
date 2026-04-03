import { create } from 'zustand'
import { loadGraphFromDb } from './db'
import { buildGraphDataFromRows, GraphData } from './graph'

export type FetchStatus = 'idle' | 'loading' | 'done' | 'error'

export const SEED_ARTICLES = ['William James', 'William Blake']

interface State {
  showExpanded: boolean
  fetchStatus: FetchStatus
  selectedNode: string | null
  hoveredNode: string | null
  graphData: GraphData | null
  // raw rows for toggling expanded
  allNodes: { id: string; node_type: string; wiki_url: string }[]
  allEdges: { source: string; target: string }[]

  loadData: () => Promise<void>
  toggleExpanded: () => void
  selectNode: (title: string | null) => void
  setHoveredNode: (title: string | null) => void
}

export const useStore = create<State>((set, get) => ({
  showExpanded: true,
  fetchStatus: 'idle',
  selectedNode: null,
  hoveredNode: null,
  graphData: null,
  allNodes: [],
  allEdges: [],

  loadData: async () => {
    set({ fetchStatus: 'loading' })
    try {
      const { nodes, edges } = await loadGraphFromDb()
      const graphData = buildGraphDataFromRows(nodes, edges, get().showExpanded, SEED_ARTICLES)
      set({ allNodes: nodes, allEdges: edges, graphData, fetchStatus: 'done' })
    } catch (e) {
      console.error(e)
      set({ fetchStatus: 'error' })
    }
  },

  toggleExpanded: () => {
    const { showExpanded, allNodes, allEdges } = get()
    const next = !showExpanded
    const graphData = buildGraphDataFromRows(allNodes, allEdges, next, SEED_ARTICLES)
    set({ showExpanded: next, graphData })
  },

  selectNode: (title) => set({ selectedNode: title }),
  setHoveredNode: (title) => set({ hoveredNode: title }),
}))
