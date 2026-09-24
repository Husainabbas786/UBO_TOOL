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
  /**
   * An officer of the Meydan FZ company rather than a party to the ownership.
   * Drawn beside the target and joined to it by a connector, never by an arrow.
   */
  isManagement: boolean
  /** Short words along the top edge: a role, or "Control". */
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
  /** The boxes this arrow joins, so an edge can be identified by its ends. */
  ownerKey: string
  entityKey: string
  points: Array<{ x: number; y: number }>
  label: string
  labelWidth: number
  tone: EdgeTone
  /** Anything that is not a shareholding is drawn dashed. */
  dashed: boolean
  labelX: number
  labelY: number
}

/**
 * The line joining a management box to the Meydan FZ company.
 *
 * Deliberately not a ChartEdge: an edge is an ownership relationship, with a
 * tone, an arrowhead and a percentage, and holding an office is none of those
 * things. Keeping them apart in the types is what stops a director being drawn
 * into the ownership flow by a later change.
 */
export interface ChartConnector {
  id: string
  points: Array<{ x: number; y: number }>
}

export interface ChartLayout {
  width: number
  height: number
  nodes: ChartNode[]
  edges: ChartEdge[]
  connectors: ChartConnector[]
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

/** Management boxes: narrower than a party, and set out in a lane of their own. */
const MGMT_MAX_WIDTH = 200
/** Clearance between the lane and the furthest-right thing in the structure. */
const MGMT_LANE_GAP = 72
/** Length of the stub leaving the company before the lane's spine. */
const MGMT_STUB = 36
const MGMT_GAP_Y = 10
/** Drop below the drawing when something sits beside the company on its rank. */
const MGMT_DROP = 44

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

/**
 * One drawn arrow. Links between the same pair collapse into one *per tone*:
 * settlor and beneficiary of one trust are one arrow, but shares held as a
 * nominee and shares held outright in the same company are two.
 */
interface PairEdge {
  id: string
  ownerKey: string
  entityKey: string
  labels: string[]
  tone: EdgeTone
  /** Dagre edge name, so two arrows can join the same pair of boxes. */
  name: string
}

/**
 * The arrows to draw.
 *
 * Links that say the same kind of thing about the same pair are merged —
 * settlor *and* beneficiary of one trust is one arrow reading both, not two
 * arrows on top of each other. Links that say different kinds of thing stay
 * apart, which is what keeps a nominee-held parcel distinct from shares the
 * same person owns outright in the same company.
 *
 * A nominee arrangement also adds an arrow that is not in the graph at all:
 * from the nominator down to the nominee who holds the shares for them.
 * Without it the nominator would float unattached, and which of the two is the
 * beneficial owner would be left to guesswork.
 */
function pairEdges(result: CalculationResult): PairEdge[] {
  const byPair = new Map<string, PairEdge>()

  const add = (edge: Omit<PairEdge, 'name'>) => {
    /*
     * Keyed by tone as well as by endpoints. Two links between the same pair
     * are the same arrow only when they say the same kind of thing: a person
     * who holds one parcel in a company as a nominee and another in their own
     * right holds two different things, and merging them would put one
     * percentage on the other's arrow.
     */
    const name = `${edge.ownerKey}>${edge.entityKey}>${edge.tone}`
    const existing = byPair.get(name)
    if (existing) existing.labels.push(...edge.labels)
    else byPair.set(name, { ...edge, labels: [...edge.labels], name })
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

    /*
     * Held as a nominee, or held outright?
     *
     * The distinction belongs to the shareholding, never to the person. The
     * same person can be a nominee in one company and a real shareholder in
     * another — or even in the same one — and marking the *person* as a
     * nominee says the shares they genuinely own are somebody else's too.
     * So the arrow carries it: this parcel is held for someone else.
     */
    const heldAsNominee = link.nominatorKey !== null
    add({
      id: link.id,
      ownerKey: link.ownerKey,
      entityKey: link.entityKey,
      labels: [
        link.isControl
          ? 'Control'
          : heldAsNominee
            ? `${formatPercent(link.percent)}% as nominee`
            : `${formatPercent(link.percent)}%`,
      ],
      tone: link.isControl ? 'control' : heldAsNominee ? 'nominee' : 'ownership',
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
  // Multigraph: two arrows can join the same pair of boxes — see pairEdges.
  const graph = new dagre.graphlib.Graph({ multigraph: true })
  graph.setGraph({ rankdir: 'TB', ranksep: 74, nodesep: 40, edgesep: 16, marginx: 8, marginy: 8 })
  graph.setDefaultEdgeLabel(() => ({}))

  const uboKeys = new Set(result.ubos.map((ubo) => ubo.key))
  const ownerPercent = new Map(result.owners.map((owner) => [owner.key, owner.totalPercent]))

  /*
 * Every role anybody was entered as, for the badge along the top of the box.
 * The badge says what they hold, not whether they qualify — a role-holder who
 * was not marked a beneficial owner still carries their role, and simply does
 * not get the green UBO treatment that comes from `isUbo`.
 */
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
     * The second line of the box.
     *
     * Someone who holds every one of their parcels for other people has no
     * stake of their own, and the arrows out of them would otherwise read as
     * their shareholdings — so their box says so outright. Someone who also
     * owns shares in their own right does not get that line: their effective
     * percentage is real, and which parcel is held for whom is said on the
     * arrows, one at a time.
     */
    let subLabel: string | null
    if (node.key === result.target.key) {
      subLabel = 'Meydan FZ company'
    } else if (node.isNominee && percent === undefined) {
      subLabel = 'Nominee — not a UBO'
    } else {
      const bits: string[] = []
      if (isNonCommercial(node.entityKind)) bits.push(entityKindLabel(node.entityKind))
      if (percent !== undefined) bits.push(`${formatPercent(percent)}% effective`)
      subLabel = bits.length > 0 ? bits.join(' · ') : null
    }

    const badges = [...(rolesByOwner.get(node.key) ?? [])]
    if (node.isController) badges.push('Control')

    const nameLines = wrapName(node.name, nameWidth)
    measured.set(node.key, {
      nameLines,
      subLabel,
      badges,
      ...measureNode(nameLines, subLabel),
    })
  }

  /*
   * The officers of the Meydan FZ company, measured here and positioned once
   * dagre has placed the target. They are never handed to dagre: putting them
   * in the graph would let the layout treat them as parties and rank them
   * among the shareholders, which is exactly what they are not.
   */
  const mgmtNameWidth = MGMT_MAX_WIDTH - TEXT_X - TEXT_PAD_RIGHT
  const mgmtBoxes = result.management.map((person) => {
    const nameLines = wrapName(person.name, mgmtNameWidth)
    const sized = measureNode(nameLines, person.designation)
    return {
      person,
      nameLines,
      width: Math.min(MGMT_MAX_WIDTH, sized.width),
      height: sized.height,
    }
  })

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
    labelWidths.set(edge.name, width)
    graph.setEdge(
      edge.ownerKey,
      edge.entityKey,
      { width, height: LABEL_HEIGHT, labelpos: 'c' },
      edge.name,
    )
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

  /*
   * The management branch, placed once the structure has been measured.
   *
   * It goes in a lane of its own, clear to the right of the furthest-right
   * thing in the drawing — not merely to the right of the company. Measuring
   * against the company alone is what let a box or a connector sit on top of a
   * shareholding edge or its percentage chip on a wide structure, which is the
   * overlap Compliance reported.
   *
   * The stub normally leaves the company's right-hand side, because everything
   * that owns the company arrives at its top and a reader can tell the two
   * apart at a glance. When something else shares the company's rank and sits
   * to its right — a second company nobody owns, say — that horizontal run
   * would cross it, so the stub drops below the drawing and crosses there
   * instead.
   */
  const targetBox = graph.node(result.target.key)
  const targetRight = targetBox.x + targetBox.width / 2
  const bandTop = targetBox.y - targetBox.height / 2
  const bandBottom = targetBox.y + targetBox.height / 2

  /** Is anything else sitting beside the company, in its own horizontal band? */
  const besideTarget = result.graph.nodes.some((node) => {
    if (node.key === result.target.key) return false
    const box = measured.get(node.key)!
    const positioned = graph.node(node.key)
    const left = positioned.x - box.width / 2
    const top = positioned.y - box.height / 2
    return left + box.width > targetRight && top < bandBottom && top + box.height > bandTop
  })

  const stubY = besideTarget ? maxY + MGMT_DROP : targetBox.y
  const stubStart = besideTarget
    ? { x: targetBox.x, y: bandBottom }
    : { x: targetRight, y: targetBox.y }

  const laneX = Math.max(targetRight + MGMT_STUB, maxX + MGMT_LANE_GAP)
  const spineX = laneX - MGMT_STUB / 2
  const stackHeight =
    mgmtBoxes.reduce((total, box) => total + box.height, 0) +
    Math.max(0, mgmtBoxes.length - 1) * MGMT_GAP_Y

  const placed: Array<{
    person: (typeof mgmtBoxes)[number]['person']
    nameLines: string[]
    x: number
    y: number
    width: number
    height: number
  }> = []
  let cursorY = stubY - stackHeight / 2
  for (const box of mgmtBoxes) {
    placed.push({
      person: box.person,
      nameLines: box.nameLines,
      x: laneX,
      y: cursorY,
      width: box.width,
      height: box.height,
    })
    cursorY += box.height + MGMT_GAP_Y
  }

  const rawConnectors: ChartConnector[] = placed.map((box) => ({
    id: `mgmt-line:${box.person.key}:${box.person.designation}`,
    points: [
      stubStart,
      { x: stubStart.x, y: stubY },
      { x: spineX, y: stubY },
      { x: spineX, y: box.y + box.height / 2 },
      { x: box.x, y: box.y + box.height / 2 },
    ].filter(
      (point, index, all) =>
        index === 0 || point.x !== all[index - 1]!.x || point.y !== all[index - 1]!.y,
    ),
  }))

  for (const box of placed) extend(box.x, box.y, box.x + box.width, box.y + box.height)
  for (const connector of rawConnectors) {
    for (const point of connector.points) extend(point.x, point.y, point.x, point.y)
  }
  for (const edge of edgeList) {
    const routed = graph.edge(edge.ownerKey, edge.entityKey, edge.name)
    for (const point of routed.points) extend(point.x, point.y, point.x, point.y)
    const labelX = routed.x ?? 0
    const labelY = routed.y ?? 0
    const width = labelWidths.get(edge.name) ?? LABEL_MIN_WIDTH
    extend(labelX - width / 2, labelY - LABEL_HEIGHT / 2, labelX + width / 2, labelY + LABEL_HEIGHT / 2)
  }

  const shiftX = Number.isFinite(minX) ? PADDING - minX : PADDING
  const shiftY = Number.isFinite(minY) ? PADDING - minY : PADDING

  const nodes: ChartNode[] = result.graph.nodes.map((node): ChartNode => {
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
      isManagement: false,
      badges: box.badges,
      subLabel: box.subLabel,
      x: snap(positioned.x - box.width / 2 + shiftX),
      y: snap(positioned.y - box.height / 2 + shiftY),
      width: box.width,
      height: box.height,
    }
  })

  for (const box of placed) {
    nodes.push({
      key: `mgmt:${box.person.key}:${box.person.designation}`,
      name: box.person.name,
      nameLines: box.nameLines,
      type: 'individual',
      entityKind: 'company',
      isTarget: false,
      isUbo: false,
      isManagement: true,
      badges: [],
      subLabel: box.person.designation,
      x: snap(box.x + shiftX),
      y: snap(box.y + shiftY),
      width: box.width,
      height: box.height,
    })
  }

  const connectors: ChartConnector[] = rawConnectors.map((connector) => ({
    id: connector.id,
    points: connector.points.map((point) => ({
      x: snap(point.x + shiftX),
      y: snap(point.y + shiftY),
    })),
  }))

  const edges: ChartEdge[] = edgeList.map((edge) => {
    const routed = graph.edge(edge.ownerKey, edge.entityKey, edge.name)
    return {
      id: edge.id,
      ownerKey: edge.ownerKey,
      entityKey: edge.entityKey,
      points: routed.points.map((point) => ({
        x: snap(point.x + shiftX),
        y: snap(point.y + shiftY),
      })),
      label: edge.labels.join(', '),
      labelWidth: labelWidths.get(edge.name) ?? LABEL_MIN_WIDTH,
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
    connectors,
  }
}
