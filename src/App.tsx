import { useEffect } from 'react'
import { useStore, SEED_ARTICLES } from './lib/store'
import { GraphView } from './components/GraphView'
import { NodePanel } from './components/NodePanel'

export function App() {
  const loadData = useStore(s => s.loadData)
  const fetchStatus = useStore(s => s.fetchStatus)
  const showExpanded = useStore(s => s.showExpanded)
  const toggleExpanded = useStore(s => s.toggleExpanded)
  const graphData = useStore(s => s.graphData)

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const nodeCount = graphData?.nodes.length ?? 0
  const edgeCount = graphData?.edges.length ?? 0

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', fontFamily: '"Nunito Sans", -apple-system, sans-serif' }}>
      <GraphView />
      <NodePanel />

      <div style={{ position: 'absolute', top: 10, left: 10, color: '#ccc', fontSize: 10, userSelect: 'none', zIndex: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{SEED_ARTICLES.join(' · ')}</div>

        {fetchStatus === 'loading' && (
          <div style={{ color: '#888' }}>loading…</div>
        )}

        {fetchStatus === 'done' && (
          <>
            <div style={{ color: '#888', marginBottom: 4 }}>
              {nodeCount.toLocaleString()} nodes · {edgeCount.toLocaleString()} edges
            </div>
            <div style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={toggleExpanded}>
              {showExpanded ? 'hide expanded nodes' : 'show expanded nodes'}
            </div>
          </>
        )}

        {fetchStatus === 'error' && (
          <div style={{ color: '#f87171' }}>failed to load data</div>
        )}
      </div>

      {fetchStatus === 'done' && (
        <div style={{ position: 'absolute', bottom: 10, left: 10, color: '#334155', fontSize: 9, userSelect: 'none' }}>
          click to select · right-click to open wikipedia · drag to explore
        </div>
      )}
    </div>
  )
}
