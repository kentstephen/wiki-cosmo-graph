import { createWasmDuckDbConnector } from '@sqlrooms/duckdb'

let connector: Awaited<ReturnType<typeof createWasmDuckDbConnector>> | null = null

export async function getDb() {
  if (!connector) {
    connector = await createWasmDuckDbConnector()
    await connector.query(`
      CREATE TABLE IF NOT EXISTS nodes AS
        SELECT * FROM read_csv_auto('/nodes.csv');
      CREATE TABLE IF NOT EXISTS edges AS
        SELECT * FROM read_csv_auto('/edges.csv');
    `)
  }
  return connector
}

export async function loadGraphFromDb(): Promise<{
  nodes: { id: string; node_type: string; wiki_url: string }[]
  edges: { source: string; target: string }[]
}> {
  const db = await getDb()
  const nodesResult = await db.query(`SELECT id, node_type, wiki_url FROM nodes`)
  const edgesResult = await db.query(`SELECT source, target FROM edges`)
  return {
    nodes: nodesResult.toArray().map((r: any) => ({ id: r.id, node_type: r.node_type, wiki_url: r.wiki_url })),
    edges: edgesResult.toArray().map((r: any) => ({ source: r.source, target: r.target })),
  }
}
