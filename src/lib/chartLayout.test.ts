import { describe, expect, it } from 'vitest'
import {
  buildGraph,
  calculate,
  defaultTargetKey,
  type OwnershipLinkInput,
  type PartyType,
} from '../engine'
import { LABEL_HEIGHT, layoutChart, type ChartEdge } from './chartLayout'

let seq = 0
const id = () => `c-${(seq += 1)}`

function owns(
  ownerName: string,
  ownerType: PartyType,
  percent: number,
  entityName: string,
): OwnershipLinkInput {
  return { id: id(), ownerName, ownerType, ownerIsController: false, percent, entityName }
}

/** A shareholding held on paper by `ownerName` for `nominatorName`. */
function nominee(
  ownerName: string,
  percent: number,
  entityName: string,
  nominatorName: string,
): OwnershipLinkInput {
  return {
    id: id(),
    ownerName,
    ownerType: 'individual',
    ownerIsController: false,
    percent,
    entityName,
    ownerIsNominee: true,
    nominatorName,
    nominatorType: 'individual',
  }
}

function layoutOf(links: OwnershipLinkInput[], threshold = 25) {
  const graph = buildGraph(links)
  const targetKey = defaultTargetKey(graph)
  expect(targetKey).not.toBeNull()
  return layoutChart(calculate(links, { targetKey: targetKey as string, threshold }))
}

/** Every arrow drawn from one box to another. */
const between = (edges: ChartEdge[], from: string, to: string): ChartEdge[] =>
  edges.filter((edge) => edge.ownerKey === from && edge.entityKey === to)

// ---------------------------------------------------------------------------
// A nominee arrangement belongs to the shareholding, not to the person
// ---------------------------------------------------------------------------

describe('nominee holdings on the chart', () => {
  /*
   * The case Compliance hit on the iMile structure: one person holding shares
   * for somebody else in one company, and shares of their own in another. The
   * two must not look alike.
   */
  const mixedAcrossCompanies = [
    nominee('Mohammed Altaf', 100, 'Yangda Corporation', 'Huang Zhen'),
    owns('Yangda Corporation', 'company', 78.61, 'ABCD Company'),
    owns('Mohammed Altaf', 'individual', 21.39, 'ABCD Company'),
  ]

  it('marks only the nominee-held link, leaving the direct holding plain', () => {
    const edges = layoutOf(mixedAcrossCompanies).edges

    const held = between(edges, 'mohammed altaf', 'yangda corporation')
    expect(held).toHaveLength(1)
    expect(held[0]?.tone).toBe('nominee')
    expect(held[0]?.label).toBe('100.00% as nominee')

    const direct = between(edges, 'mohammed altaf', 'abcd company')
    expect(direct).toHaveLength(1)
    expect(direct[0]?.tone).toBe('ownership')
    expect(direct[0]?.label).toBe('21.39%')
  })

  it('still draws the nominator down to the nominee', () => {
    const toNominee = between(layoutOf(mixedAcrossCompanies).edges, 'huang zhen', 'mohammed altaf')
    expect(toNominee).toHaveLength(1)
    expect(toNominee[0]?.tone).toBe('nominee')
    expect(toNominee[0]?.label).toBe('via nominee')
  })

  it('never marks the person, only the shareholding', () => {
    const altaf = layoutOf(mixedAcrossCompanies).nodes.find((n) => n.key === 'mohammed altaf')
    expect(altaf?.badges).toEqual([])
    expect(altaf?.subLabel).toBe('21.39% effective')
  })

  /*
   * The harder version of the same thing: both parcels are in one company, so
   * the two arrows join the same pair of boxes and have to stay apart anyway.
   */
  const mixedInOneCompany = [
    nominee('Ali Hassan', 60, 'ABC LTD', 'Husain'),
    owns('Ali Hassan', 'individual', 40, 'ABC LTD'),
  ]

  it('keeps two parcels in the same company as two arrows', () => {
    const both = between(layoutOf(mixedInOneCompany).edges, 'ali hassan', 'abc ltd')
    expect(both).toHaveLength(2)
    expect(both.map((edge) => `${edge.tone}:${edge.label}`).sort()).toEqual([
      'nominee:60.00% as nominee',
      'ownership:40.00%',
    ])
  })

  it('says outright that a pure nominee owns nothing', () => {
    const ali = layoutOf([nominee('Ali Hassan', 100, 'ABC LTD', 'Husain')]).nodes.find(
      (node) => node.key === 'ali hassan',
    )
    expect(ali?.subLabel).toBe('Nominee — not a UBO')
    expect(ali?.isUbo).toBe(false)
  })

  it('leaves a structure with no nominees free of nominee arrows', () => {
    const plain = [
      owns('Masood', 'individual', 25, 'ABC LTD'),
      owns('XYZ Ltd', 'company', 75, 'ABC LTD'),
      owns('Husain', 'individual', 100, 'XYZ Ltd'),
    ]
    const edges = layoutOf(plain).edges
    expect(edges.every((edge) => edge.tone === 'ownership')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Management sits beside the company, not inside the ownership
// ---------------------------------------------------------------------------

describe('management on the chart', () => {
  const plain = [
    owns('Masood', 'individual', 25, 'ABC LTD'),
    owns('XYZ Ltd', 'company', 75, 'ABC LTD'),
    owns('Husain', 'individual', 100, 'XYZ Ltd'),
  ]

  const withBoard = () => {
    const graph = buildGraph(plain)
    const targetKey = defaultTargetKey(graph) as string
    return layoutChart(
      calculate(plain, {
        targetKey,
        threshold: 25,
        management: [
          { id: 'm1', name: 'Jane Doe', designation: 'Director' },
          { id: 'm2', name: 'John Roe', designation: 'Manager' },
        ],
      }),
    )
  }

  it('draws one box per officer, labelled with the designation', () => {
    const officers = withBoard().nodes.filter((node) => node.isManagement)
    expect(officers.map((node) => [node.name, node.subLabel])).toEqual([
      ['Jane Doe', 'Director'],
      ['John Roe', 'Manager'],
    ])
    expect(officers.every((node) => node.isUbo === false)).toBe(true)
  })

  it('places them to the side of the Meydan FZ company, never above it', () => {
    const layout = withBoard()
    const target = layout.nodes.find((node) => node.isTarget)!
    for (const officer of layout.nodes.filter((node) => node.isManagement)) {
      expect(officer.x).toBeGreaterThan(target.x + target.width)
    }
  })

  it('joins them with connectors, not with ownership arrows', () => {
    const layout = withBoard()
    expect(layout.connectors).toHaveLength(2)
    // Every arrow on the chart is still a shareholding between two parties.
    expect(layout.edges.every((edge) => edge.tone === 'ownership')).toBe(true)
    expect(layout.edges.some((edge) => edge.entityKey.startsWith('mgmt'))).toBe(false)
    expect(layout.edges.some((edge) => edge.ownerKey.startsWith('mgmt'))).toBe(false)
  })

  it('leaves the drawing untouched when nobody was entered', () => {
    const layout = layoutOf(plain)
    expect(layout.connectors).toEqual([])
    expect(layout.nodes.some((node) => node.isManagement)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// The management lane keeps clear of the structure
// ---------------------------------------------------------------------------

describe('the management lane', () => {
  const board = [
    { id: 'm1', name: 'Jane Doe', designation: 'Director' as const },
    { id: 'm2', name: 'John Roe', designation: 'Manager' as const },
    { id: 'm3', name: 'Sara Noor', designation: 'Authorized Person' as const },
  ]

  const laidOut = (links: OwnershipLinkInput[]) => {
    const graph = buildGraph(links)
    const targetKey = defaultTargetKey(graph) as string
    return layoutChart(calculate(links, { targetKey, threshold: 25, management: board }))
  }

  /** Do two rectangles share any area? */
  const overlaps = (
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ) =>
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

  /** The structure Compliance reported the overlap on: wide, with a nominee. */
  const wide = [
    nominee('Mohammed Altaf', 100, 'Yangda Corporation', 'Huang Zhen'),
    owns('Yangda Corporation', 'company', 40, 'ABCD Company'),
    owns('Mohammed Altaf', 'individual', 21, 'ABCD Company'),
    owns('Second Holdings', 'company', 39, 'ABCD Company'),
    owns('Layla', 'individual', 60, 'Second Holdings'),
    owns('Tariq', 'individual', 40, 'Second Holdings'),
  ]

  it('never lets a management box sit on a party', () => {
    const layout = laidOut(wide)
    const officers = layout.nodes.filter((node) => node.isManagement)
    const parties = layout.nodes.filter((node) => !node.isManagement)
    expect(officers).toHaveLength(3)
    for (const officer of officers) {
      for (const party of parties) expect(overlaps(officer, party)).toBe(false)
    }
  })

  it('never lets a management box sit on an edge label', () => {
    const layout = laidOut(wide)
    for (const officer of layout.nodes.filter((node) => node.isManagement)) {
      for (const edge of layout.edges) {
        const chip = {
          x: edge.labelX - edge.labelWidth / 2,
          y: edge.labelY - LABEL_HEIGHT / 2,
          width: edge.labelWidth,
          height: LABEL_HEIGHT,
        }
        expect(overlaps(officer, chip)).toBe(false)
      }
    }
  })

  it('opens a lane clear to the right of the whole structure', () => {
    const layout = laidOut(wide)
    const parties = layout.nodes.filter((node) => !node.isManagement)
    const structureRight = Math.max(...parties.map((node) => node.x + node.width))
    for (const officer of layout.nodes.filter((node) => node.isManagement)) {
      expect(officer.x).toBeGreaterThan(structureRight)
    }
  })

  it('drops the connector below when a second company shares the bottom rank', () => {
    // Two companies own nothing, so both sit beside each other on that rank; a
    // stub straight out of the target's side would cross the other one.
    const twoSinks = [
      owns('Masood', 'individual', 100, 'ABC LTD'),
      owns('Masood', 'individual', 100, 'Other Co'),
    ]
    const graph = buildGraph(twoSinks)
    const layout = layoutChart(
      calculate(twoSinks, { targetKey: 'abc ltd', threshold: 25, management: board }),
    )
    expect(graph.targetCandidates).toHaveLength(2)

    const other = layout.nodes.find((node) => node.key === 'other co')!
    for (const connector of layout.connectors) {
      for (const point of connector.points) {
        const insideOther =
          point.x > other.x &&
          point.x < other.x + other.width &&
          point.y > other.y &&
          point.y < other.y + other.height
        expect(insideOther).toBe(false)
      }
    }
  })
})
