import * as dagre from 'dagre'
import { controlLinks, formatPercent, type CalculationResult, type PartyType } from '../engine'

export interface ChartNode {
  key: string
  name: string
  /** The full name, wrapped to fit the box. Never abbreviated or truncated. */
  nameLines: string[]
  type: PartyType
  isTarget: boolean
  isUbo: boolean
  isController: boolean
  /** Second line in the box: the target's label, or the aggregated effective %. */
  subLabel: string | null
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

/** Dagre returns fractional positions; snapping to whole pixels keeps strokes
 *  and text crisp instead of straddling a pixel boundary and blurring. */
const snap = (value: number): number => Math.round(value)

const NODE_MIN_WIDTH = 168
const NODE_MAX_WIDTH = 248
/** Left inset of the text column: icon gutter. Right inset is the padding. */
const TEXT_X = 38
const TEXT_PAD_RIGHT = 12
const NODE_MIN_HEIGHT = 58
const NODE_PAD_Y = 12
const LINE_HEIGHT = 16
const SUB_HEIGHT = 16

export const NAME_FONT_SIZE = 12.5
export const NAME_LINE_HEIGHT = LINE_HEIGHT
export const NODE_TEXT_X = TEXT_X

const LABEL_WIDTH = 58
const LABEL_HEIGHT = 20
/** Uniform breathing room around the cropped drawing. */
const PADDING = 16
/** The "Control" badge overhangs the top edge of its node by this much. */
const BADGE_WIDTH = 48
const BADGE_OVERHANG = 9

/*
 * Text is measured from a character-width table rather than from the canvas.
 *
 * A canvas measurement would be exact, but only once the brand face has
 * loaded — measure a moment too early and the chart wraps against a fallback
 * font, then never re-wraps. The table gives the same answer on every render
 * and in every export, and is rounded up slightly so a line always fits the
 * box it was measured for.
 */
const WIDE_CHARS = 'MW@%'
const NARROW_CHARS = "iljtfrI.,:;'`|!()[]{}-"

function charWidth(char: string, fontSize: number): number {
  if (char === ' ') return fontSize * 0.28
  if (WIDE_CHARS.includes(char)) return fontSize * 0.86
  if (NARROW_CHARS.includes(char)) return fontSize * 0.34
  // Capitals and digits run wider than lower case in Plus Jakarta Sans.
  if (char >= 'A' && char <= 'Z') return fontSize * 0.68
  if (char >= '0' && char <= '9') return fontSize * 0.62
  return fontSize * 0.58
}

export function textWidth(text: string, fontSize = NAME_FONT_SIZE): number {
  let total = 0
  for (const char of text) total += charWidth(char, fontSize)
  return total
}

/** Splits a word that is longer than a whole line, so nothing is ever cut off. */
function breakLongWord(word: string, maxWidth: number): string[] {
  const pieces: string[] = []
  let current = ''
  for (const char of word) {
    if (current !== '' && textWidth(current + char) > maxWidth) {
      pieces.push(current)
      current = char
    } else {
      current += char
    }
  }
  if (current !== '') pieces.push(current)
  return pieces
}

/**
 * Greedy word wrap. A name that will not fit the box on three lines is given as
 * many lines as it needs: the full name has to stay readable, on screen and in
 * the exported file, so truncation is never an option.
 */
export function wrapName(name: string, maxWidth: number): string[] {
  const lines: string[] = []
  let current = ''

  for (const word of name.split(' ').filter((part) => part !== '')) {
    const candidate = current === '' ? word : `${current} ${word}`
    if (textWidth(candidate) <= maxWidth) {
      current = candidate
      continue
    }
    if (current !== '') lines.push(current)
    if (textWidth(word) <= maxWidth) {
      current = word
      continue
    }
    const pieces = breakLongWord(word, maxWidth)
    lines.push(...pieces.slice(0, -1))
    current = pieces[pieces.length - 1] ?? ''
  }

  if (current !== '') lines.push(current)
  return lines.length > 0 ? lines : ['']
}

interface MeasuredNode {
  nameLines: string[]
  subLabel: string | null
  width: number
  height: number
}

/** Box size for one party: as narrow as its longest line allows. */
function measureNode(nameLines: string[], hasSubLabel: boolean): { width: number; height: number } {
  const longest = nameLines.reduce((max, line) => Math.max(max, textWidth(line)), 0)
  const width = Math.min(
    NODE_MAX_WIDTH,
    Math.max(NODE_MIN_WIDTH, Math.ceil(TEXT_X + longest + TEXT_PAD_RIGHT)),
  )
  const content = nameLines.length * LINE_HEIGHT + (hasSubLabel ? SUB_HEIGHT : 0)
  return { width, height: Math.max(NODE_MIN_HEIGHT, content + NODE_PAD_Y * 2) }
}

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

  const uboKeys = new Set(result.ubos.map((ubo) => ubo.key))
  const ownerPercent = new Map(result.owners.map((owner) => [owner.key, owner.totalPercent]))
  const controlKeys = new Set(
    controlLinks(result.graph).map((link) => `${link.ownerKey}>${link.entityKey}`),
  )

  // Measure first: dagre needs each box's real size to space the ranks.
  const nameWidth = NODE_MAX_WIDTH - TEXT_X - TEXT_PAD_RIGHT
  const measured = new Map<string, MeasuredNode>()
  for (const node of result.graph.nodes) {
    const percent = ownerPercent.get(node.key)
    const subLabel =
      node.key === result.target.key
        ? 'Meydan FZ company'
        : percent === undefined
          ? null
          : `${formatPercent(percent)}% effective`
    const nameLines = wrapName(node.name, nameWidth)
    measured.set(node.key, { nameLines, subLabel, ...measureNode(nameLines, subLabel !== null) })
  }

  for (const node of result.graph.nodes) {
    const box = measured.get(node.key)!
    graph.setNode(node.key, { width: box.width, height: box.height })
  }
  for (const link of result.graph.links) {
    graph.setEdge(link.ownerKey, link.entityKey, {
      width: LABEL_WIDTH,
      height: LABEL_HEIGHT,
      labelpos: 'c',
    })
  }

  dagre.layout(graph)

  /*
   * Crop to what is actually drawn.
   *
   * Dagre's own graph width covers the space it reserved for routing, which can
   * run wider than the drawing on one side and leave the chart sitting off to
   * the left with an empty gutter beside it — visible on screen, and baked into
   * an exported PNG. Measuring the real extents of every box, edge point, edge
   * label chip and control badge, then shifting the whole drawing to sit at a
   * uniform padding from the top left, gives a tight and balanced image.
   */
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  const extend = (x1: number, y1: number, x2: number, y2: number) => {
    minX = Math.min(minX, x1)
    minY = Math.min(minY, y1)
    maxX = Math.max(maxX, x2)
    maxY = Math.max(maxY, y2)
  }

  for (const node of result.graph.nodes) {
    const positioned = graph.node(node.key)
    const box = measured.get(node.key)!
    const left = positioned.x - box.width / 2
    const top = positioned.y - box.height / 2
    extend(left, top, left + box.width, top + box.height)
    // The Control badge sits astride the top edge, inset from the right.
    if (node.isController) extend(left + box.width - BADGE_WIDTH - 4, top - BADGE_OVERHANG, left + box.width - 4, top)
  }
  for (const link of result.graph.links) {
    const routed = graph.edge(link.ownerKey, link.entityKey)
    for (const point of routed.points) extend(point.x, point.y, point.x, point.y)
    const labelX = routed.x ?? 0
    const labelY = routed.y ?? 0
    extend(labelX - LABEL_WIDTH / 2, labelY - LABEL_HEIGHT / 2, labelX + LABEL_WIDTH / 2, labelY + LABEL_HEIGHT / 2)
  }

  const shiftX = Number.isFinite(minX) ? PADDING - minX : PADDING
  const shiftY = Number.isFinite(minY) ? PADDING - minY : PADDING

  const nodes: ChartNode[] = result.graph.nodes.map((node) => {
    const positioned = graph.node(node.key)
    const box = measured.get(node.key)!
    return {
      key: node.key,
      name: node.name,
      nameLines: box.nameLines,
      type: node.type,
      isTarget: node.key === result.target.key,
      isUbo: uboKeys.has(node.key),
      isController: node.isController,
      subLabel: box.subLabel,
      x: snap(positioned.x - box.width / 2 + shiftX),
      y: snap(positioned.y - box.height / 2 + shiftY),
      width: box.width,
      height: box.height,
    }
  })

  const edges: ChartEdge[] = result.graph.links.map((link) => {
    const routed = graph.edge(link.ownerKey, link.entityKey)
    const isControl = controlKeys.has(`${link.ownerKey}>${link.entityKey}`)
    return {
      id: link.id,
      points: routed.points.map((point) => ({
        x: snap(point.x + shiftX),
        y: snap(point.y + shiftY),
      })),
      label: isControl ? 'Control' : `${formatPercent(link.percent)}%`,
      dashed: isControl,
      labelX: snap((routed.x ?? 0) + shiftX),
      labelY: snap((routed.y ?? 0) + shiftY),
    }
  })

  return {
    width: Number.isFinite(maxX) ? Math.ceil(maxX - minX + PADDING * 2) : PADDING * 2,
    height: Number.isFinite(maxY) ? Math.ceil(maxY - minY + PADDING * 2) : PADDING * 2,
    nodes,
    edges,
  }
}
