import { createWasmDuckDbConnector } from '@sqlrooms/duckdb'

let connector: Awaited<ReturnType<typeof createWasmDuckDbConnector>> | null = null
let initialized = false

async function getDb() {
  if (!connector) {
    connector = createWasmDuckDbConnector()
  }
  if (!initialized) {
    await connector.initialize()
    initialized = true

    const [nodesText, edgesText] = await Promise.all([
      fetch('/nodes.csv').then(r => r.text()),
      fetch('/edges.csv').then(r => r.text()),
    ])

    await connector.loadFile(new File([nodesText], 'nodes.csv', { type: 'text/csv' }), 'nodes')
    await connector.loadFile(new File([edgesText], 'edges.csv', { type: 'text/csv' }), 'edges')
  }
  return connector
}

export async function loadGraphFromDb(): Promise<{
  nodes: { id: string; node_type: string; wiki_url: string }[]
  edges: { source: string; target: string }[]
}> {
  const db = await getDb()
  const nodes = Array.from(await db.queryJson<{ id: string; node_type: string; wiki_url: string }>(
    'SELECT id, node_type, wiki_url FROM nodes'
  ))
  const edges = Array.from(await db.queryJson<{ source: string; target: string }>(
    'SELECT source, target FROM edges'
  ))
  return { nodes, edges }
}
