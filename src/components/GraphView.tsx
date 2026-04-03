import { useRef, useEffect } from 'react'
import { Graph } from '@cosmos.gl/graph'
import { useStore } from '../lib/store'
import { wikiUrl } from '../lib/wikipedia'

export function GraphView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<Graph | null>(null)
  const graphData = useStore(s => s.graphData)
  const selectNode = useStore(s => s.selectNode)
  const nodes = graphData?.nodes ?? []

  // Init cosmos graph
  useEffect(() => {
    if (!containerRef.current) return
    const graph = new Graph(containerRef.current, {
      backgroundColor: '#0f172a',
      simulationGravity: 0.1,
      simulationRepulsion: 2.0,
      simulationLinkSpring: 1.0,
      simulationFriction: 0.85,
      renderHoveredPointRing: true,
      hoveredPointRingColor: '#60a5fa',
      pointGreyoutOpacity: 0.08,
      linkGreyoutOpacity: 0.04,
      linkArrows: false,
    })
    graphRef.current = graph

    graph.on('pointClick', (index) => {
      if (index === undefined || index === null) {
        selectNode(null)
        return
      }
      const title = nodes[index]
      if (title) selectNode(title)
    })

    graph.on('pointDblClick', (index) => {
      if (index === undefined || index === null) return
      const title = nodes[index]
      if (title) window.open(wikiUrl(title), '_blank')
    })

    return () => { graph.destroy() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update data when graphData changes
  useEffect(() => {
    const graph = graphRef.current
    if (!graph || !graphData) return
    graph.setPointPositions(graphData.pointPositions)
    graph.setPointSizes(graphData.pointSizes)
    graph.setPointColors(graphData.pointColors)
    graph.setLinks(graphData.linkIndexes, graphData.linkColors)
    graph.restart()
  }, [graphData])

  // Rebind click handler when nodes list changes
  useEffect(() => {
    const graph = graphRef.current
    if (!graph) return
    graph.off('pointClick')
    graph.on('pointClick', (index) => {
      if (index === undefined || index === null) { selectNode(null); return }
      const title = nodes[index]
      if (title) selectNode(title)
    })
    graph.off('pointDblClick')
    graph.on('pointDblClick', (index) => {
      if (index === undefined || index === null) return
      const title = nodes[index]
      if (title) window.open(wikiUrl(title), '_blank')
    })
  }, [nodes, selectNode])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
