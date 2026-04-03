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

  useEffect(() => {
    nodesRef.current = graphData?.nodes ?? []
  }, [graphData])

  useEffect(() => {
    if (!containerRef.current) return
    const graph = new Graph(containerRef.current, {
      spaceSize: 8192,
      backgroundColor: '#2d313a',
      pointDefaultColor: '#4B5BBF',
      pointDefaultSize: 4,
      scalePointsOnZoom: true,
      linkDefaultColor: '#5F74C2',
      linkDefaultWidth: 0.6,
      linkDefaultArrows: false,
      curvedLinks: true,
      renderHoveredPointRing: true,
      hoveredPointRingColor: '#4B5BBF',
      pointGreyoutOpacity: 0.08,
      linkGreyoutOpacity: 0.04,
      enableDrag: true,
      rescalePositions: true,
      fitViewDelay: 500,
      fitViewPadding: 0.15,
      simulationGravity: 0.1,
      simulationRepulsion: 0.5,
      simulationLinkSpring: 2,
      simulationFriction: 0.85,
      onPointClick: (index) => {
        if (index === undefined || index === null) { selectNode(null); return }
        const title = nodesRef.current[index]
        if (title) selectNode(title)
      },
      onBackgroundClick: () => selectNode(null),
    })
    graphRef.current = graph
    graph.render()
    return () => { graph.destroy() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Double-click to open Wikipedia
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onDblClick = () => {
      const graph = graphRef.current
      if (!graph) return
      const idx = (graph as any).store?.hoveredPoint
      if (idx == null) return
      const title = nodesRef.current[idx]
      if (title) window.open(wikiUrl(title), '_blank')
    }
    el.addEventListener('dblclick', onDblClick)
    return () => el.removeEventListener('dblclick', onDblClick)
  }, [])

  // Push new data
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
