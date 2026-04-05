import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force'
import type { PreBakedGraph } from './db'

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

/** Load a pre-baked graph from the Go CLI — convert number[] → Float32Array.
 *  If pointPositions are missing, compute them with d3-force + collision avoidance. */
export function graphDataFromPreBaked(pb: PreBakedGraph): GraphData {
  const edges = pb.edges as [number, number][]

  // Build adjacency
  const adjacency = new Map<number, number[]>()
  for (const [s, t] of edges) {
    if (!adjacency.has(s)) adjacency.set(s, [])
    if (!adjacency.has(t)) adjacency.set(t, [])
    adjacency.get(s)!.push(t)
    adjacency.get(t)!.push(s)
  }

  const pointSizes = new Float32Array(pb.pointSizes)
  const pointColors = new Float32Array(pb.pointColors)

  // Color nodes connected to BOTH seeds differently
  if (pb.seeds && pb.seeds.length >= 2) {
    const seedIndices: number[] = []
    for (let i = 0; i < pb.nodes.length; i++) {
      if (pb.seeds.includes(pb.nodes[i])) seedIndices.push(i)
    }
    if (seedIndices.length >= 2) {
      const neighborsA = new Set(adjacency.get(seedIndices[0]) ?? [])
      const neighborsB = new Set(adjacency.get(seedIndices[1]) ?? [])
      for (let i = 0; i < pb.nodes.length; i++) {
        if (pb.seeds.includes(pb.nodes[i])) continue
        if (neighborsA.has(i) && neighborsB.has(i)) {
          pointColors.set(OVERLAP_COLOR, i * 4)
          pointSizes[i] = Math.max(pointSizes[i], 6)
        }
      }
    }
  }

  // Use pre-baked positions if available, otherwise compute with d3-force
  let pointPositions: Float32Array
  if (pb.pointPositions && pb.pointPositions.length === pb.nodes.length * 2) {
    pointPositions = new Float32Array(pb.pointPositions)
  } else {
    console.log(`Computing d3-force layout for ${pb.nodes.length} nodes...`)
    pointPositions = computeLayoutWithCollision(pb.nodes.length, edges, pointSizes)
  }

  return {
    nodes: pb.nodes,
    nodeUrls: pb.nodeUrls,
    nodeTypes: pb.nodeTypes as ('seed' | 'expanded')[],
    edges,
    pointPositions,
    pointSizes,
    pointColors,
    linkIndexes: new Float32Array(pb.linkIndexes),
    linkColors: new Float32Array(pb.linkColors),
    adjacency,
  }
}

/** Pre-compute static positions using d3-force with collision avoidance. */
function computeLayoutWithCollision(
  nodeCount: number,
  edges: [number, number][],
  sizes: Float32Array,
): Float32Array {
  const simNodes = Array.from({ length: nodeCount }, (_, i) => ({
    radius: sizes[i] ?? 4,
  } as { x?: number; y?: number; radius: number }))
  const simLinks = edges.map(([s, t]) => ({ source: s, target: t }))

  const sim = forceSimulation(simNodes as any)
    .force('link', forceLink(simLinks).strength(0.05).distance(50))
    .force('charge', forceManyBody().strength(-200))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide<any>().radius((d: any) => (d.radius ?? 4) + 6).strength(0.8))
    .stop()

  for (let i = 0; i < 500; i++) sim.tick()

  const positions = new Float32Array(nodeCount * 2)
  for (let i = 0; i < nodeCount; i++) {
    positions[i * 2] = simNodes[i].x ?? 0
    positions[i * 2 + 1] = simNodes[i].y ?? 0
  }
  return positions
}

// Palette
const OVERLAP_COLOR: [number, number, number, number] = [0.30, 0.75, 0.70, 0.95] // teal — connected to both seeds
const NEIGHBOR_COLOR: [number, number, number, number] = [0.80, 0.68, 0.28, 0.9] // gold
const NEIGHBOR_LINK_COLOR: [number, number, number, number] = [0.78, 0.78, 0.82, 0.4] // white silver
const SELECTED_COLOR: [number, number, number, number] = [1.00, 0.90, 0.50, 1.0] // bright gold for selected
const SEED_COLOR: [number, number, number, number] = [0.8, 0.2, 0.4, 1.0] // ruby/crimson for seeds

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

  // Pre-compute layout with d3-force (static — no live simulation)
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

// --- Path finding ---

const PATH_NODE_COLOR: [number, number, number, number] = [0.55, 0.70, 0.85, 0.9]
const PATH_LINK_COLOR: [number, number, number, number] = [0.55, 0.70, 0.85, 0.5]

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

/** Build a subgraph showing the shortest path between the two seeds. */
export function buildPathBetweenSeeds(
  fullGraph: GraphData,
  seeds: string[],
): GraphData | null {
  if (seeds.length < 2) return null
  const seedSet = new Set(seeds)
  const idxA = fullGraph.nodes.indexOf(seeds[0])
  const idxB = fullGraph.nodes.indexOf(seeds[1])
  if (idxA < 0 || idxB < 0) return null

  const path = findPath(fullGraph.adjacency, idxA, new Set([idxB]))
  if (!path) return null

  const pathSet = new Set(path)
  const oldToNew = new Map<number, number>()
  path.forEach((oldIdx, newIdx) => oldToNew.set(oldIdx, newIdx))

  const nodes = path.map(i => fullGraph.nodes[i])
  const nodeUrls = path.map(i => fullGraph.nodeUrls[i])
  const nodeTypes = path.map(i => fullGraph.nodeTypes[i])

  // Edges: only consecutive path steps
  const edges: [number, number][] = []
  for (let i = 0; i < path.length - 1; i++) {
    edges.push([i, i + 1])
  }

  const adjacency = new Map<number, number[]>()
  for (const [s, t] of edges) {
    if (!adjacency.has(s)) adjacency.set(s, [])
    if (!adjacency.has(t)) adjacency.set(t, [])
    adjacency.get(s)!.push(t)
    adjacency.get(t)!.push(s)
  }

  const pointSizes = new Float32Array(nodes.length)
  const pointColors = new Float32Array(nodes.length * 4)
  for (let i = 0; i < nodes.length; i++) {
    if (seedSet.has(nodes[i])) {
      pointSizes[i] = 14
      pointColors.set(SEED_COLOR, i * 4)
    } else {
      pointSizes[i] = 8
      pointColors.set(PATH_NODE_COLOR, i * 4)
    }
  }

  // Layout: linear chain, evenly spaced
  const pointPositions = new Float32Array(nodes.length * 2)
  const spacing = 150
  const totalWidth = (nodes.length - 1) * spacing
  for (let i = 0; i < nodes.length; i++) {
    pointPositions[i * 2] = -totalWidth / 2 + i * spacing
    pointPositions[i * 2 + 1] = 0
  }

  const linkIndexes = new Float32Array(edges.length * 2)
  edges.forEach(([s, t], i) => { linkIndexes[i * 2] = s; linkIndexes[i * 2 + 1] = t })

  const linkColors = new Float32Array(edges.length * 4)
  for (let i = 0; i < edges.length; i++) linkColors.set(PATH_LINK_COLOR, i * 4)

  return { nodes, nodeUrls, nodeTypes, edges, pointPositions, pointSizes, pointColors, linkIndexes, linkColors, adjacency }
}

// --- Key nodes ---

/** Find the top N nodes by degree (excluding seeds). */
export function findKeyNodes(graphData: GraphData, seeds: string[], topN = 10): number[] {
  const seedSet = new Set(seeds)
  const degrees: { idx: number; deg: number }[] = []
  for (let i = 0; i < graphData.nodes.length; i++) {
    if (seedSet.has(graphData.nodes[i])) continue
    degrees.push({ idx: i, deg: graphData.adjacency.get(i)?.length ?? 0 })
  }
  degrees.sort((a, b) => b.deg - a.deg)
  return degrees.slice(0, topN).map(d => d.idx)
}
