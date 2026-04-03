import { useRef, useEffect } from 'react'
import { Graph } from '@cosmos.gl/graph'
import { useStore } from '../lib/store'
import { wikiUrl } from '../lib/wikipedia'

export function GraphView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<Graph | null>(null)
  const nodesRef = useRef<string[]>([])
  const graphData = useStore(s => s.graphData)
  const selectNode = useStore(s => s.selectNode)
  const setHoveredNode = useStore(s => s.setHoveredNode)

  useEffect(() => {
    nodesRef.current = graphData?.nodes ?? []
  }, [graphData])

  // Init graph once — no render yet, wait for data
  useEffect(() => {
    if (!containerRef.current) return
    const graph = new Graph(containerRef.current, {
      spaceSize: 4096,
      backgroundColor: '#0f172a',
      pointDefaultColor: '#60a5fa',
      pointDefaultSize: 4,
      scalePointsOnZoom: true,
      linkDefaultColor: '#94a3b8',
      linkDefaultWidth: 0.8,
      linkDefaultArrows: false,
      curvedLinks: false,
      renderHoveredPointRing: true,
      hoveredPointRingColor: '#f0f9ff',
      pointGreyoutOpacity: 0.05,
      linkGreyoutOpacity: 0.02,
      enableDrag: true,
      rescalePositions: true,
      simulationGravity: 0.1,
      simulationRepulsion: 0.5,
      simulationLinkSpring: 2,
      simulationLinkDistance: 1,
      simulationFriction: 0.1,
      simulationDecay: 10000000,
      onSimulationEnd: () => {
        graph.pause()
        graph.fitView(500)
      },
      onPointClick: (index) => {
        if (index == null) return
        const title = nodesRef.current[index]
        if (!title) return
        graph.selectPointByIndex(index, false)
        graph.zoomToPointByIndex(index, 600, 3)
        selectNode(title)
      },
      onPointMouseOver: (index) => {
        if (index == null) return
        setHoveredNode(nodesRef.current[index] ?? null)
      },
      onPointMouseOut: () => setHoveredNode(null),
      onBackgroundClick: () => {
        graph.unselectPoints()
        selectNode(null)
        graph.fitView(300)
      },
      attribution: '',
    })
    graphRef.current = graph
    return () => { graph.destroy() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Render once when data arrives
  useEffect(() => {
    const graph = graphRef.current
    if (!graph || !graphData) return
    graph.setPointPositions(graphData.pointPositions)
    graph.setPointColors(graphData.pointColors)
    graph.setPointSizes(graphData.pointSizes)
    graph.setLinks(graphData.linkIndexes)
    graph.setLinkColors(graphData.linkColors)
    graph.render()
  }, [graphData])

  return <div ref={containerRef} style={{ width: '100%', height: '100vh' }} />
}
