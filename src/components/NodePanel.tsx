import { useStore, SEED_ARTICLES } from '../lib/store'

export function NodePanel() {
  const selected = useStore(s => s.selectedNode)
  const hoveredNode = useStore(s => s.hoveredNode)
  const linkMap = useStore(s => s.linkMap)
  const selectNode = useStore(s => s.selectNode)

  const seedSet = new Set(SEED_ARTICLES)

  // Hovered node tooltip
  if (!selected && hoveredNode) {
    const links = linkMap.get(hoveredNode) ?? []
    const seedLinks = SEED_ARTICLES.filter(s => links.includes(s))
    return (
      <div style={panel}>
        <div style={{ fontWeight: 700, color: '#e2e8f0', marginBottom: 2 }}>{hoveredNode}</div>
        {seedLinks.length > 0 && (
          <div style={{ color: '#888', fontSize: 9 }}>
            links to: {seedLinks.join(', ')}
          </div>
        )}
        <div style={{ color: '#475569', fontSize: 9, marginTop: 4 }}>right-click to open wikipedia</div>
      </div>
    )
  }

  if (!selected) return null

  const links = linkMap.get(selected) ?? []
  const seedLinks = SEED_ARTICLES.filter(s => links.includes(s))
  const isSeed = seedSet.has(selected)

  // What seeds link TO this node
  const linkedBySeeds = SEED_ARTICLES.filter(s => (linkMap.get(s) ?? []).includes(selected))

  return (
    <div style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontWeight: 700, color: '#e2e8f0', marginBottom: 2, flex: 1, paddingRight: 8 }}>{selected}</div>
        <div style={action} onClick={() => selectNode(null)}>✕</div>
      </div>

      <div style={{ color: '#475569', fontSize: 9, marginBottom: 8 }}>
        {isSeed ? 'seed article' : 'expanded node'} · {links.length} outbound links
      </div>

      {seedLinks.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div style={label}>this article links to</div>
          {seedLinks.map(s => (
            <div key={s} style={pill}>{s}</div>
          ))}
        </div>
      )}

      {linkedBySeeds.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div style={label}>linked from</div>
          {linkedBySeeds.map(s => (
            <div key={s} style={pill}>{s}</div>
          ))}
        </div>
      )}

      {seedLinks.length === 0 && linkedBySeeds.length === 0 && !isSeed && (
        <div style={{ color: '#475569', fontSize: 9 }}>no direct connection to seeds</div>
      )}

      <div style={{ marginTop: 8 }}>
        <div style={action} onClick={() => window.open(`https://en.wikipedia.org/wiki/${encodeURIComponent(selected.replace(/ /g, '_'))}`, '_blank')}>
          open wikipedia →
        </div>
      </div>
    </div>
  )
}

const panel: React.CSSProperties = {
  position: 'absolute', top: 10, right: 10, zIndex: 10,
  color: '#ccc', fontSize: 10,
  fontFamily: '"Nunito Sans", -apple-system, sans-serif',
  userSelect: 'none', maxWidth: 200,
  background: 'rgba(15,23,42,0.85)',
  padding: '10px 12px',
}
const label: React.CSSProperties = {
  fontSize: 9, color: '#475569', textTransform: 'uppercase',
  letterSpacing: '0.05em', marginBottom: 3,
}
const pill: React.CSSProperties = {
  display: 'inline-block', fontSize: 9, color: '#60a5fa',
  marginRight: 4, marginBottom: 2,
}
const action: React.CSSProperties = {
  textDecoration: 'underline', cursor: 'pointer', color: '#ccc', fontSize: 10,
}
