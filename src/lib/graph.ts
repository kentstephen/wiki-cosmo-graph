export interface GraphData {
  nodes: string[]
  nodeTypes: ('seed' | 'expanded')[]
  edges: [number, number][]
  pointPositions: Float32Array
  pointSizes: Float32Array
  pointColors: Float32Array
  linkIndexes: Float32Array
  linkColors: Float32Array
}

// Match Jupyter notebook colors
const SEED_COLOR:  [number, number, number, number] = [0.376, 0.647, 0.980, 1.0] // #60a5fa
const EXP_COLOR:   [number, number, number, number] = [0.376, 0.647, 0.980, 0.5] // #60a5fa dimmed
const LINK_COLOR:  [number, number, number, number] = [0.580, 0.639, 0.682, 0.3] // #94a3b8
const SEED_SIZE = 8
const EXP_SIZE  = 3

export function buildGraphData(
  seeds: string[],
  linkMap: Map<string, string[]>,
  showExpanded: boolean,
): GraphData {
  const seedSet = new Set(seeds)

  const nodeSet = new Set<string>(seeds)
  if (showExpanded) {
    for (const [src, links] of linkMap) {
      if (seedSet.has(src)) for (const t of links) nodeSet.add(t)
    }
  }

  const nodes = Array.from(nodeSet)
  const nodeIndex = new Map(nodes.map((n, i) => [n, i]))
  const nodeTypes: ('seed' | 'expanded')[] = nodes.map(n => seedSet.has(n) ? 'seed' : 'expanded')

  const pointPositions = new Float32Array(nodes.length * 2)
  for (let i = 0; i < nodes.length; i++) {
    pointPositions[i * 2]     = (Math.random() - 0.5) * 2
    pointPositions[i * 2 + 1] = (Math.random() - 0.5) * 2
  }

  const pointSizes = new Float32Array(nodes.map(n => seedSet.has(n) ? SEED_SIZE : EXP_SIZE))

  const pointColors = new Float32Array(nodes.length * 4)
  nodes.forEach((n, i) => {
    const c = seedSet.has(n) ? SEED_COLOR : EXP_COLOR
    pointColors.set(c, i * 4)
  })

  // Build edges — only between nodes in the current set
  const edgeSet = new Set<string>()
  const edges: [number, number][] = []
  for (const [src, links] of linkMap) {
    const si = nodeIndex.get(src)
    if (si === undefined) continue
    for (const tgt of links) {
      const ti = nodeIndex.get(tgt)
      if (ti === undefined) continue
      const key = si < ti ? `${si}-${ti}` : `${ti}-${si}`
      if (!edgeSet.has(key)) {
        edgeSet.add(key)
        edges.push([si, ti])
      }
    }
  }

  const linkIndexes = new Float32Array(edges.length * 2)
  edges.forEach(([s, t], i) => { linkIndexes[i * 2] = s; linkIndexes[i * 2 + 1] = t })

  const linkColors = new Float32Array(edges.length * 4)
  for (let i = 0; i < edges.length; i++) linkColors.set(LINK_COLOR, i * 4)

  return { nodes, nodeTypes, edges, pointPositions, pointSizes, pointColors, linkIndexes, linkColors }
}
