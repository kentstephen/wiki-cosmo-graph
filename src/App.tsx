import { useEffect, useState } from 'react'
import { useStore } from './lib/store'
import { GraphView } from './components/GraphView'

export function App() {
  const loadGraph = useStore(s => s.loadGraph)
  const fetchStatus = useStore(s => s.fetchStatus)
  const graphData = useStore(s => s.graphData)
  const seedArticles = useStore(s => s.seedArticles)
  const currentGraphIndex = useStore(s => s.currentGraphIndex)
  const graphs = useStore(s => s.graphs)

  useEffect(() => { loadGraph(0) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const nodeCount = graphData?.nodes.length ?? 0
  const edgeCount = graphData?.edges.length ?? 0
  const [hasInteracted, setHasInteracted] = useState(false)

  // Listen for scroll/wheel/pointer interaction to dismiss centered instructions
  useEffect(() => {
    if (hasInteracted) return
    const dismiss = () => setHasInteracted(true)
    window.addEventListener('wheel', dismiss, { once: true })
    window.addEventListener('pointerdown', dismiss, { once: true })
    return () => {
      window.removeEventListener('wheel', dismiss)
      window.removeEventListener('pointerdown', dismiss)
    }
  }, [hasInteracted])

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', fontFamily: '"Nunito Sans", -apple-system, sans-serif' }}>
      <GraphView />

      <div style={{ position: 'absolute', top: 10, left: 10, color: '#ccc', fontSize: 13, userSelect: 'none', zIndex: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Wikipedia Knowledge Graph: {seedArticles.join(' · ')}</div>

        {fetchStatus === 'loading' && (
          <div style={{ color: '#888' }}>loading…</div>
        )}

        {fetchStatus === 'done' && (
          <div style={{ color: '#888' }}>
            {nodeCount.toLocaleString()} nodes · {edgeCount.toLocaleString()} edges
          </div>
        )}

        {fetchStatus === 'error' && (
          <div style={{ color: '#f87171' }}>failed to load data</div>
        )}

        {fetchStatus === 'done' && (
          <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
            {graphs.map((g, i) => (
              <div
                key={g.file}
                onClick={() => { if (i !== currentGraphIndex) loadGraph(i) }}
                style={{
                  padding: '4px 10px',
                  fontSize: 11,
                  cursor: i === currentGraphIndex ? 'default' : 'pointer',
                  color: i === currentGraphIndex ? '#e2d9c0' : '#888',
                  background: i === currentGraphIndex ? 'rgba(226,217,192,0.12)' : 'transparent',
                  borderBottom: i === currentGraphIndex ? '1px solid #e2d9c0' : '1px solid transparent',
                }}
              >
                {g.label}
              </div>
            ))}
          </div>
        )}
      </div>

      {fetchStatus === 'done' && (
        <div style={{
          position: 'absolute',
          userSelect: 'none',
          zIndex: 20,
          transition: 'opacity 1.5s ease, font-size 1.5s ease, padding 1.5s ease, background 1.5s ease, color 1.5s ease',
          bottom: 24,
          left: 14,
          ...(hasInteracted
            ? { color: '#555', fontSize: 14, opacity: 0.8, background: 'none', padding: 0, borderRadius: 0 }
            : { color: '#c8c0b0', fontSize: 15, opacity: 1, background: 'rgba(10,12,16,0.85)', padding: '14px 20px', borderRadius: 8 }
          ),
        }}>
          <div style={{
            textAlign: hasInteracted ? 'left' : 'center',
            transition: 'opacity 0.8s ease',
          }}>
            {!hasInteracted && (
              <div style={{ fontSize: 20, color: '#c8c0b0', fontWeight: 600 }}>
                Scroll to zoom
              </div>
            )}
            {hasInteracted && (
              <span>scroll to zoom · hover and click to explore · esc to go back</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
