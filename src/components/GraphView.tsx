import { useRef, useEffect, useState, useCallback } from 'react'
import { Graph } from '@cosmos.gl/graph'
import { useStore } from '../lib/store'
import { findKeyNodes } from '../lib/graph'
import { wikiUrl } from '../lib/wikipedia'

interface NodeLabel {
  name: string
  x: number
  y: number
  isSeed: boolean
  isKey: boolean
}

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
  const showingPath = useStore(s => s.showingPath)
  const seedArticles = useStore(s => s.seedArticles)

  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)
  const [labels, setLabels] = useState<NodeLabel[]>([])
  const [showKeyNodes, setShowKeyNodes] = useState(false)

  const navStackRef = useRef<string[]>([])
  const savedTransformRef = useRef<any>(null)
  const showingPathRef = useRef(false)
  const keyNodeIndicesRef = useRef<Set<number>>(new Set())
  const seedIndicesRef = useRef<Set<number>>(new Set())
  const showKeyNodesRef = useRef(false)

  useEffect(() => {
    nodesRef.current = graphData?.nodes ?? []
  }, [graphData])

  useEffect(() => {
    navStackRef.current = navStack
  }, [navStack])

  useEffect(() => {
    showingPathRef.current = showingPath
  }, [showingPath])

  useEffect(() => {
    showKeyNodesRef.current = showKeyNodes
  }, [showKeyNodes])

  // Compute key node and seed indices when graph data changes
  useEffect(() => {
    if (!graphData) return
    const keyIndices = findKeyNodes(graphData, seedArticles, 10)
    keyNodeIndicesRef.current = new Set(keyIndices)
    const seedIdxs = new Set<number>()
    for (let i = 0; i < graphData.nodes.length; i++) {
      if (seedArticles.includes(graphData.nodes[i])) seedIdxs.add(i)
    }
    seedIndicesRef.current = seedIdxs
  }, [graphData, seedArticles])

  const updateLabels = useCallback(() => {
    const graph = graphRef.current
    if (!graph || !nodesRef.current.length) {
      setLabels([])
      return
    }

    // In path view, always show all labels
    if (showingPathRef.current) {
      const result: NodeLabel[] = []
      for (let i = 0; i < nodesRef.current.length; i++) {
        const pos = graph.spaceToScreenPosition(
          [graph.getPointPositions()[i * 2], graph.getPointPositions()[i * 2 + 1]]
        )
        result.push({
          name: nodesRef.current[i],
          x: pos[0],
          y: pos[1],
          isSeed: seedIndicesRef.current.has(i),
          isKey: false,
        })
      }
      setLabels(result)
      return
    }

    const zoom = graph.getZoomLevel()
    const w = containerRef.current?.clientWidth ?? 0
    const h = containerRef.current?.clientHeight ?? 0

    const result: NodeLabel[] = []
    const positions = graph.getPointPositions()

    for (let i = 0; i < nodesRef.current.length; i++) {
      const isSeed = seedIndicesRef.current.has(i)
      const isKey = keyNodeIndicesRef.current.has(i)

      // Key nodes: show if toggled on. Everything else (including seeds): only when zoomed in.
      if (!(isKey && showKeyNodesRef.current) && zoom < 3) continue

      const pos = graph.spaceToScreenPosition([positions[i * 2], positions[i * 2 + 1]])

      // Skip if off screen
      if (pos[0] < -50 || pos[0] > w + 50 || pos[1] < -50 || pos[1] > h + 50) continue

      result.push({ name: nodesRef.current[i], x: pos[0], y: pos[1], isSeed, isKey })
    }

    // Cap at 50 labels when zoomed in (seeds + key nodes are always included)
    if (result.length > 50) {
      const priority = result.filter(l => l.isSeed || l.isKey)
      const rest = result.filter(l => !l.isSeed && !l.isKey).slice(0, 50 - priority.length)
      setLabels([...priority, ...rest])
    } else {
      setLabels(result)
    }
  }, [])

  // Track mouse position + clear stale hover
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY })
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
      onZoom: () => updateLabels(),
      onZoomEnd: () => updateLabels(),
      onPointMouseOver: (index) => {
        if (index == null) return
        setHoveredNode(nodesRef.current[index] ?? null)
        if (navStackRef.current.length === 0 && !showingPathRef.current) {
          graph.selectPointByIndex(index, true)
        }
      },
      onPointMouseOut: () => {
        setHoveredNode(null)
        if (navStackRef.current.length === 0 && !showingPathRef.current) {
          graph.unselectPoints()
        }
      },
      onPointClick: (index) => {
        if (index == null) return
        const title = nodesRef.current[index]
        if (!title) return
        // In subgraph or path view — open Wikipedia
        if (navStackRef.current.length > 0 || showingPathRef.current) {
          window.open(wikiUrl(title), '_blank')
          return
        }
        const g = graphRef.current as any
        if (g?.zoomInstance?.eventTransform) {
          const t = g.zoomInstance.eventTransform
          savedTransformRef.current = { k: t.k, x: t.x, y: t.y }
        }
        drillDown(title)
      },
      onBackgroundClick: () => {},
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

  // Render when graphData changes
  useEffect(() => {
    const graph = graphRef.current
    if (!graph || !graphData) return
    const isDrilled = navStackRef.current.length > 0
    const savedCameraTransform = !isDrilled ? savedTransformRef.current : null
    if (savedCameraTransform) savedTransformRef.current = null
    const isSubView = isDrilled || showingPathRef.current
    graph.setConfig({
      pointGreyoutOpacity: isSubView ? 1.0 : 0.08,
      linkGreyoutOpacity: isSubView ? 1.0 : 0.03,
      renderHoveredPointRing: !isSubView,
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
      if (savedCameraTransform) {
        const g = graph as any
        if (g.canvasD3Selection && g.zoomInstance?.behavior) {
          const ZoomTransform = g.zoomInstance.eventTransform.constructor
          const t = new ZoomTransform(savedCameraTransform.k, savedCameraTransform.x, savedCameraTransform.y)
          setTimeout(() => {
            g.canvasD3Selection.call(g.zoomInstance.behavior.transform, t)
          }, 50)
        }
      } else {
        setTimeout(() => graph.fitView(300), 50)
      }
      // Update labels after render settles
      setTimeout(() => updateLabels(), 400)
    })
  }, [graphData])

  // Re-render labels when showKeyNodes toggles
  useEffect(() => {
    updateLabels()
  }, [showKeyNodes])

  const isDrilledDown = navStack.length > 0

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100vh', position: 'relative' }}>
      {/* Node labels overlay */}
      {labels.map((label) => (
        <div
          key={label.name}
          style={{
            position: 'absolute',
            left: label.x,
            top: label.y - 16,
            transform: 'translateX(-50%)',
            color: label.isSeed ? '#cc3366' : label.isKey ? '#e2d9c0' : '#aaa',
            fontSize: label.isSeed ? 11 : 10,
            fontFamily: '"Nunito Sans", -apple-system, sans-serif',
            fontWeight: label.isSeed ? 700 : 400,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            textShadow: '0 0 4px #111318, 0 0 8px #111318',
            zIndex: 5,
          }}
        >
          {label.name}
        </div>
      ))}

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
      {(isDrilledDown || showingPath) && (
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
          {isDrilledDown && (
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
          )}
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

      {/* Key nodes toggle — bottom right */}
      {!isDrilledDown && !showingPath && (
        <div
          onClick={() => setShowKeyNodes(v => !v)}
          style={{
            position: 'absolute',
            bottom: 10,
            right: 10,
            color: showKeyNodes ? '#e2d9c0' : '#555',
            fontSize: 11,
            fontFamily: '"Nunito Sans", -apple-system, sans-serif',
            cursor: 'pointer',
            userSelect: 'none',
            zIndex: 10,
          }}
        >
          {showKeyNodes ? 'hide' : 'show'} landmarks
        </div>
      )}
    </div>
  )
}
