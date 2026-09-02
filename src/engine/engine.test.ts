import { describe, expect, it } from 'vitest'
import { buildGraph, controlLinks } from './normalize'
import { calculate, defaultTargetKey } from './calculate'
import { companyTotals, validate } from './validate'
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
      'XYZ Ltd: owners total 50%, 50% missing',
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
      'Co: owners total 110%, 10% over',
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
    expect(result.warnings[0]?.code).toBe('too-many-links')
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

describe('aggregation never duplicates an owner', () => {
  it('merges an owner reached by several paths into one entry', () => {
    const links = [
      link('1', 'Masood', 'individual', 25, 'ABC LTD'),
      link('2', 'XYZ Ltd', 'company', 75, 'ABC LTD'),
      link('3', 'Husain', 'individual', 45, 'XYZ Ltd'),
      link('4', 'Dinesh', 'individual', 45, 'XYZ Ltd'),
      link('5', 'Masood', 'individual', 10, 'XYZ Ltd'),
    ]
    const result = run(links)
    const keys = result.ubos.map((u) => u.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(result.ubos.filter((u) => u.key === 'masood')).toHaveLength(1)
    expect(result.owners.map((o) => o.key)).toEqual([...new Set(result.owners.map((o) => o.key))])
    // Masood reaches the target twice but appears once, with both paths summed.
    expect(result.paths.filter((p) => p.ownerKey === 'masood')).toHaveLength(2)
  })

  it('does not re-add a controller who is already an ultimate owner', () => {
    const links = [
      link('1', 'Nadia', 'individual', 50, 'ABC LTD', true),
      link('2', 'XYZ Ltd', 'company', 50, 'ABC LTD'),
      link('3', 'Nadia', 'individual', 100, 'XYZ Ltd', true),
    ]
    const result = run(links)
    expect(result.ubos.filter((u) => u.key === 'nadia')).toHaveLength(1)
    expect(result.ubos[0]?.totalPercent).toBe(100)
    expect(result.ubos[0]?.basis).toBe('Ownership + Control')
  })
})

describe('control without ownership (0% controller rows)', () => {
  it('accepts 0% only when the Controller box is ticked', () => {
    const flagged = validate([
      link('1', 'Masood', 'individual', 100, 'ABC LTD'),
      link('2', 'Nadia', 'individual', 0, 'ABC LTD', true),
    ])
    expect(flagged.ok).toBe(true)

    const unflagged = validate([
      link('1', 'Masood', 'individual', 100, 'ABC LTD'),
      link('2', 'Nadia', 'individual', 0, 'ABC LTD', false),
    ])
    expect(unflagged.errors.map((e) => e.code)).toContain('invalid-percent')
  })

  it('does not let a control row disturb the company 100% total', () => {
    const links = [
      link('1', 'Masood', 'individual', 100, 'ABC LTD'),
      link('2', 'Nadia', 'individual', 0, 'ABC LTD', true),
    ]
    const totals = companyTotals(buildGraph(links))
    expect(totals).toEqual([{ key: 'abc ltd', name: 'ABC LTD', total: 100 }])
    expect(validate(links).ok).toBe(true)
  })

  it('flags the 0% controller as a UBO with basis Control', () => {
    const links = [
      link('1', 'Masood', 'individual', 100, 'ABC LTD'),
      link('2', 'Nadia', 'individual', 0, 'ABC LTD', true),
    ]
    const result = run(links)
    const nadia = result.ubos.find((u) => u.name === 'Nadia')
    expect(nadia?.totalPercent).toBe(0)
    expect(nadia?.basis).toBe('Control')
    expect(result.ubos.map((u) => [u.name, u.basis])).toEqual([
      ['Masood', 'Ownership'],
      ['Nadia', 'Control'],
    ])
  })

  it('keeps the control link out of ownership paths and shares', () => {
    const links = [
      link('1', 'Masood', 'individual', 100, 'ABC LTD'),
      link('2', 'Nadia', 'individual', 0, 'ABC LTD', true),
    ]
    const result = run(links)
    expect(result.paths.map((p) => p.ownerName)).toEqual(['Masood'])
    expect(controlLinks(result.graph)).toHaveLength(1)
    expect(controlLinks(result.graph)[0]?.ownerKey).toBe('nadia')
  })

  it('still lets a company with only a control row be the target', () => {
    const graph = buildGraph([link('1', 'Nadia', 'individual', 0, 'ABC LTD', true)])
    expect(graph.targetCandidates.map((n) => n.name)).toEqual(['ABC LTD'])
    expect(validate([link('1', 'Nadia', 'individual', 0, 'ABC LTD', true)]).ok).toBe(true)
  })
})

describe('unidentified beneficial owner gaps', () => {
  it('flags a qualifying stake held by a company with no owners entered', () => {
    const links = [
      link('1', 'Masood', 'individual', 25, 'ABC LTD'),
      link('2', 'XYZ Ltd', 'company', 75, 'ABC LTD'),
    ]
    const result = run(links)
    expect(result.unidentified).toEqual([
      { key: 'xyz ltd', name: 'XYZ Ltd', effectivePercent: 75 },
    ])
  })

  it('clears the flag once that company has owners', () => {
    expect(run(SAMPLE_LINKS).unidentified).toEqual([])
  })

  it('ignores a company below the threshold', () => {
    const links = [
      link('1', 'Masood', 'individual', 90, 'ABC LTD'),
      link('2', 'XYZ Ltd', 'company', 10, 'ABC LTD'),
    ]
    expect(run(links, 25).unidentified).toEqual([])
    expect(run(links, 10).unidentified.map((g) => g.name)).toEqual(['XYZ Ltd'])
  })

  it('never flags the target itself', () => {
    const result = run(SAMPLE_LINKS)
    expect(result.unidentified.some((g) => g.key === result.target.key)).toBe(false)
  })
})

describe('a company is never labelled UBO', () => {
  const links = [
    link('1', 'Masood', 'individual', 25, 'ABC LTD'),
    link('2', 'XYZ Ltd', 'company', 75, 'ABC LTD'),
  ]

  it('gives a company terminal owner the status "No owners entered"', () => {
    const xyz = run(links).paths.find((p) => p.ownerName === 'XYZ Ltd')
    expect(xyz?.effectivePercent).toBe(75)
    expect(xyz?.status).toBe('No owners entered')
    expect(xyz?.status).not.toBe('UBO')
  })

  it('leaves individuals on UBO / Below threshold', () => {
    const statuses = run(links).paths.map((p) => [p.ownerName, p.status])
    expect(statuses).toEqual([
      ['XYZ Ltd', 'No owners entered'],
      ['Masood', 'UBO'],
    ])
    const below = run(links, 10).paths.find((p) => p.ownerName === 'Masood')
    expect(below?.status).toBe('UBO')
  })

  it('never emits "UBO" for a company anywhere in the result', () => {
    const result = run(links)
    const companyPaths = result.paths.filter((p) => p.ownerType === 'company')
    expect(companyPaths.length).toBeGreaterThan(0)
    expect(companyPaths.every((p) => p.status === 'No owners entered')).toBe(true)
    expect(result.ubos.every((u) => u.type === 'individual')).toBe(true)
  })
})

describe('0% controllers, the way a first-time user enters them', () => {
  it('accepts a 0% controller of the target company', () => {
    const links = [
      link('1', 'Masood', 'individual', 100, 'ABC LTD'),
      link('2', 'Dinesh', 'individual', 0, 'ABC LTD', true),
    ]
    expect(validate(links).ok).toBe(true)
    const dinesh = run(links).ubos.find((u) => u.name === 'Dinesh')
    expect(dinesh?.basis).toBe('Control')
    expect(dinesh?.totalPercent).toBe(0)
    expect(dinesh?.controls).toEqual(['ABC LTD'])
  })

  it('accepts a controller whose percentage was never typed at all', () => {
    // Tick-then-type: the box goes on while the percent field is still empty.
    const blank = { ...link('2', 'Dinesh', 'individual', 0, 'ABC LTD', true), percent: Number.NaN }
    const links = [link('1', 'Masood', 'individual', 100, 'ABC LTD'), blank]
    expect(validate(links).ok).toBe(true)
    expect(buildGraph(links).links[1]?.percent).toBe(0)
    expect(run(links).ubos.find((u) => u.name === 'Dinesh')?.basis).toBe('Control')
  })

  it('points an unticked 0% row at the checkbox', () => {
    const links = [
      link('1', 'Masood', 'individual', 100, 'ABC LTD'),
      link('2', 'Dinesh', 'individual', 0, 'ABC LTD', false),
    ]
    const issue = validate(links).errors.find((e) => e.code === 'invalid-percent')
    expect(issue?.message).toBe(
      'Enter a percentage above 0, or tick Controller if this person has control (e.g. voting rights) without ownership.',
    )
    expect(issue?.linkId).toBe('2')
  })

  it('keeps a 0% control row out of the company total', () => {
    const links = [
      link('1', 'Masood', 'individual', 100, 'ABC LTD'),
      link('2', 'Dinesh', 'individual', 0, 'ABC LTD', true),
    ]
    expect(companyTotals(buildGraph(links))).toEqual([
      { key: 'abc ltd', name: 'ABC LTD', total: 100 },
    ])
  })

  it('handles a 0% controller who also owns shares elsewhere', () => {
    const links = [
      link('1', 'Masood', 'individual', 40, 'ABC LTD'),
      link('2', 'XYZ Ltd', 'company', 60, 'ABC LTD'),
      link('3', 'Dinesh', 'individual', 100, 'XYZ Ltd', true),
      link('4', 'Dinesh', 'individual', 0, 'ABC LTD', true),
    ]
    const result = run(links)
    const dinesh = result.ubos.filter((u) => u.name === 'Dinesh')
    expect(dinesh).toHaveLength(1)
    // 100% of XYZ Ltd, which holds 60% of the target.
    expect(dinesh[0]?.totalPercent).toBe(60)
    expect(dinesh[0]?.basis).toBe('Ownership + Control')
    // The dedicated control row wins over the synced tick on the XYZ row.
    expect(dinesh[0]?.controls).toEqual(['ABC LTD'])
  })

  it('handles a controller who also holds a small stake', () => {
    const links = [
      link('1', 'Masood', 'individual', 97, 'ABC LTD'),
      link('2', 'Dinesh', 'individual', 3, 'ABC LTD', true),
    ]
    const dinesh = run(links).ubos.find((u) => u.name === 'Dinesh')
    expect(dinesh?.totalPercent).toBe(3)
    expect(dinesh?.basis).toBe('Control')
    expect(dinesh?.controls).toEqual(['ABC LTD'])
  })

  it('allows two controllers on one company', () => {
    const links = [
      link('1', 'Masood', 'individual', 100, 'ABC LTD'),
      link('2', 'Dinesh', 'individual', 0, 'ABC LTD', true),
      link('3', 'Layla', 'individual', 0, 'ABC LTD', true),
    ]
    expect(validate(links).ok).toBe(true)
    const result = run(links)
    expect(result.ubos.map((u) => [u.name, u.basis])).toEqual([
      ['Masood', 'Ownership'],
      ['Dinesh', 'Control'],
      ['Layla', 'Control'],
    ])
  })

  it('treats a controller of an intermediary as a UBO of the target', () => {
    // The meeting's open question: ABC is the target, XYZ holds 30%, and
    // Masood controls XYZ without owning it.
    const links = [
      link('1', 'Husain', 'individual', 70, 'ABC LTD'),
      link('2', 'XYZ Ltd', 'company', 30, 'ABC LTD'),
      link('3', 'Sara', 'individual', 100, 'XYZ Ltd'),
      link('4', 'Masood', 'individual', 0, 'XYZ Ltd', true),
    ]
    expect(validate(links).ok).toBe(true)
    const result = run(links)
    const masood = result.ubos.find((u) => u.name === 'Masood')
    expect(masood?.basis).toBe('Control')
    expect(masood?.totalPercent).toBe(0)
    expect(masood?.controls).toEqual(['XYZ Ltd'])
    // XYZ Ltd holds 30%, so it is above the threshold and gets screened.
    expect(result.intermediaries.map((c) => c.name)).toEqual(['XYZ Ltd'])
  })
})
