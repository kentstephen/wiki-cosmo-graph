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

    // Fetch and load CSVs
    const [nodesText, edgesText] = await Promise.all([
      fetch('/nodes.csv').then(r => r.text()),
      fetch('/edges.csv').then(r => r.text()),
    ])

    const nodes = parseCsv(nodesText)
    const edges = parseCsv(edgesText)

    await connector.loadObjects(nodes, 'nodes')
    await connector.loadObjects(edges, 'edges')
  }
  return connector
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map(line => {
    // Handle quoted fields
    const values: string[] = []
    let cur = '', inQuote = false
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote }
      else if (ch === ',' && !inQuote) { values.push(cur); cur = '' }
      else { cur += ch }
    }
    values.push(cur)
    return Object.fromEntries(headers.map((h, i) => [h, values[i]?.trim() ?? '']))
  })
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
