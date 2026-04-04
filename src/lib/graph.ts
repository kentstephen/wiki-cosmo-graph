import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force'

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

// Palette
const LINK_COLOR:  [number, number, number, number] = [0.78, 0.78, 0.82, 0.35] // white silver
const MIN_SIZE = 1
const MAX_SIZE = 8
const SEED_SIZE = 14
const SEED_COLOR: [number, number, number, number] = [0.8, 0.2, 0.4, 1.0] // ruby/crimson for seeds

// Utility/infrastructure Wikipedia pages to filter out
const FILTERED_NODES = new Set([
  'Doi (identifier)', 'ISBN (identifier)', 'ISSN (identifier)',
  'JSTOR (identifier)', 'OCLC (identifier)', 'PMID (identifier)',
  'S2CID (identifier)', 'Wayback Machine',
])

// Shades of gold: dark gold (low degree) → bright gold (high degree)
const COLORMAP = buildColormap(50, [
  [0.45, 0.38, 0.15],  // dark bronze-gold — low degree
  [0.65, 0.55, 0.20],  // warm gold
  [0.80, 0.68, 0.28],  // mid gold
  [0.92, 0.80, 0.35],  // bright gold
  [1.00, 0.90, 0.50],  // light gold — high degree
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

  // Build adjacency list
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

const NEIGHBOR_COLOR: [number, number, number, number] = [0.80, 0.68, 0.28, 0.9] // gold
const NEIGHBOR_LINK_COLOR: [number, number, number, number] = [0.78, 0.78, 0.82, 0.4] // white silver
const SELECTED_COLOR: [number, number, number, number] = [1.00, 0.90, 0.50, 1.0] // bright gold for selected

/** Build a subgraph of the selected node + its direct neighbors. */
export function buildNeighborhoodSubgraph(
  fullGraph: GraphData,
  selected: string,
  seeds: string[],
): GraphData | null {
  const seedSet = new Set(seeds)
  const startIdx = fullGraph.nodes.indexOf(selected)
  if (startIdx < 0) return null

  const neighborIndices = fullGraph.adjacency.get(startIdx) ?? []
  if (neighborIndices.length === 0) return null

  const subgraphIndices = new Set<number>([startIdx, ...neighborIndices])

  const oldToNew = new Map<number, number>()
  const sortedOld = Array.from(subgraphIndices).sort((a, b) => a - b)
  sortedOld.forEach((oldIdx, newIdx) => oldToNew.set(oldIdx, newIdx))

  const nodes = sortedOld.map(i => fullGraph.nodes[i])
  const nodeUrls = sortedOld.map(i => fullGraph.nodeUrls[i])
  const nodeTypes = sortedOld.map(i => fullGraph.nodeTypes[i])

  const edgeSet = new Set<string>()
  const edges: [number, number][] = []
  for (const [a, b] of fullGraph.edges) {
    if (!subgraphIndices.has(a) || !subgraphIndices.has(b)) continue
    const na = oldToNew.get(a)!
    const nb = oldToNew.get(b)!
    const key = na < nb ? `${na}-${nb}` : `${nb}-${na}`
    if (!edgeSet.has(key)) {
      edgeSet.add(key)
      edges.push([na, nb])
    }
  }

  const adjacency = new Map<number, number[]>()
  for (const [s, t] of edges) {
    if (!adjacency.has(s)) adjacency.set(s, [])
    if (!adjacency.has(t)) adjacency.set(t, [])
    adjacency.get(s)!.push(t)
    adjacency.get(t)!.push(s)
  }

  // Scale node sizes down for large neighborhoods
  const n = nodes.length
  const baseSize = n > 200 ? 3 : n > 50 ? 4 : 6
  const selectedSize = n > 200 ? 6 : n > 50 ? 8 : 12

  const pointSizes = new Float32Array(nodes.length)
  const pointColors = new Float32Array(nodes.length * 4)
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i] === selected) {
      pointSizes[i] = selectedSize
      pointColors.set(seedSet.has(nodes[i]) ? SEED_COLOR : SELECTED_COLOR, i * 4)
    } else if (seedSet.has(nodes[i])) {
      pointSizes[i] = selectedSize
      pointColors.set(SEED_COLOR, i * 4)
    } else {
      pointSizes[i] = baseSize
      pointColors.set(NEIGHBOR_COLOR, i * 4)
    }
  }

  const simNodes = nodes.map((_, i) => ({ radius: pointSizes[i] } as { x?: number; y?: number; radius: number }))
  const simLinks = edges.map(([s, t]) => ({ source: s, target: t }))

  const repulsion = n > 200 ? -800 : n > 50 ? -500 : -400
  const linkDist = n > 200 ? 200 : n > 50 ? 150 : 120

  const sim = forceSimulation(simNodes as any)
    .force('link', forceLink(simLinks).strength(0.1).distance(linkDist))
    .force('charge', forceManyBody().strength(repulsion))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide<any>().radius((d: any) => (d.radius ?? 6) + 4).strength(0.8))
    .stop()

  const ticks = n > 200 ? 600 : 400
  for (let i = 0; i < ticks; i++) sim.tick()

  const pointPositions = new Float32Array(nodes.length * 2)
  for (let i = 0; i < nodes.length; i++) {
    pointPositions[i * 2]     = simNodes[i].x ?? 0
    pointPositions[i * 2 + 1] = simNodes[i].y ?? 0
  }

  const linkIndexes = new Float32Array(edges.length * 2)
  edges.forEach(([s, t], i) => { linkIndexes[i * 2] = s; linkIndexes[i * 2 + 1] = t })

  const linkColors = new Float32Array(edges.length * 4)
  for (let i = 0; i < edges.length; i++) linkColors.set(NEIGHBOR_LINK_COLOR, i * 4)

  return { nodes, nodeUrls, nodeTypes, edges, pointPositions, pointSizes, pointColors, linkIndexes, linkColors, adjacency }
}
