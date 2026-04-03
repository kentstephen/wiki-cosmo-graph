import { useCallback, useState } from 'react'
import { useStore } from '../lib/store'

export function FileDropzone() {
  const loadCsv = useStore(s => s.loadCsv)
  const fetchAllLinks = useStore(s => s.fetchAllLinks)
  const seeds = useStore(s => s.seeds)
  const fetchStatus = useStore(s => s.fetchStatus)
  const fetchProgress = useStore(s => s.fetchProgress)
  const [dragging, setDragging] = useState(false)

  const handleFile = useCallback(async (file: File) => {
    const text = await file.text()
    loadCsv(text)
  }, [loadCsv])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  if (fetchStatus === 'fetching') {
    const { done, total } = fetchProgress
    const pct = total ? Math.round((done / total) * 100) : 0
    return (
      <div style={overlay}>
        <div style={card}>
          <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 12 }}>Fetching Wikipedia links…</div>
          <div style={progressBar}>
            <div style={{ ...progressFill, width: `${pct}%` }} />
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>{done} / {total} articles</div>
        </div>
      </div>
    )
  }

  if (seeds.length > 0 && fetchStatus === 'idle') {
    return (
      <div style={overlay}>
        <div style={card}>
          <div style={{ fontSize: 15, color: '#e2e8f0', marginBottom: 4 }}>
            {seeds.length} Wikipedia articles loaded
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
            {seeds.slice(0, 5).join(', ')}{seeds.length > 5 ? ` +${seeds.length - 5} more` : ''}
          </div>
          <button style={btn} onClick={fetchAllLinks}>Fetch Links</button>
          <label style={{ ...btn, background: '#1e293b', marginLeft: 8, cursor: 'pointer' }}>
            Load different file
            <input type="file" accept=".csv,.parquet" style={{ display: 'none' }} onChange={onFileInput} />
          </label>
        </div>
      </div>
    )
  }

  if (fetchStatus === 'idle' && seeds.length === 0) {
    return (
      <div
        style={{ ...overlay, cursor: 'pointer' }}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div style={{ ...card, borderColor: dragging ? '#60a5fa' : '#1e293b' }}>
          <div style={{ fontSize: 24, marginBottom: 12 }}>⬇</div>
          <div style={{ fontSize: 16, color: '#e2e8f0', marginBottom: 8 }}>Drop a CSV here</div>
          <div style={{ fontSize: 12, color: '#475569', marginBottom: 16 }}>
            Any CSV with Wikipedia URLs — raindrop export, custom list, anything
          </div>
          <label style={{ ...btn, cursor: 'pointer' }}>
            Browse file
            <input type="file" accept=".csv,.parquet" style={{ display: 'none' }} onChange={onFileInput} />
          </label>
        </div>
      </div>
    )
  }

  return null
}

const overlay: React.CSSProperties = {
  position: 'absolute', inset: 0, display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 10,
  background: 'rgba(15,23,42,0.85)',
}
const card: React.CSSProperties = {
  background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12,
  padding: '32px 40px', textAlign: 'center', minWidth: 320,
}
const btn: React.CSSProperties = {
  display: 'inline-block', background: '#3b82f6', color: '#fff',
  border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13,
  cursor: 'pointer',
}
const progressBar: React.CSSProperties = {
  background: '#1e293b', borderRadius: 4, height: 6, width: '100%', overflow: 'hidden',
}
const progressFill: React.CSSProperties = {
  background: '#3b82f6', height: '100%', borderRadius: 4, transition: 'width 0.2s',
}
