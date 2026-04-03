export async function loadGraphFromDb(): Promise<{
  nodes: { id: string; node_type: string; wiki_url: string }[]
  edges: { source: string; target: string }[]
}> {
  const res = await fetch('/graph.json')
  if (!res.ok) throw new Error(`Failed to load graph data: ${res.status}`)
  return res.json()
}
