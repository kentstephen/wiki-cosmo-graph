import { useRef, useEffect, useState } from 'react'
import { Graph } from '@cosmos.gl/graph'
import { useStore } from '../lib/store'
import { wikiUrl } from '../lib/wikipedia'

export function GraphView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<Graph | null>(null)
  const nodesRef = useRef<string[]>([])
  const graphData = useStore(s => s.graphData)
  const drillDown = useStore(s => s.drillDown)
  const goBack = useStore(s => s.goBack)
  const navStack = useStore(s => s.navStack)
  const setHoveredNode = useStore(s => s.setHoveredNode)
  const hoveredNode = useStore(s => s.hoveredNode)

  // Track mouse position for tooltip
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)

  const navStackRef = useRef<string[]>([])

  useEffect(() => {
    nodesRef.current = graphData?.nodes ?? []
  }, [graphData])

  useEffect(() => {
    navStackRef.current = navStack
  }, [navStack])

  // Track mouse position + clear stale hover
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY })
      // If cosmos has no hovered point, clear the tooltip
      const graph = graphRef.current
      if (graph) {
        const idx = (graph as any).store?.hoveredPoint
        if (idx == null) setHoveredNode(null)
      }
    }
    const onLeave = () => {
      setMousePos(null)
      setHoveredNode(null)
    }
    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', onLeave)
    return () => {
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  // Init graph once
  useEffect(() => {
    if (!containerRef.current) return
    const graph = new Graph(containerRef.current, {
      spaceSize: 4096,
      backgroundColor: '#111318',
      pointDefaultColor: '#60a5fa',
      pointDefaultSize: 4,
      scalePointsOnZoom: true,
      linkDefaultColor: '#94a3b8',
      linkDefaultWidth: 0.6,
      linkDefaultArrows: false,
      curvedLinks: false,
      renderHoveredPointRing: true,
      hoveredPointRingColor: '#e2d9c0',
      pointGreyoutOpacity: 0.08,
      linkGreyoutOpacity: 0.03,
      enableDrag: true,
      rescalePositions: true,
      onPointMouseOver: (index) => {
        if (index == null) return
        setHoveredNode(nodesRef.current[index] ?? null)
        // Only highlight on full graph — subgraph is static, no visual changes
        if (navStackRef.current.length === 0) {
          graph.selectPointByIndex(index, true)
        }
      },
      onPointMouseOut: () => {
        setHoveredNode(null)
        if (navStackRef.current.length === 0) {
          graph.unselectPoints()
        }
      },
      // Click → drill down from full graph, open Wikipedia from subgraph
      onPointClick: (index) => {
        if (index == null) return
        const title = nodesRef.current[index]
        if (!title) return
        if (navStackRef.current.length > 0) {
          // In subgraph — open Wikipedia
          window.open(wikiUrl(title), '_blank')
          return
        }
        drillDown(title)
      },
      onBackgroundClick: () => {
        // Do nothing on background click
      },
      attribution: '',
    })
    graphRef.current = graph
    return () => { graph.destroy() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Escape → go back
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') goBack()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [goBack])

  // Right-click → open Wikipedia
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onContextMenu = (e: MouseEvent) => {
      const graph = graphRef.current
      if (!graph) return
      const idx = (graph as any).store?.hoveredPoint
      if (idx == null) return
      e.preventDefault()
      const title = nodesRef.current[idx]
      if (title) window.open(wikiUrl(title), '_blank')
    }
    el.addEventListener('contextmenu', onContextMenu)
    return () => el.removeEventListener('contextmenu', onContextMenu)
  }, [])

  // Render when graphData changes + toggle greyout based on view
  useEffect(() => {
    const graph = graphRef.current
    if (!graph || !graphData) return
    const isDrilled = navStackRef.current.length > 0
    // In subgraph: no greyout, no hover ring — just static nodes
    graph.setConfig({
      pointGreyoutOpacity: isDrilled ? 1.0 : 0.08,
      linkGreyoutOpacity: isDrilled ? 1.0 : 0.03,
      renderHoveredPointRing: !isDrilled,
    })
    graph.unselectPoints()
    graph.setPointPositions(new Float32Array(0))
    graph.setLinks(new Float32Array(0))
    graph.render(0)
    requestAnimationFrame(() => {
      graph.setPointPositions(graphData.pointPositions)
      graph.setPointColors(graphData.pointColors)
      graph.setPointSizes(graphData.pointSizes)
      graph.setLinks(graphData.linkIndexes)
      graph.setLinkColors(graphData.linkColors)
      graph.render(0)
      setTimeout(() => graph.fitView(300), 50)
    })
  }, [graphData])

  const isDrilledDown = navStack.length > 0

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100vh', position: 'relative' }}>
      {/* Hover tooltip */}
      {hoveredNode && mousePos && (
        <div style={{
          position: 'fixed',
          left: mousePos.x + 14,
          top: mousePos.y - 10,
          background: 'rgba(10,12,16,0.9)',
          color: '#e2e8f0',
          padding: '4px 8px',
          fontSize: 12,
          fontFamily: '"Nunito Sans", -apple-system, sans-serif',
          pointerEvents: 'none',
          zIndex: 100,
          whiteSpace: 'nowrap',
        }}>
          {hoveredNode}
        </div>
      )}

      {/* Controls when drilled down */}
      {isDrilledDown && (
        <div style={{
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 10,
          display: 'flex',
          gap: 10,
          fontFamily: '"Nunito Sans", -apple-system, sans-serif',
          fontSize: 12,
          userSelect: 'none',
        }}>
          <div
            onClick={() => window.open(wikiUrl(navStack[navStack.length - 1]), '_blank')}
            style={{
              background: 'rgba(10,12,16,0.85)',
              color: '#e2d9c0',
              padding: '6px 12px',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Open {navStack[navStack.length - 1]} in Wikipedia
          </div>
          <div
            onClick={goBack}
            style={{
              background: 'rgba(10,12,16,0.85)',
              color: '#9ca3af',
              padding: '6px 12px',
              cursor: 'pointer',
            }}
          >
            ← back
          </div>
        </div>
      )}

    </div>
  )
}
