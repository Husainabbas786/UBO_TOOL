import { describe, expect, it } from 'vitest'
import { buildGraph } from './normalize'
import { calculate, defaultTargetKey } from './calculate'
import { validate } from './validate'
import { SAMPLE_LINKS } from './sample'
import type { OwnershipLinkInput } from './types'

/** Convenience for building test structures without repeating boilerplate. */
function link(
  id: string,
  ownerName: string,
  ownerType: OwnershipLinkInput['ownerType'],
  percent: number,
  entityName: string,
  ownerIsController = false,
): OwnershipLinkInput {
  return { id, ownerName, ownerType, ownerIsController, percent, entityName }
}

/** Runs the engine against the auto-detected target at the given threshold. */
function run(links: OwnershipLinkInput[], threshold = 25) {
  const graph = buildGraph(links)
  const targetKey = defaultTargetKey(graph)
  expect(targetKey).not.toBeNull()
  return calculate(links, { targetKey: targetKey as string, threshold })
}

describe('CLAUDE.md case 1 — the sample structure', () => {
  it('validates and auto-detects ABC LTD as the target', () => {
    const graph = buildGraph(SAMPLE_LINKS)
    expect(validate(SAMPLE_LINKS, graph).ok).toBe(true)
    expect(graph.targetCandidates.map((n) => n.name)).toEqual(['ABC LTD'])
    expect(defaultTargetKey(graph)).toBe('abc ltd')
  })

  it('counts 5 entities and 3 ownership paths', () => {
    const result = run(SAMPLE_LINKS)
    expect(result.entityCount).toBe(5)
    expect(result.pathCount).toBe(3)
    expect(result.target.name).toBe('ABC LTD')
  })

  it('identifies Masood 25.00%, Husain 37.50% and Dinesh 37.50% as UBOs', () => {
    const result = run(SAMPLE_LINKS)
    expect(result.ubos.map((u) => [u.name, u.totalPercent, u.basis])).toEqual([
      ['Dinesh', 37.5, 'Ownership'],
      ['Husain', 37.5, 'Ownership'],
      ['Masood', 25, 'Ownership'],
    ])
  })

  it('qualifies at exactly the threshold and never says "Exceeds"', () => {
    const masood = run(SAMPLE_LINKS).paths.find((p) => p.ownerName === 'Masood')
    expect(masood?.effectivePercent).toBe(25)
    expect(masood?.status).toBe('UBO')
  })

  it('shows each path with its own chain', () => {
    const result = run(SAMPLE_LINKS)
    expect(result.paths.map((p) => p.chain.join(' → '))).toEqual([
      'Dinesh → XYZ Ltd → ABC LTD',
      'Husain → XYZ Ltd → ABC LTD',
      'Masood → ABC LTD',
    ])
  })

  it('lists XYZ Ltd as an intermediary at 75.00%', () => {
    const result = run(SAMPLE_LINKS)
    expect(result.intermediaries).toEqual([
      { key: 'xyz ltd', name: 'XYZ Ltd', effectivePercent: 75 },
    ])
  })

  it('treats XYZ Ltd as one company node, not a person', () => {
    const graph = buildGraph(SAMPLE_LINKS)
    const xyz = graph.nodes.filter((n) => n.key === 'xyz ltd')
    expect(xyz).toHaveLength(1)
    expect(xyz[0]?.type).toBe('company')
  })
})

describe('CLAUDE.md case 2 — aggregation across multiple paths', () => {
  const links: OwnershipLinkInput[] = [
    link('1', 'Masood', 'individual', 25, 'ABC LTD'),
    link('2', 'XYZ Ltd', 'company', 75, 'ABC LTD'),
    link('3', 'Husain', 'individual', 45, 'XYZ Ltd'),
    link('4', 'Dinesh', 'individual', 45, 'XYZ Ltd'),
    link('5', 'Masood', 'individual', 10, 'XYZ Ltd'),
  ]

  it('sums Masood 25% direct + 10% x 75% indirect to 32.50%', () => {
    const result = run(links)
    const masood = result.owners.find((o) => o.name === 'Masood')
    expect(masood?.totalPercent).toBe(32.5)
    expect(masood?.pathCount).toBe(2)
  })

  it('still lists both of Masood’s paths separately', () => {
    const paths = run(links).paths.filter((p) => p.ownerName === 'Masood')
    expect(paths.map((p) => [p.chain.join(' → '), p.effectivePercent])).toEqual([
      ['Masood → ABC LTD', 25],
      ['Masood → XYZ Ltd → ABC LTD', 7.5],
    ])
  })

  it('drops Husain and Dinesh to 33.75% each and keeps them UBOs', () => {
    const result = run(links)
    expect(result.ubos.map((u) => [u.name, u.totalPercent])).toEqual([
      ['Dinesh', 33.75],
      ['Husain', 33.75],
      ['Masood', 32.5],
    ])
  })

  it('marks the 7.50% path below threshold even though the owner qualifies', () => {
    const indirect = run(links).paths.find((p) => p.chain.length === 3 && p.ownerName === 'Masood')
    expect(indirect?.status).toBe('Below threshold')
  })
})

describe('CLAUDE.md case 3 — validation blocks calculation', () => {
  const links: OwnershipLinkInput[] = [
    link('1', 'Masood', 'individual', 25, 'ABC LTD'),
    link('2', 'XYZ Ltd', 'company', 75, 'ABC LTD'),
    link('3', 'Husain', 'individual', 50, 'XYZ Ltd'),
  ]

  it('reports XYZ Ltd as 50% short', () => {
    const result = validate(links)
    expect(result.ok).toBe(false)
    expect(result.errors.map((e) => e.message)).toContain(
      'XYZ Ltd: owners total 50% — 50% missing.',
    )
  })

  it('refuses to calculate while the structure is invalid', () => {
    expect(() => run(links)).toThrow(/unresolved errors/)
  })

  it('passes once the missing 50% is added back', () => {
    const fixed = [...links, link('4', 'Dinesh', 'individual', 50, 'XYZ Ltd')]
    expect(validate(fixed).ok).toBe(true)
  })
})

describe('validation rules', () => {
  it('accepts totals within the ±0.01 rounding tolerance', () => {
    const links = [
      link('1', 'A', 'individual', 33.33, 'Co'),
      link('2', 'B', 'individual', 33.33, 'Co'),
      link('3', 'C', 'individual', 33.35, 'Co'),
    ]
    expect(validate(links).ok).toBe(true)
  })

  it('reports a total that is over 100%', () => {
    const links = [
      link('1', 'A', 'individual', 60, 'Co'),
      link('2', 'B', 'individual', 50, 'Co'),
    ]
    expect(validate(links).errors.map((e) => e.message)).toContain(
      'Co: owners total 110% — 10% over.',
    )
  })

  it('rejects empty names, and percentages of 0 or over 100', () => {
    const codes = validate([
      link('1', '  ', 'individual', 50, 'Co'),
      link('2', 'A', 'individual', 0, 'Co'),
      link('3', 'B', 'individual', 120, 'Co'),
    ]).errors.map((e) => e.code)
    expect(codes).toContain('empty-owner-name')
    expect(codes.filter((c) => c === 'invalid-percent')).toHaveLength(2)
  })

  it('rejects more than 2 decimal places', () => {
    const codes = validate([link('1', 'A', 'individual', 33.333, 'Co')]).errors.map((e) => e.code)
    expect(codes).toContain('percent-precision')
  })

  it('rejects a party owning itself', () => {
    const errors = validate([link('1', 'Loop Ltd', 'company', 100, 'loop ltd')]).errors
    expect(errors.map((e) => e.code)).toContain('self-ownership')
  })

  it('rejects two rows for the same owner and entity', () => {
    const errors = validate([
      link('1', 'A', 'individual', 40, 'Co'),
      link('2', 'a', 'individual', 60, 'Co'),
    ]).errors
    expect(errors.map((e) => e.code)).toContain('duplicate-link')
  })

  it('rejects an individual being owned', () => {
    const errors = validate([
      link('1', 'Husain', 'individual', 100, 'XYZ Ltd'),
      link('2', 'XYZ Ltd', 'company', 100, 'Husain'),
    ]).errors
    expect(errors.map((e) => e.code)).toContain('individual-owned')
  })

  it('rejects the same name typed as both an individual and a company', () => {
    const errors = validate([
      link('1', 'Ambiguous', 'individual', 100, 'A Ltd'),
      link('2', 'Ambiguous', 'company', 100, 'B Ltd'),
    ]).errors
    expect(errors.map((e) => e.code)).toContain('type-conflict')
  })

  it('detects circular ownership and names the loop', () => {
    const errors = validate([
      link('1', 'A Ltd', 'company', 100, 'B Ltd'),
      link('2', 'B Ltd', 'company', 100, 'C Ltd'),
      link('3', 'C Ltd', 'company', 100, 'A Ltd'),
    ]).errors
    const cycle = errors.find((e) => e.code === 'circular-ownership')
    expect(cycle?.message).toContain('A Ltd → B Ltd → C Ltd → A Ltd')
  })

  it('warns rather than blocks above the 50-link soft cap', () => {
    const many = Array.from({ length: 51 }, (_, i) => link(`${i}`, `P${i}`, 'individual', 100, `C${i}`))
    const result = validate(many)
    expect(result.warnings).toHaveLength(1)
    expect(result.errors.some((e) => e.code === 'no-links')).toBe(false)
  })

  it('needs at least one link', () => {
    expect(validate([]).errors.map((e) => e.code)).toEqual(['no-links'])
  })
})

describe('name normalisation and de-duplication', () => {
  it('matches names case-insensitively and ignores surrounding whitespace', () => {
    const graph = buildGraph([
      link('1', '  xyz   ltd ', 'company', 100, 'ABC LTD'),
      link('2', 'Husain', 'individual', 100, 'XYZ Ltd'),
    ])
    expect(graph.nodes).toHaveLength(3)
    expect(graph.nodes.map((n) => n.name)).toContain('xyz ltd')
  })

  it('keeps a party a company even when first seen as an owner', () => {
    const graph = buildGraph([link('1', 'Holdco', 'company', 100, 'Target Ltd')])
    expect(graph.nodeByKey.get('holdco')?.type).toBe('company')
  })
})

describe('target entity detection', () => {
  it('offers every company that owns nothing when the target is ambiguous', () => {
    const graph = buildGraph([
      link('1', 'Husain', 'individual', 100, 'A Ltd'),
      link('2', 'Husain', 'individual', 100, 'B Ltd'),
    ])
    expect(graph.targetCandidates.map((n) => n.name)).toEqual(['A Ltd', 'B Ltd'])
    expect(defaultTargetKey(graph)).toBe('a ltd')
  })

  it('reports when no company owns nothing', () => {
    const codes = validate([
      link('1', 'A Ltd', 'company', 100, 'B Ltd'),
      link('2', 'B Ltd', 'company', 100, 'A Ltd'),
    ]).errors.map((e) => e.code)
    expect(codes).toContain('circular-ownership')
    expect(codes).toContain('no-target')
  })
})

describe('control-based UBOs', () => {
  it('makes a flagged person a UBO with no qualifying ownership at all', () => {
    const links = [
      link('1', 'Masood', 'individual', 90, 'ABC LTD'),
      link('2', 'Nadia', 'individual', 10, 'ABC LTD', true),
    ]
    const nadia = run(links).ubos.find((u) => u.name === 'Nadia')
    expect(nadia?.totalPercent).toBe(10)
    expect(nadia?.basis).toBe('Control')
  })

  it('uses "Ownership + Control" when the person also meets the threshold', () => {
    const links = [
      link('1', 'Masood', 'individual', 60, 'ABC LTD'),
      link('2', 'Nadia', 'individual', 40, 'ABC LTD', true),
    ]
    const nadia = run(links).ubos.find((u) => u.name === 'Nadia')
    expect(nadia?.basis).toBe('Ownership + Control')
  })

  it('includes a controller with no path to the target at 0.00%', () => {
    const links = [
      link('1', 'Masood', 'individual', 100, 'ABC LTD'),
      link('2', 'Nadia', 'individual', 100, 'Unrelated Ltd', true),
    ]
    const graph = buildGraph(links)
    const result = calculate(links, { targetKey: 'abc ltd', threshold: 25 })
    expect(graph.targetCandidates.map((n) => n.name)).toEqual(['ABC LTD', 'Unrelated Ltd'])
    const nadia = result.ubos.find((u) => u.name === 'Nadia')
    expect(nadia?.totalPercent).toBe(0)
    expect(nadia?.basis).toBe('Control')
  })

  it('ignores the controller flag on a company', () => {
    const graph = buildGraph([
      link('1', 'Holdco', 'company', 100, 'ABC LTD', true),
    ])
    expect(graph.nodeByKey.get('holdco')?.isController).toBe(false)
  })
})

describe('thresholds', () => {
  const links = [
    link('1', 'Masood', 'individual', 80, 'ABC LTD'),
    link('2', 'XYZ Ltd', 'company', 20, 'ABC LTD'),
    link('3', 'Husain', 'individual', 60, 'XYZ Ltd'),
    link('4', 'Dinesh', 'individual', 40, 'XYZ Ltd'),
  ]

  it('leaves the 12.00% and 8.00% holders out at the 25% threshold', () => {
    const result = run(links, 25)
    expect(result.ubos.map((u) => u.name)).toEqual(['Masood'])
    expect(result.intermediaries).toHaveLength(0)
  })

  it('brings Husain and XYZ Ltd in at the 10% threshold', () => {
    const result = run(links, 10)
    expect(result.ubos.map((u) => [u.name, u.totalPercent])).toEqual([
      ['Masood', 80],
      ['Husain', 12],
    ])
    expect(result.intermediaries.map((c) => [c.name, c.effectivePercent])).toEqual([
      ['XYZ Ltd', 20],
    ])
  })
})

describe('deeper structures', () => {
  it('multiplies through a four-level chain', () => {
    const links = [
      link('1', 'Husain', 'individual', 50, 'A Ltd'),
      link('2', 'Dinesh', 'individual', 50, 'A Ltd'),
      link('3', 'A Ltd', 'company', 80, 'B Ltd'),
      link('4', 'Masood', 'individual', 20, 'B Ltd'),
      link('5', 'B Ltd', 'company', 100, 'Target Ltd'),
    ]
    const result = run(links)
    expect(result.owners.map((o) => [o.name, o.totalPercent])).toEqual([
      ['Dinesh', 40],
      ['Husain', 40],
      ['Masood', 20],
    ])
    expect(result.intermediaries.map((c) => [c.name, c.effectivePercent])).toEqual([
      ['B Ltd', 100],
      ['A Ltd', 80],
    ])
  })

  it('excludes the target itself from the intermediary list', () => {
    const result = run(SAMPLE_LINKS)
    expect(result.intermediaries.some((c) => c.key === result.target.key)).toBe(false)
  })

  it('rejects an unknown target key', () => {
    expect(() => calculate(SAMPLE_LINKS, { targetKey: 'nope', threshold: 25 })).toThrow(
      /not part of this structure/,
    )
  })
})
