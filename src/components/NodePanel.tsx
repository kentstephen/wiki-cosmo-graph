import { useStore } from '../lib/store'
import { wikiUrl } from '../lib/wikipedia'

export function NodePanel() {
  const selected = useStore(s => s.selectedNode)
  const linkMap = useStore(s => s.linkMap)
  const seeds = useStore(s => s.seeds)
  const selectNode = useStore(s => s.selectNode)

  if (!selected) return null

  const seedSet = new Set(seeds)
  const links = linkMap.get(selected) ?? []
  const seedLinks = links.filter(l => seedSet.has(l))

  return (
    <div style={{
      position: 'absolute', top: 10, right: 10, zIndex: 10,
      color: '#ccc', fontSize: 10,
      fontFamily: '"Nunito Sans", -apple-system, sans-serif',
      userSelect: 'none', maxWidth: 220,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4, color: '#fff' }}>{selected}</div>
      <div style={{ color: '#888', marginBottom: 4 }}>
        {seedSet.has(selected) ? 'seed article' : 'expanded node'}
        {links.length > 0 && ` · ${links.length} links`}
      </div>

      <div style={{ textDecoration: 'underline', cursor: 'pointer', marginBottom: 2 }}
        onClick={() => window.open(wikiUrl(selected), '_blank')}>
        open wikipedia
      </div>

      <div style={{ textDecoration: 'underline', cursor: 'pointer', marginBottom: 8 }}
        onClick={() => selectNode(null)}>
        dismiss
      </div>

      {seedLinks.length > 0 && (
        <>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>links to seeds</div>
          {seedLinks.map(l => (
            <div key={l}
              style={{ textDecoration: 'underline', cursor: 'pointer', marginLeft: 2, marginBottom: 1 }}
              onClick={() => selectNode(l)}>
              {l}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
