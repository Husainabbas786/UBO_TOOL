import * as dagre from 'dagre'
import {
  entityKindLabel,
  formatPercent,
  isNonCommercial,
  type CalculationResult,
  type EntityKind,
  type PartyType,
} from '../engine'

/** How an edge is drawn and coloured. */
export type EdgeTone = 'ownership' | 'control' | 'role' | 'nominee'

export interface ChartNode {
  key: string
  name: string
  /** The full name, wrapped to fit the box. Never abbreviated or truncated. */
  nameLines: string[]
  type: PartyType
  entityKind: EntityKind
  isTarget: boolean
  isUbo: boolean
  /** Short words along the top edge: "Control", a role, "Nominee". */
  badges: string[]
  /** Second line in the box: the target's label, the kind, or the effective %. */
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
  labelWidth: number
  tone: EdgeTone
  /** Anything that is not a shareholding is drawn dashed. */
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
export const SUB_FONT_SIZE = 11

export const NAME_FONT_SIZE = 12.5
export const NAME_LINE_HEIGHT = LINE_HEIGHT
export const NODE_TEXT_X = TEXT_X

const LABEL_MIN_WIDTH = 58
const LABEL_FONT_SIZE = 11
const LABEL_PAD_X = 9
export const LABEL_HEIGHT = 20
/** Uniform breathing room around the cropped drawing. */
const PADDING = 16

/** Badges sit astride the top edge of their node, right to left. */
export const BADGE_FONT_SIZE = 10
export const BADGE_HEIGHT = 18
const BADGE_PAD_X = 9
const BADGE_GAP = 4
const BADGE_RIGHT_INSET = 4
const BADGE_OVERHANG = 9

export function badgeWidth(text: string): number {
  return Math.ceil(textWidth(text, BADGE_FONT_SIZE) + BADGE_PAD_X * 2)
}

/** Badge boxes for one node, right-aligned along its top edge. */
export function badgeBoxes(
  node: Pick<ChartNode, 'badges' | 'x' | 'y' | 'width'>,
): Array<{ text: string; x: number; y: number; width: number }> {
  const boxes: Array<{ text: string; x: number; y: number; width: number }> = []
  let right = node.x + node.width - BADGE_RIGHT_INSET
  for (const text of node.badges) {
    const width = badgeWidth(text)
    boxes.push({ text, x: right - width, y: node.y - BADGE_OVERHANG, width })
    right -= width + BADGE_GAP
  }
  return boxes
}

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
  badges: string[]
  width: number
  height: number
}

/**
 * Box size for one party: as narrow as its longest line allows.
 *
 * The sub-label is measured too. It is set smaller than the name but can run
 * longer than it — "Trust · 100.00% effective" under a short name — and a box
 * sized to the name alone would let it run into its own right-hand edge.
 */
function measureNode(
  nameLines: string[],
  subLabel: string | null,
): { width: number; height: number } {
  const longest = nameLines.reduce(
    (max, line) => Math.max(max, textWidth(line)),
    subLabel === null ? 0 : textWidth(subLabel, SUB_FONT_SIZE),
  )
  const width = Math.min(
    NODE_MAX_WIDTH,
    Math.max(NODE_MIN_WIDTH, Math.ceil(TEXT_X + longest + TEXT_PAD_RIGHT)),
  )
  const content = nameLines.length * LINE_HEIGHT + (subLabel === null ? 0 : SUB_HEIGHT)
  return { width, height: Math.max(NODE_MIN_HEIGHT, content + NODE_PAD_Y * 2) }
}

/** One drawn arrow. Several links between the same pair collapse into one. */
interface PairEdge {
  id: string
  ownerKey: string
  entityKey: string
  labels: string[]
  tone: EdgeTone
}

/**
 * The arrows to draw, one per pair of parties.
 *
 * Dagre keys an edge by its endpoints, so two links between the same pair —
 * settlor *and* beneficiary of the same trust — have to be merged here, or the
 * second would overwrite the first and one role would vanish from the chart.
 *
 * A nominee arrangement adds an arrow that is not in the graph at all: from the
 * nominator down to the nominee who holds the shares for them. Without it the
 * nominator would float unattached, and which of the two is the beneficial
 * owner would be left to guesswork.
 */
function pairEdges(result: CalculationResult): PairEdge[] {
  const byPair = new Map<string, PairEdge>()

  const add = (edge: PairEdge) => {
    const pair = `${edge.ownerKey}>${edge.entityKey}`
    const existing = byPair.get(pair)
    if (existing) existing.labels.push(...edge.labels)
    else byPair.set(pair, { ...edge, labels: [...edge.labels] })
  }

  for (const link of result.graph.links) {
    if (link.isRole) {
      add({
        id: link.id,
        ownerKey: link.ownerKey,
        entityKey: link.entityKey,
        labels: [link.role ?? 'Role'],
        tone: 'role',
      })
      continue
    }
    add({
      id: link.id,
      ownerKey: link.ownerKey,
      entityKey: link.entityKey,
      labels: [link.isControl ? 'Control' : `${formatPercent(link.percent)}%`],
      tone: link.isControl ? 'control' : 'ownership',
    })

    if (link.nominatorKey !== null) {
      add({
        id: `${link.id}-nominator`,
        ownerKey: link.nominatorKey,
        entityKey: link.ownerKey,
        labels: ['via nominee'],
        tone: 'nominee',
      })
    }
  }

  return [...byPair.values()]
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

  /** Every role anybody was entered as, for the badge along the top of the box. */
  const rolesByOwner = new Map<string, string[]>()
  for (const link of result.graph.links) {
    if (!link.isRole || link.role === null) continue
    const list = rolesByOwner.get(link.ownerKey) ?? []
    if (!list.includes(link.role)) list.push(link.role)
    rolesByOwner.set(link.ownerKey, list)
  }

  const edgeList = pairEdges(result)

  // Measure first: dagre needs each box's real size to space the ranks.
  const nameWidth = NODE_MAX_WIDTH - TEXT_X - TEXT_PAD_RIGHT
  const measured = new Map<string, MeasuredNode>()
  for (const node of result.graph.nodes) {
    const percent = ownerPercent.get(node.key)

    /*
     * The second line of the box. A nominee holding nothing of their own is
     * said outright — "not a UBO" — because the arrow into the company is
     * theirs and, left unlabelled, would read as their shareholding.
     */
    let subLabel: string | null
    if (node.key === result.target.key) {
      subLabel = 'Meydan FZ company'
    } else if (node.isNominee && percent === undefined) {
      subLabel = 'Nominee — not a UBO'
    } else {
      const bits: string[] = []
      if (isNonCommercial(node.entityKind)) bits.push(entityKindLabel(node.entityKind))
      if (percent !== undefined) {
        bits.push(node.isNominee ? `${formatPercent(percent)}% own shares` : `${formatPercent(percent)}% effective`)
      }
      subLabel = bits.length > 0 ? bits.join(' · ') : null
    }

    const badges = [...(rolesByOwner.get(node.key) ?? [])]
    if (node.isNominee && percent !== undefined) badges.push('Nominee')
    if (node.isController) badges.push('Control')

    const nameLines = wrapName(node.name, nameWidth)
    measured.set(node.key, {
      nameLines,
      subLabel,
      badges,
      ...measureNode(nameLines, subLabel),
    })
  }

  for (const node of result.graph.nodes) {
    const box = measured.get(node.key)!
    graph.setNode(node.key, { width: box.width, height: box.height })
  }
  const labelWidths = new Map<string, number>()
  for (const edge of edgeList) {
    const label = edge.labels.join(', ')
    const width = Math.max(
      LABEL_MIN_WIDTH,
      Math.ceil(textWidth(label, LABEL_FONT_SIZE) + LABEL_PAD_X * 2),
    )
    labelWidths.set(`${edge.ownerKey}>${edge.entityKey}`, width)
    graph.setEdge(edge.ownerKey, edge.entityKey, {
      width,
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
   * label chip and badge, then shifting the whole drawing to sit at a uniform
   * padding from the top left, gives a tight and balanced image.
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
    for (const badge of badgeBoxes({ badges: box.badges, x: left, y: top, width: box.width })) {
      extend(badge.x, badge.y, badge.x + badge.width, badge.y + BADGE_HEIGHT)
    }
  }
  for (const edge of edgeList) {
    const routed = graph.edge(edge.ownerKey, edge.entityKey)
    for (const point of routed.points) extend(point.x, point.y, point.x, point.y)
    const labelX = routed.x ?? 0
    const labelY = routed.y ?? 0
    const width = labelWidths.get(`${edge.ownerKey}>${edge.entityKey}`) ?? LABEL_MIN_WIDTH
    extend(labelX - width / 2, labelY - LABEL_HEIGHT / 2, labelX + width / 2, labelY + LABEL_HEIGHT / 2)
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
      entityKind: node.entityKind,
      isTarget: node.key === result.target.key,
      isUbo: uboKeys.has(node.key),
      badges: box.badges,
      subLabel: box.subLabel,
      x: snap(positioned.x - box.width / 2 + shiftX),
      y: snap(positioned.y - box.height / 2 + shiftY),
      width: box.width,
      height: box.height,
    }
  })

  const edges: ChartEdge[] = edgeList.map((edge) => {
    const routed = graph.edge(edge.ownerKey, edge.entityKey)
    const pair = `${edge.ownerKey}>${edge.entityKey}`
    return {
      id: edge.id,
      points: routed.points.map((point) => ({
        x: snap(point.x + shiftX),
        y: snap(point.y + shiftY),
      })),
      label: edge.labels.join(', '),
      labelWidth: labelWidths.get(pair) ?? LABEL_MIN_WIDTH,
      tone: edge.tone,
      dashed: edge.tone !== 'ownership',
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
