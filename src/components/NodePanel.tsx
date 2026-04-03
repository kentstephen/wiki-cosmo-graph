import { useStore } from '../lib/store'
import { wikiUrl } from '../lib/wikipedia'

export function NodePanel() {
  const selected = useStore(s => s.selectedNode)
  const linkMap = useStore(s => s.linkMap)
  const seeds = useStore(s => s.seeds)
  const selectNode = useStore(s => s.selectNode)
  const seedSet = new Set(seeds)

  if (!selected) return null

  const links = linkMap.get(selected) ?? []
  const seedLinks = links.filter(l => seedSet.has(l))

  return (
    <div style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', lineHeight: 1.4 }}>{selected}</div>
          <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
            {seedSet.has(selected) ? 'Seed article' : 'Expanded node'}
          </div>
        </div>
        <button onClick={() => selectNode(null)} style={closeBtn}>✕</button>
      </div>

      <a href={wikiUrl(selected)} target="_blank" rel="noreferrer" style={wikiLink}>
        Open Wikipedia →
      </a>

      {seedLinks.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
            Links to seed articles ({seedLinks.length})
          </div>
          {seedLinks.map(l => (
            <div key={l} style={linkItem} onClick={() => selectNode(l)}>{l}</div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 11, color: '#475569', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
          Total outbound links
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#60a5fa' }}>{links.length}</div>
      </div>
    </div>
  )
}

const panel: React.CSSProperties = {
  position: 'absolute', top: 16, right: 16, width: 260, zIndex: 20,
  background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10,
  padding: 16, maxHeight: 'calc(100vh - 120px)', overflowY: 'auto',
}
const closeBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#475569', cursor: 'pointer',
  fontSize: 14, padding: 2, flexShrink: 0,
}
const wikiLink: React.CSSProperties = {
  display: 'block', fontSize: 12, color: '#3b82f6', textDecoration: 'none',
  padding: '6px 10px', background: '#1e293b', borderRadius: 6, textAlign: 'center',
}
const linkItem: React.CSSProperties = {
  fontSize: 12, color: '#94a3b8', padding: '3px 0', cursor: 'pointer',
  borderBottom: '1px solid #1e293b',
}
