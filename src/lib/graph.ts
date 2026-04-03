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
}

const SEED_COLOR:  [number, number, number, number] = [0.376, 0.647, 0.980, 1.0] // #60a5fa
const EXP_COLOR:   [number, number, number, number] = [0.376, 0.647, 0.980, 0.4]
const LINK_COLOR:  [number, number, number, number] = [0.580, 0.639, 0.682, 0.3] // #94a3b8
const SEED_SIZE = 8
const EXP_SIZE  = 3

export function buildGraphDataFromRows(
  allNodes: { id: string; node_type: string; wiki_url: string }[],
  allEdges: { source: string; target: string }[],
  showExpanded: boolean,
  seeds: string[],
): GraphData {
  const seedSet = new Set(seeds)

  const visibleNodes = showExpanded
    ? allNodes
    : allNodes.filter(n => seedSet.has(n.id))

  const nodes = visibleNodes.map(n => n.id)
  const nodeUrls = visibleNodes.map(n => n.wiki_url)
  const nodeTypes = visibleNodes.map(n => seedSet.has(n.id) ? 'seed' : 'expanded') as ('seed' | 'expanded')[]
  const nodeIndex = new Map(nodes.map((n, i) => [n, i]))

  const pointPositions = new Float32Array(nodes.length * 2)
  for (let i = 0; i < nodes.length; i++) {
    pointPositions[i * 2]     = (Math.random() - 0.5) * 2
    pointPositions[i * 2 + 1] = (Math.random() - 0.5) * 2
  }

  const pointSizes = new Float32Array(nodes.map(n => seedSet.has(n) ? SEED_SIZE : EXP_SIZE))

  const pointColors = new Float32Array(nodes.length * 4)
  nodes.forEach((n, i) => pointColors.set(seedSet.has(n) ? SEED_COLOR : EXP_COLOR, i * 4))

  const edgeSet = new Set<string>()
  const edges: [number, number][] = []
  for (const { source, target } of allEdges) {
    const si = nodeIndex.get(source)
    const ti = nodeIndex.get(target)
    if (si === undefined || ti === undefined) continue
    const key = si < ti ? `${si}-${ti}` : `${ti}-${si}`
    if (!edgeSet.has(key)) {
      edgeSet.add(key)
      edges.push([si, ti])
    }
  }

  const linkIndexes = new Float32Array(edges.length * 2)
  edges.forEach(([s, t], i) => { linkIndexes[i * 2] = s; linkIndexes[i * 2 + 1] = t })

  const linkColors = new Float32Array(edges.length * 4)
  for (let i = 0; i < edges.length; i++) linkColors.set(LINK_COLOR, i * 4)

  return { nodes, nodeUrls, nodeTypes, edges, pointPositions, pointSizes, pointColors, linkIndexes, linkColors }
}
