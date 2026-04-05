export interface PreBakedGraph {
  seeds: string[]
  nodes: string[]
  nodeUrls: string[]
  nodeTypes: ('seed' | 'expanded')[]
  edges: [number, number][]
  pointPositions: number[]
  pointSizes: number[]
  pointColors: number[]
  linkIndexes: number[]
  linkColors: number[]
}

export async function loadGraphFromDb(filename = 'graph.json'): Promise<PreBakedGraph> {
  const res = await fetch(import.meta.env.BASE_URL + filename)
  if (!res.ok) throw new Error(`Failed to load graph data: ${res.status}`)
  return res.json()
}
