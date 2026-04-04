import { useStore, SEED_ARTICLES } from '../lib/store'
import { wikiUrl } from '../lib/wikipedia'

export function NodePanel() {
  const selected = useStore(s => s.selectedNode)
  const hoveredNode = useStore(s => s.hoveredNode)
  const graphData = useStore(s => s.graphData)
  const selectNode = useStore(s => s.selectNode)

  const seedSet = new Set(SEED_ARTICLES)

  // Hover tooltip (no click selection active)
  if (!selected && hoveredNode && graphData) {
    const idx = graphData.nodes.indexOf(hoveredNode)
    const degree = idx >= 0 ? (graphData.adjacency.get(idx)?.length ?? 0) : 0
    return (
      <div style={panel}>
        <div style={{ fontWeight: 700, color: '#e2e8f0', marginBottom: 2 }}>{hoveredNode}</div>
        <div style={{ color: '#6b7280', fontSize: 11 }}>
          {seedSet.has(hoveredNode) ? 'seed' : degree + ' connections'}
        </div>
      </div>
    )
  }

  if (!selected || !graphData) return null

  const idx = graphData.nodes.indexOf(selected)
  const neighborIndices = idx >= 0 ? (graphData.adjacency.get(idx) ?? []) : []
  const neighbors = neighborIndices.map(i => graphData.nodes[i]).sort()

  // Show hovered node name when hovering a different node while frozen
  const showHoverLabel = hoveredNode && hoveredNode !== selected

  return (
    <div style={panel}>
      {showHoverLabel && (
        <div style={{ background: 'rgba(201,168,76,0.15)', padding: '6px 8px', marginBottom: 8, fontSize: 12, color: '#e2d9c0' }}>
          {hoveredNode}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontWeight: 700, color: '#e2e8f0', flex: 1, paddingRight: 8, marginBottom: 2 }}>{selected}</div>
        <div style={closeBtn} onClick={() => selectNode(null)}>✕</div>
      </div>

      <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 6 }}>
        {seedSet.has(selected) ? 'seed article' : 'expanded node'} · {neighbors.length} connections
      </div>

      <div
        style={{ fontSize: 12, color: '#c9a84c', cursor: 'pointer', marginBottom: 8, textDecoration: 'underline' }}
        onClick={() => window.open(wikiUrl(selected), '_blank')}
      >
        open wikipedia →
      </div>

      {neighbors.length > 0 && (
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {neighbors.map(name => (
            <div
              key={name}
              style={{
                fontSize: 11,
                color: seedSet.has(name) ? '#cc3366' : '#9ca3af',
                cursor: 'pointer',
                padding: '2px 0',
                lineHeight: 1.4,
              }}
              onClick={() => window.open(wikiUrl(name), '_blank')}
            >
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const panel: React.CSSProperties = {
  position: 'absolute', top: 10, right: 10, zIndex: 10,
  color: '#ccc', fontSize: 13,
  fontFamily: '"Nunito Sans", -apple-system, sans-serif',
  userSelect: 'none', maxWidth: 280,
  background: 'rgba(10,12,16,0.9)',
  padding: '12px 14px',
  borderLeft: '2px solid rgba(201,168,76,0.3)',
}
const closeBtn: React.CSSProperties = {
  cursor: 'pointer', color: '#6b7280', fontSize: 14, lineHeight: 1, padding: '0 2px',
}
