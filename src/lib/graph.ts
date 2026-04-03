export interface GraphData {
  nodes: string[]           // article titles
  nodeTypes: ('seed' | 'expanded')[]
  edges: [number, number][] // [sourceIdx, targetIdx]
  // TypedArrays for cosmos.gl
  pointPositions: Float32Array
  pointSizes: Float32Array
  pointColors: Float32Array
  linkIndexes: Float32Array
  linkColors: Float32Array
}

const SEED_COLOR: [number, number, number, number] = [0.38, 0.65, 0.98, 1.0]   // blue
const EXP_COLOR:  [number, number, number, number] = [0.55, 0.35, 0.80, 0.7]   // purple
const SEED_SIZE = 6
const EXP_SIZE  = 3

export function buildGraphData(
  seeds: string[],
  linkMap: Map<string, string[]>,
  showExpanded: boolean,
): GraphData {
  const seedSet = new Set(seeds)

  // Collect all nodes
  const nodeSet = new Set<string>(seeds)
  if (showExpanded) {
    for (const [src, links] of linkMap) {
      if (seedSet.has(src)) {
        for (const t of links) nodeSet.add(t)
      }
    }
  }

  const nodes = Array.from(nodeSet)
  const nodeIndex = new Map(nodes.map((n, i) => [n, i]))
  const nodeTypes: ('seed' | 'expanded')[] = nodes.map(n => seedSet.has(n) ? 'seed' : 'expanded')

  // Build edges
  const edgeSet = new Set<string>()
  const edges: [number, number][] = []
  for (const [src, links] of linkMap) {
    const si = nodeIndex.get(src)
    if (si === undefined) continue
    for (const tgt of links) {
      const ti = nodeIndex.get(tgt)
      if (ti === undefined) continue
      const key = `${Math.min(si, ti)}-${Math.max(si, ti)}`
      if (!edgeSet.has(key)) {
        edgeSet.add(key)
        edges.push([si, ti])
      }
    }
  }

  // TypedArrays
  const pointPositions = new Float32Array(nodes.length * 2) // zeros → cosmos lays out
  const pointSizes = new Float32Array(nodes.map(n => seedSet.has(n) ? SEED_SIZE : EXP_SIZE))
  const pointColors = new Float32Array(nodes.length * 4)
  nodes.forEach((n, i) => {
    const c = seedSet.has(n) ? SEED_COLOR : EXP_COLOR
    pointColors[i * 4]     = c[0]
    pointColors[i * 4 + 1] = c[1]
    pointColors[i * 4 + 2] = c[2]
    pointColors[i * 4 + 3] = c[3]
  })

  const linkIndexes = new Float32Array(edges.length * 2)
  edges.forEach(([s, t], i) => { linkIndexes[i * 2] = s; linkIndexes[i * 2 + 1] = t })

  const linkColors = new Float32Array(edges.length * 4)
  for (let i = 0; i < edges.length; i++) {
    linkColors[i * 4]     = 0.58
    linkColors[i * 4 + 1] = 0.65
    linkColors[i * 4 + 2] = 0.80
    linkColors[i * 4 + 3] = 0.25
  }

  return { nodes, nodeTypes, edges, pointPositions, pointSizes, pointColors, linkIndexes, linkColors }
}
