import { useMemo } from 'react'
import { useStore, SEED_ARTICLES } from '../lib/store'
import { findPath } from '../lib/graph'

export function NodePanel() {
  const selected = useStore(s => s.selectedNode)
  const hoveredNode = useStore(s => s.hoveredNode)
  const allEdges = useStore(s => s.allEdges)
  const graphData = useStore(s => s.graphData)
  const fullGraphData = useStore(s => s.fullGraphData)
  const viewMode = useStore(s => s.viewMode)
  const selectNode = useStore(s => s.selectNode)
  const exitPathView = useStore(s => s.exitPathView)

  const seedSet = new Set(SEED_ARTICLES)

  function getConnections(title: string) {
    const out = new Set<string>()
    const inc = new Set<string>()
    for (const { source, target } of allEdges) {
      if (source === title) out.add(target)
      if (target === title) inc.add(source)
    }
    return { out, inc }
  }

  function getWikiUrl(title: string) {
    const node = graphData?.nodes.indexOf(title) ?? -1
    return node >= 0 && graphData
      ? graphData.nodeUrls[node]
      : `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
  }

  // Compute paths using the full graph adjacency
  const paths = useMemo(() => {
    if (!selected || !fullGraphData) return []
    const nodeIdx = fullGraphData.nodes.indexOf(selected)
    if (nodeIdx < 0) return []

    const result: { seed: string; path: string[] }[] = []
    for (const seed of SEED_ARTICLES) {
      const seedIdx = fullGraphData.nodes.indexOf(seed)
      if (seedIdx < 0 || seedIdx === nodeIdx) continue
      const pathIndices = findPath(fullGraphData.adjacency, nodeIdx, new Set([seedIdx]))
      if (pathIndices) {
        result.push({
          seed,
          path: pathIndices.map(i => fullGraphData.nodes[i]),
        })
      }
    }
    return result
  }, [selected, fullGraphData])

  if (!selected && hoveredNode) {
    const { out } = getConnections(hoveredNode)
    const seedLinks = SEED_ARTICLES.filter(s => out.has(s))
    return (
      <div style={panel}>
        <div style={{ fontWeight: 700, color: '#e2e8f0', marginBottom: 2 }}>{hoveredNode}</div>
        {seedLinks.length > 0 && (
          <div style={{ color: '#888', fontSize: 11 }}>links to: {seedLinks.join(', ')}</div>
        )}
        <div style={{ color: '#475569', fontSize: 11, marginTop: 4 }}>right-click to open wikipedia</div>
      </div>
    )
  }

  if (!selected) return null

  const { out } = getConnections(selected)
  const isSeed = seedSet.has(selected)

  return (
    <div style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontWeight: 700, color: '#e2e8f0', flex: 1, paddingRight: 8, marginBottom: 2 }}>{selected}</div>
        <div style={closeBtn} onClick={exitPathView}>✕</div>
      </div>

      <div style={{ color: '#475569', fontSize: 11, marginBottom: 8 }}>
        {isSeed ? 'seed article' : 'expanded node'} · {out.size} outbound links
      </div>

      {viewMode === 'path' && (
        <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>
          viewing path subgraph · press <span style={{ color: '#e2e8f0' }}>esc</span> or <span style={{ color: '#e2e8f0' }}>✕</span> to return
        </div>
      )}

      {paths.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {paths.map(({ seed, path }) => (
            <div key={seed} style={{ marginBottom: 6 }}>
              <div style={label}>path to {seed} ({path.length - 1} hop{path.length - 1 !== 1 ? 's' : ''})</div>
              <div style={{ fontSize: 11, color: '#e2e8f0', lineHeight: 1.6 }}>
                {path.map((n, i) => (
                  <span key={i}>
                    <span
                      style={{
                        color: seedSet.has(n) ? '#fbbf24' : n === selected ? '#fb923c' : '#94a3b8',
                        cursor: 'pointer',
                      }}
                      onClick={() => selectNode(n)}
                    >{n}</span>
                    {i < path.length - 1 && <span style={{ color: '#475569' }}> → </span>}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {paths.length === 0 && !isSeed && (
        <div style={{ color: '#475569', fontSize: 11, marginBottom: 6 }}>no path to seed nodes</div>
      )}

      <div style={action} onClick={() => window.open(getWikiUrl(selected), '_blank')}>
        open wikipedia →
      </div>
    </div>
  )
}

const panel: React.CSSProperties = {
  position: 'absolute', top: 10, right: 10, zIndex: 10,
  color: '#ccc', fontSize: 13,
  fontFamily: '"Nunito Sans", -apple-system, sans-serif',
  userSelect: 'none', maxWidth: 280,
  background: 'rgba(15,23,42,0.85)',
  padding: '12px 14px',
}
const label: React.CSSProperties = {
  fontSize: 11, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3,
}
const closeBtn: React.CSSProperties = {
  cursor: 'pointer', color: '#888', fontSize: 14, lineHeight: 1, padding: '0 2px',
}
const action: React.CSSProperties = {
  textDecoration: 'underline', cursor: 'pointer', color: '#ccc', fontSize: 13,
}
