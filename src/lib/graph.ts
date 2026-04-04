import { forceSimulation, forceLink, forceManyBody, forceCenter } from 'd3-force'

export interface GraphData {
  nodes: string[]
  nodeUrls: string[]
  nodeTypes: ('seed' | 'expanded')[]
  edges: [number, number][]
  pointPositions: Float32Array
  pointSizes: Float32Array
  pointColors: Float32Array
  linkIndexes: Float32Array
  linkColors: Float32Array
  adjacency: Map<number, number[]>
}

const LINK_COLOR:  [number, number, number, number] = [0.373, 0.455, 0.761, 0.15]
const MIN_SIZE = 1
const MAX_SIZE = 8
const SEED_SIZE = 14
const SEED_COLOR: [number, number, number, number] = [1.0, 0.75, 0.2, 1.0] // gold/amber

// Utility/infrastructure Wikipedia pages to filter out
const FILTERED_NODES = new Set([
  'Doi (identifier)', 'ISBN (identifier)', 'ISSN (identifier)',
  'JSTOR (identifier)', 'OCLC (identifier)', 'PMID (identifier)',
  'S2CID (identifier)', 'Wayback Machine',
])

// 50-step continuous colormap using the original cosmos purple-blue palette
const COLORMAP = buildColormap(50, [
  [0.18, 0.22, 0.50],  // dark indigo — low degree
  [0.294, 0.357, 0.749], // #4B5BBF
  [0.373, 0.455, 0.761], // #5F74C2
  [0.55, 0.65, 0.90],   // lighter periwinkle
  [0.80, 0.85, 1.00],   // near-white lavender — high degree
])

function buildColormap(steps: number, stops: [number, number, number][]): [number, number, number, number][] {
  const map: [number, number, number, number][] = []
  for (let s = 0; s < steps; s++) {
    const t = s / (steps - 1)
    const seg = t * (stops.length - 1)
    const i = Math.min(Math.floor(seg), stops.length - 2)
    const f = seg - i
    const a = stops[i]
    const b = stops[i + 1]
    map.push([
      a[0] + (b[0] - a[0]) * f,
      a[1] + (b[1] - a[1]) * f,
      a[2] + (b[2] - a[2]) * f,
      0.4 + 0.6 * t,
    ])
  }
  return map
}

function lerpColor(t: number): [number, number, number, number] {
  const idx = Math.round(Math.max(0, Math.min(1, t)) * (COLORMAP.length - 1))
  return COLORMAP[idx]
}

/** BFS shortest path from `start` to any node in `targets`. Returns index array or null. */
export function findPath(adjacency: Map<number, number[]>, start: number, targets: Set<number>): number[] | null {
  if (targets.has(start)) return [start]
  const visited = new Set<number>([start])
  const parent = new Map<number, number>()
  const queue = [start]
  let head = 0
  while (head < queue.length) {
    const cur = queue[head++]
    for (const nb of adjacency.get(cur) ?? []) {
      if (visited.has(nb)) continue
      visited.add(nb)
      parent.set(nb, cur)
      if (targets.has(nb)) {
        // reconstruct
        const path = [nb]
        let p = nb
        while (parent.has(p)) { p = parent.get(p)!; path.push(p) }
        return path.reverse()
      }
      queue.push(nb)
    }
  }
  return null
}

export function buildGraphDataFromRows(
  allNodes: { id: string; node_type: string; wiki_url: string }[],
  allEdges: { source: string; target: string }[],
  showExpanded: boolean,
  seeds: string[],
): GraphData {
  const seedSet = new Set(seeds)

  // Filter out utility/infrastructure nodes
  const filteredNodes = allNodes.filter(n => !FILTERED_NODES.has(n.id))

  const visibleNodes = showExpanded
    ? filteredNodes
    : filteredNodes.filter(n => seedSet.has(n.id))

  const nodes = visibleNodes.map(n => n.id)
  const nodeUrls = visibleNodes.map(n => n.wiki_url)
  const nodeTypes = visibleNodes.map(n => seedSet.has(n.id) ? 'seed' : 'expanded') as ('seed' | 'expanded')[]
  const nodeIndex = new Map(nodes.map((n, i) => [n, i]))

  const edgeSet = new Set<string>()
  const edges: [number, number][] = []
  for (const { source, target } of allEdges) {
    if (FILTERED_NODES.has(source) || FILTERED_NODES.has(target)) continue
    const si = nodeIndex.get(source)
    const ti = nodeIndex.get(target)
    if (si === undefined || ti === undefined) continue
    const key = si < ti ? `${si}-${ti}` : `${ti}-${si}`
    if (!edgeSet.has(key)) {
      edgeSet.add(key)
      edges.push([si, ti])
    }
  }

  // Build adjacency list for path finding
  const adjacency = new Map<number, number[]>()
  for (const [s, t] of edges) {
    if (!adjacency.has(s)) adjacency.set(s, [])
    if (!adjacency.has(t)) adjacency.set(t, [])
    adjacency.get(s)!.push(t)
    adjacency.get(t)!.push(s)
  }

  // Compute degree (number of edges) per node
  const degree = new Uint32Array(nodes.length)
  for (const [s, t] of edges) {
    degree[s]++
    degree[t]++
  }

  // Rank-based sizing/coloring for even distribution across the full range
  // Exclude seeds from ranking (they get special treatment)
  const nonSeedIndices = nodes.map((n, i) => ({ i, d: degree[i] })).filter(x => !seedSet.has(nodes[x.i]))
  nonSeedIndices.sort((a, b) => a.d - b.d)
  const tByNode = new Float32Array(nodes.length)
  for (let r = 0; r < nonSeedIndices.length; r++) {
    tByNode[nonSeedIndices[r].i] = nonSeedIndices.length > 1 ? r / (nonSeedIndices.length - 1) : 0.5
  }

  const pointSizes = new Float32Array(nodes.length)
  const pointColors = new Float32Array(nodes.length * 4)
  for (let i = 0; i < nodes.length; i++) {
    if (seedSet.has(nodes[i])) {
      pointSizes[i] = SEED_SIZE
      pointColors.set(SEED_COLOR, i * 4)
    } else {
      const t = tByNode[i]
      pointSizes[i] = MIN_SIZE + (MAX_SIZE - MIN_SIZE) * t
      pointColors.set(lerpColor(t), i * 4)
    }
  }

  // Pre-compute positions with d3-force (static — no live simulation)
  const simNodes = nodes.map(() => ({} as { x?: number; y?: number }))
  const simLinks = edges.map(([s, t]) => ({ source: s, target: t }))

  const sim = forceSimulation(simNodes as any)
    .force('link', forceLink(simLinks).strength(0.05).distance(50))
    .force('charge', forceManyBody().strength(-200))
    .force('center', forceCenter(0, 0))
    .stop()

  for (let i = 0; i < 500; i++) sim.tick()

  const pointPositions = new Float32Array(nodes.length * 2)
  for (let i = 0; i < nodes.length; i++) {
    pointPositions[i * 2]     = simNodes[i].x ?? 0
    pointPositions[i * 2 + 1] = simNodes[i].y ?? 0
  }

  const linkIndexes = new Float32Array(edges.length * 2)
  edges.forEach(([s, t], i) => { linkIndexes[i * 2] = s; linkIndexes[i * 2 + 1] = t })

  const linkColors = new Float32Array(edges.length * 4)
  for (let i = 0; i < edges.length; i++) linkColors.set(LINK_COLOR, i * 4)

  return { nodes, nodeUrls, nodeTypes, edges, pointPositions, pointSizes, pointColors, linkIndexes, linkColors, adjacency }
}

const PATH_NODE_COLOR: [number, number, number, number] = [0.55, 0.65, 0.90, 0.9]
const PATH_LINK_COLOR: [number, number, number, number] = [0.55, 0.65, 0.90, 0.5]
const SELECTED_COLOR: [number, number, number, number] = [1.0, 0.55, 0.2, 1.0] // orange for selected node

/** Build a small subgraph containing only the BFS paths from `selected` to each seed. */
export function buildPathSubgraph(
  fullGraph: GraphData,
  selected: string,
  seeds: string[],
): GraphData | null {
  const seedSet = new Set(seeds)
  const startIdx = fullGraph.nodes.indexOf(selected)
  if (startIdx < 0) return null

  // Collect all path nodes
  const pathNodeIndices = new Set<number>([startIdx])
  const pathEdgePairs: [number, number][] = []

  for (const seed of seeds) {
    const seedIdx = fullGraph.nodes.indexOf(seed)
    if (seedIdx < 0 || seedIdx === startIdx) continue
    const path = findPath(fullGraph.adjacency, startIdx, new Set([seedIdx]))
    if (!path) continue
    for (const n of path) pathNodeIndices.add(n)
    for (let i = 0; i < path.length - 1; i++) {
      pathEdgePairs.push([path[i], path[i + 1]])
    }
  }

  if (pathNodeIndices.size <= 1) return null

  // Map old indices → new indices
  const oldToNew = new Map<number, number>()
  const sortedOld = Array.from(pathNodeIndices).sort((a, b) => a - b)
  sortedOld.forEach((oldIdx, newIdx) => oldToNew.set(oldIdx, newIdx))

  const nodes = sortedOld.map(i => fullGraph.nodes[i])
  const nodeUrls = sortedOld.map(i => fullGraph.nodeUrls[i])
  const nodeTypes = sortedOld.map(i => fullGraph.nodeTypes[i])

  // Deduplicate edges
  const edgeSet = new Set<string>()
  const edges: [number, number][] = []
  for (const [a, b] of pathEdgePairs) {
    const na = oldToNew.get(a)!
    const nb = oldToNew.get(b)!
    const key = na < nb ? `${na}-${nb}` : `${nb}-${na}`
    if (!edgeSet.has(key)) {
      edgeSet.add(key)
      edges.push([na, nb])
    }
  }

  // Adjacency for the subgraph
  const adjacency = new Map<number, number[]>()
  for (const [s, t] of edges) {
    if (!adjacency.has(s)) adjacency.set(s, [])
    if (!adjacency.has(t)) adjacency.set(t, [])
    adjacency.get(s)!.push(t)
    adjacency.get(t)!.push(s)
  }

  // Colors and sizes
  const pointSizes = new Float32Array(nodes.length)
  const pointColors = new Float32Array(nodes.length * 4)
  for (let i = 0; i < nodes.length; i++) {
    if (seedSet.has(nodes[i])) {
      pointSizes[i] = SEED_SIZE
      pointColors.set(SEED_COLOR, i * 4)
    } else if (nodes[i] === selected) {
      pointSizes[i] = 12
      pointColors.set(SELECTED_COLOR, i * 4)
    } else {
      pointSizes[i] = 6
      pointColors.set(PATH_NODE_COLOR, i * 4)
    }
  }

  // Force layout for the small subgraph — spread it out nicely
  const simNodes = nodes.map(() => ({} as { x?: number; y?: number }))
  const simLinks = edges.map(([s, t]) => ({ source: s, target: t }))

  const sim = forceSimulation(simNodes as any)
    .force('link', forceLink(simLinks).strength(0.3).distance(120))
    .force('charge', forceManyBody().strength(-400))
    .force('center', forceCenter(0, 0))
    .stop()

  for (let i = 0; i < 300; i++) sim.tick()

  const pointPositions = new Float32Array(nodes.length * 2)
  for (let i = 0; i < nodes.length; i++) {
    pointPositions[i * 2]     = simNodes[i].x ?? 0
    pointPositions[i * 2 + 1] = simNodes[i].y ?? 0
  }

  const linkIndexes = new Float32Array(edges.length * 2)
  edges.forEach(([s, t], i) => { linkIndexes[i * 2] = s; linkIndexes[i * 2 + 1] = t })

  const linkColors = new Float32Array(edges.length * 4)
  for (let i = 0; i < edges.length; i++) linkColors.set(PATH_LINK_COLOR, i * 4)

  return { nodes, nodeUrls, nodeTypes, edges, pointPositions, pointSizes, pointColors, linkIndexes, linkColors, adjacency }
}
