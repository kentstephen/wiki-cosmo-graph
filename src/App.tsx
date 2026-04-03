import { useStore } from './lib/store'
import { FileDropzone } from './components/FileDropzone'
import { GraphView } from './components/GraphView'
import { NodePanel } from './components/NodePanel'

export function App() {
  const fetchStatus = useStore(s => s.fetchStatus)
  const showExpanded = useStore(s => s.showExpanded)
  const toggleExpanded = useStore(s => s.toggleExpanded)
  const graphData = useStore(s => s.graphData)
  const seeds = useStore(s => s.seeds)

  const nodeCount = graphData?.nodes.length ?? 0
  const edgeCount = graphData?.edges.length ?? 0
  const seedCount = seeds.length
  const expandedCount = nodeCount - seedCount

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <GraphView />
      <FileDropzone />
      <NodePanel />

      {fetchStatus === 'done' && (
        <div style={toolbar}>
          <span style={stat}>{nodeCount.toLocaleString()} nodes</span>
          <span style={divider} />
          <span style={stat}>{edgeCount.toLocaleString()} edges</span>
          {expandedCount > 0 && (
            <>
              <span style={divider} />
              <span style={{ ...stat, color: '#a78bfa' }}>{expandedCount.toLocaleString()} expanded</span>
            </>
          )}
          <span style={divider} />
          <button style={toggleBtn(showExpanded)} onClick={toggleExpanded}>
            {showExpanded ? 'Hide expanded' : 'Show expanded nodes'}
          </button>
        </div>
      )}

      <div style={hint}>
        Click node to inspect · Double-click to open Wikipedia
      </div>
    </div>
  )
}

const toolbar: React.CSSProperties = {
  position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
  background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8,
  padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8,
  fontSize: 12, color: '#94a3b8', zIndex: 20,
}
const stat: React.CSSProperties = { color: '#e2e8f0' }
const divider: React.CSSProperties = {
  width: 1, height: 14, background: '#1e293b',
}
const hint: React.CSSProperties = {
  position: 'absolute', bottom: 20, right: 16, fontSize: 11,
  color: '#334155', zIndex: 5,
}
const toggleBtn = (active: boolean): React.CSSProperties => ({
  background: active ? '#4c1d95' : '#1e293b',
  color: active ? '#c4b5fd' : '#64748b',
  border: 'none', borderRadius: 5, padding: '4px 10px',
  fontSize: 11, cursor: 'pointer',
})
