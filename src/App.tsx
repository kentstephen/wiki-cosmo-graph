import { useEffect } from 'react'
import { useStore } from './lib/store'
import { GraphView } from './components/GraphView'

export function App() {
  const loadData = useStore(s => s.loadData)
  const fetchStatus = useStore(s => s.fetchStatus)
  const graphData = useStore(s => s.graphData)
  const seedArticles = useStore(s => s.seedArticles)

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const nodeCount = graphData?.nodes.length ?? 0
  const edgeCount = graphData?.edges.length ?? 0

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', fontFamily: '"Nunito Sans", -apple-system, sans-serif' }}>
      <GraphView />

      <div style={{ position: 'absolute', top: 10, left: 10, color: '#ccc', fontSize: 13, userSelect: 'none', zIndex: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Wikipedia Knowledge Graph: {seedArticles.join(' · ')}</div>

        {fetchStatus === 'loading' && (
          <div style={{ color: '#888' }}>loading…</div>
        )}

        {fetchStatus === 'done' && (
          <>
            <div style={{ color: '#888' }}>
              {nodeCount.toLocaleString()} nodes · {edgeCount.toLocaleString()} edges
            </div>
          </>
        )}

        {fetchStatus === 'error' && (
          <div style={{ color: '#f87171' }}>failed to load data</div>
        )}
      </div>

      {fetchStatus === 'done' && (
        <div style={{ position: 'absolute', bottom: 10, left: 10, color: '#555', fontSize: 11, userSelect: 'none' }}>
          hover to highlight · click to drill down · right-click to open wikipedia · esc to go back
        </div>
      )}
    </div>
  )
}
