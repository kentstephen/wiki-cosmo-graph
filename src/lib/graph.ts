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

/** Pre-compute static positions using d3-force with collision avoidance.
 *  When `spread` is true (subgraphs), use stronger repulsion and wider spacing. */
function computeLayoutWithCollision(
  nodeCount: number,
  edges: [number, number][],
  sizes: Float32Array,
  spread = false,
): Float32Array {
  // Scale forces based on edge density — dense subgraphs need much weaker links
  // and stronger repulsion to avoid collapsing into a packed ball
  const density = nodeCount > 1 ? edges.length / (nodeCount * (nodeCount - 1) / 2) : 0
  let padding: number, charge: number, linkDist: number, linkStr: number

  if (spread) {
    if (density > 0.3) {
      // Near-clique: links are almost meaningless, just spread nodes out
      charge = -2000
      linkStr = 0.002
      linkDist = 200
      padding = 25
    } else if (density > 0.1) {
      // Dense subgraph
      charge = -1200
      linkStr = 0.008
      linkDist = 150
      padding = 20
    } else {
      // Sparse subgraph — original params work fine
      charge = -600
      linkStr = 0.03
      linkDist = 120
      padding = 20
    }
  } else {
    charge = -200
    linkStr = 0.05
    linkDist = 50
    padding = 6
  }

  const simNodes = Array.from({ length: nodeCount }, (_, i) => ({
    radius: sizes[i] ?? 4,
  } as { x?: number; y?: number; radius: number }))
  const simLinks = edges.map(([s, t]) => ({ source: s, target: t }))

  const sim = forceSimulation(simNodes as any)
    .force('link', forceLink(simLinks).strength(linkStr).distance(linkDist))
    .force('charge', forceManyBody().strength(charge))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide<any>().radius((d: any) => (d.radius ?? 4) + padding).strength(1.0).iterations(3))
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

  // Copy sizes and colors from the full graph
  const pointSizes = new Float32Array(nodes.length)
  const pointColors = new Float32Array(nodes.length * 4)
  for (let newIdx = 0; newIdx < sortedOld.length; newIdx++) {
    const oldIdx = sortedOld[newIdx]
    pointSizes[newIdx] = fullGraph.pointSizes[oldIdx]
    pointColors[newIdx * 4] = fullGraph.pointColors[oldIdx * 4]
    pointColors[newIdx * 4 + 1] = fullGraph.pointColors[oldIdx * 4 + 1]
    pointColors[newIdx * 4 + 2] = fullGraph.pointColors[oldIdx * 4 + 2]
    pointColors[newIdx * 4 + 3] = fullGraph.pointColors[oldIdx * 4 + 3]
  }

  // Compute fresh layout for the subgraph so nodes don't overlap
  const pointPositions = computeLayoutWithCollision(nodes.length, edges, pointSizes, true)

  const linkIndexes = new Float32Array(edges.length * 2)
  edges.forEach(([s, t], i) => { linkIndexes[i * 2] = s; linkIndexes[i * 2 + 1] = t })

  const linkColors = new Float32Array(edges.length * 4)
  const LINK_COLOR: [number, number, number, number] = [0.78, 0.78, 0.82, 0.35]
  for (let i = 0; i < edges.length; i++) linkColors.set(LINK_COLOR, i * 4)

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
