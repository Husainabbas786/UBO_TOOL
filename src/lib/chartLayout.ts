import * as dagre from 'dagre'
import { controlLinks, formatPercent, type CalculationResult, type PartyType } from '../engine'

export interface ChartNode {
  key: string
  name: string
  type: PartyType
  isTarget: boolean
  isUbo: boolean
  isController: boolean
  /** Aggregated effective % of the target, shown only for ultimate owners. */
  effectiveLabel: string | null
  x: number
  y: number
  width: number
  height: number
}

export interface ChartEdge {
  id: string
  points: Array<{ x: number; y: number }>
  label: string
  /** Control without ownership is drawn dashed, and labelled "Control". */
  dashed: boolean
  labelX: number
  labelY: number
}

export interface ChartLayout {
  width: number
  height: number
  nodes: ChartNode[]
  edges: ChartEdge[]
}

const NODE_WIDTH = 168
const NODE_HEIGHT = 58
const LABEL_WIDTH = 58
const LABEL_HEIGHT = 20
const PADDING = 16

/**
 * Positions the ownership graph top-down with dagre. Individuals fall at the top
 * and the target at the bottom on their own, because individuals have nothing
 * flowing into them and the target has nothing flowing out.
 *
 * No ownership maths happens here: every percentage comes from the engine's
 * result, and every node comes from the engine's de-duplicated graph.
 */
export function layoutChart(result: CalculationResult): ChartLayout {
  const graph = new dagre.graphlib.Graph()
  graph.setGraph({ rankdir: 'TB', ranksep: 74, nodesep: 40, edgesep: 16, marginx: 8, marginy: 8 })
  graph.setDefaultEdgeLabel(() => ({}))

  for (const node of result.graph.nodes) {
    graph.setNode(node.key, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }
  for (const link of result.graph.links) {
    graph.setEdge(link.ownerKey, link.entityKey, {
      width: LABEL_WIDTH,
      height: LABEL_HEIGHT,
      labelpos: 'c',
    })
  }

  dagre.layout(graph)

  const uboKeys = new Set(result.ubos.map((ubo) => ubo.key))
  const ownerPercent = new Map(result.owners.map((owner) => [owner.key, owner.totalPercent]))
  const controlKeys = new Set(controlLinks(result.graph).map((link) => `${link.ownerKey}>${link.entityKey}`))

  const nodes: ChartNode[] = result.graph.nodes.map((node) => {
    const positioned = graph.node(node.key)
    const percent = ownerPercent.get(node.key)
    return {
      key: node.key,
      name: node.name,
      type: node.type,
      isTarget: node.key === result.target.key,
      isUbo: uboKeys.has(node.key),
      isController: node.isController,
      effectiveLabel: percent === undefined ? null : `${formatPercent(percent)}% effective`,
      x: positioned.x - NODE_WIDTH / 2 + PADDING,
      y: positioned.y - NODE_HEIGHT / 2 + PADDING,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    }
  })

  const edges: ChartEdge[] = result.graph.links.map((link) => {
    const routed = graph.edge(link.ownerKey, link.entityKey)
    const isControl = controlKeys.has(`${link.ownerKey}>${link.entityKey}`)
    return {
      id: link.id,
      points: routed.points.map((point) => ({ x: point.x + PADDING, y: point.y + PADDING })),
      label: isControl ? 'Control' : `${formatPercent(link.percent)}%`,
      dashed: isControl,
      labelX: (routed.x ?? 0) + PADDING,
      labelY: (routed.y ?? 0) + PADDING,
    }
  })

  const laid = graph.graph()
  return {
    width: (laid.width ?? 0) + PADDING * 2,
    height: (laid.height ?? 0) + PADDING * 2,
    nodes,
    edges,
  }
}
