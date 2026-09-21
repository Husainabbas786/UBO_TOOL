import { describe, expect, it } from 'vitest'
import { buildGraph } from './normalize'
import { calculate, defaultTargetKey } from './calculate'
import { companyTotals, validate } from './validate'
import { SAMPLE_LINKS } from './sample'
import type {
  EntityKind,
  OwnershipLinkInput,
  PartyType,
  RelatedPartyLinkInput,
  RoleName,
} from './types'

let seq = 0
const id = () => `p2-${(seq += 1)}`

/** A plain commercial shareholding. */
function owns(
  ownerName: string,
  ownerType: PartyType,
  percent: number,
  entityName: string,
): OwnershipLinkInput {
  return { id: id(), ownerName, ownerType, ownerIsController: false, percent, entityName }
}

/** A role row: `ownerName` is `role` of the non-commercial `entityName`. */
function role(
  ownerName: string,
  ownerType: PartyType,
  roleName: RoleName,
  entityName: string,
  entityKind: EntityKind = 'trust',
): OwnershipLinkInput {
  return {
    id: id(),
    ownerName,
    ownerType,
    ownerIsController: false,
    percent: Number.NaN,
    entityName,
    entityKind,
    role: roleName,
  }
}

/** A shareholding held on paper by `ownerName` for `nominatorName`. */
function nominee(
  ownerName: string,
  percent: number,
  entityName: string,
  nominatorName: string,
  nominatorType: PartyType = 'individual',
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
    nominatorType,
  }
}

function related(label: string, ...memberNames: string[]): RelatedPartyLinkInput {
  return { id: id(), memberNames, label }
}

function run(
  links: OwnershipLinkInput[],
  threshold = 25,
  relatedParties: RelatedPartyLinkInput[] = [],
) {
  const graph = buildGraph(links)
  const targetKey = defaultTargetKey(graph)
  expect(targetKey).not.toBeNull()
  return calculate(links, { targetKey: targetKey as string, threshold, relatedParties })
}

const uboNames = (links: OwnershipLinkInput[], threshold = 25, rp: RelatedPartyLinkInput[] = []) =>
  run(links, threshold, rp)
    .ubos.map((u) => u.name)
    .sort()

// ---------------------------------------------------------------------------
// Feature 1 — trusts, foundations and NPOs
// ---------------------------------------------------------------------------

describe('non-commercial structures — role-based UBOs', () => {
  /** A trust holding the whole of the Meydan FZ company. */
  const trustOwnsTarget = [
    owns('XYZ Trust', 'company', 100, 'ABC LTD'),
    role('Bob Smith', 'individual', 'Settlor', 'XYZ Trust'),
    role('Aisha Khan', 'individual', 'Beneficiary', 'XYZ Trust'),
  ]

  it('makes the settlor and beneficiary of a trust that owns the target UBOs', () => {
    expect(uboNames(trustOwnsTarget)).toEqual(['Aisha Khan', 'Bob Smith'])
  })

  it('records the role as the basis, naming the trust', () => {
    const bob = run(trustOwnsTarget).ubos.find((u) => u.name === 'Bob Smith')
    expect(bob?.basis).toBe('Role')
    expect(bob?.roles).toEqual([
      {
        entityKey: 'xyz trust',
        entityName: 'XYZ Trust',
        entityKind: 'trust',
        role: 'Settlor',
        effectivePercent: 100,
      },
    ])
  })

  it('exempts a trust from the 100%-owners rule', () => {
    expect(validate(trustOwnsTarget).ok).toBe(true)
    expect(companyTotals(buildGraph(trustOwnsTarget)).map((c) => c.name)).toEqual(['ABC LTD'])
  })

  it('still holds a commercial company to exactly 100%', () => {
    const short = [owns('XYZ Trust', 'company', 60, 'ABC LTD'), ...trustOwnsTarget.slice(1)]
    const result = validate(short)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.message.includes('ABC LTD: owners total 60%'))).toBe(true)
  })

  it('never offers a trust as the Meydan FZ company', () => {
    const graph = buildGraph(trustOwnsTarget)
    expect(graph.targetCandidates.map((c) => c.name)).toEqual(['ABC LTD'])
  })

  it('does not report a trust with role-holders as an unidentified owner', () => {
    const result = run(trustOwnsTarget)
    expect(result.unidentified).toEqual([])
    expect(result.paths.map((p) => [p.ownerName, p.status])).toEqual([
      ['XYZ Trust', 'Role holders identified'],
    ])
  })

  it('still reports a trust with no role-holders entered as a gap', () => {
    const bare = [owns('XYZ Trust', 'company', 100, 'ABC LTD'), owns('Q', 'individual', 100, 'XYZ Holdings')]
    // XYZ Trust is never marked as a trust here, so it is an ordinary company
    // with no owners: exactly the existing unidentified-owner case.
    const result = run(bare.slice(0, 1))
    expect(result.unidentified.map((g) => g.name)).toEqual(['XYZ Trust'])
  })

  it('makes the role-holders of a qualifying foundation UBOs', () => {
    const links = [
      owns('Hope Foundation', 'company', 30, 'ABC LTD'),
      owns('Masood', 'individual', 70, 'ABC LTD'),
      role('Layla', 'individual', 'Founder', 'Hope Foundation', 'foundation'),
      role('Omar', 'individual', 'Council Member', 'Hope Foundation', 'foundation'),
    ]
    expect(uboNames(links)).toEqual(['Layla', 'Masood', 'Omar'])
  })

  it('does not make the role-holders of a below-threshold trust UBOs', () => {
    const links = [
      owns('XYZ Trust', 'company', 20, 'ABC LTD'),
      owns('Masood', 'individual', 80, 'ABC LTD'),
      role('Bob Smith', 'individual', 'Trustee', 'XYZ Trust'),
    ]
    expect(uboNames(links)).toEqual(['Masood'])
  })

  it('says why a below-threshold trust’s role-holder was not counted', () => {
    const links = [
      owns('XYZ Trust', 'company', 20, 'ABC LTD'),
      owns('Masood', 'individual', 80, 'ABC LTD'),
      role('Bob Smith', 'individual', 'Trustee', 'XYZ Trust'),
    ]
    expect(run(links).excludedRoleHolders).toEqual([
      {
        key: 'bob smith',
        name: 'Bob Smith',
        entities: [
          { name: 'XYZ Trust', kindLabel: 'Trust', role: 'Trustee', effectivePercent: 20 },
        ],
      },
    ])
  })

  it('counts the same trust at 10% that it refused at 25%', () => {
    const links = [
      owns('XYZ Trust', 'company', 20, 'ABC LTD'),
      owns('Masood', 'individual', 80, 'ABC LTD'),
      role('Bob Smith', 'individual', 'Trustee', 'XYZ Trust'),
    ]
    expect(uboNames(links, 10)).toEqual(['Bob Smith', 'Masood'])
  })

  it('lets a trust hold shares as an owner and still capture its roles', () => {
    const links = [
      owns('XYZ Trust', 'company', 60, 'Mid Co'),
      owns('Masood', 'individual', 40, 'Mid Co'),
      owns('Mid Co', 'company', 100, 'ABC LTD'),
      role('Bob Smith', 'individual', 'Protector', 'XYZ Trust'),
    ]
    const result = run(links)
    expect(result.ubos.map((u) => u.name).sort()).toEqual(['Bob Smith', 'Masood'])
    expect(result.intermediaries.map((c) => [c.name, c.effectivePercent])).toEqual([
      ['Mid Co', 100],
      ['XYZ Trust', 60],
    ])
  })

  it('resolves the kind per entity name, so a row typed earlier becomes a role row', () => {
    // The kind is marked on the second row only; the first must follow it.
    const links: OwnershipLinkInput[] = [
      owns('XYZ Trust', 'company', 100, 'ABC LTD'),
      { ...role('Bob Smith', 'individual', 'Settlor', 'XYZ Trust'), entityKind: undefined },
      role('Aisha Khan', 'individual', 'Beneficiary', 'XYZ Trust'),
    ]
    const graph = buildGraph(links)
    expect(graph.nodeByKey.get('xyz trust')?.entityKind).toBe('trust')
    expect(graph.links.filter((l) => l.isRole)).toHaveLength(2)
    expect(uboNames(links)).toEqual(['Aisha Khan', 'Bob Smith'])
  })

  it('allows one person to hold two roles in the same trust', () => {
    const links = [
      owns('XYZ Trust', 'company', 100, 'ABC LTD'),
      role('Bob Smith', 'individual', 'Settlor', 'XYZ Trust'),
      role('Bob Smith', 'individual', 'Beneficiary', 'XYZ Trust'),
    ]
    expect(validate(links).ok).toBe(true)
    expect(run(links).ubos.find((u) => u.name === 'Bob Smith')?.roles).toHaveLength(2)
  })

  it('rejects a repeat of the same role for the same person', () => {
    const links = [
      owns('XYZ Trust', 'company', 100, 'ABC LTD'),
      role('Bob Smith', 'individual', 'Settlor', 'XYZ Trust'),
      role('Bob Smith', 'individual', 'Settlor', 'XYZ Trust'),
    ]
    const errors = validate(links).errors
    expect(errors.some((e) => e.code === 'duplicate-link')).toBe(true)
  })

  it('blocks a role row with no role chosen', () => {
    const links: OwnershipLinkInput[] = [
      owns('XYZ Trust', 'company', 100, 'ABC LTD'),
      { ...role('Bob Smith', 'individual', 'Settlor', 'XYZ Trust'), role: null },
    ]
    const errors = validate(links).errors
    expect(errors.some((e) => e.code === 'role-required')).toBe(true)
  })

  it('rejects a role that does not belong to the kind', () => {
    const links: OwnershipLinkInput[] = [
      owns('Hope Foundation', 'company', 100, 'ABC LTD'),
      // 'Trustee' is a trust role, not a foundation role.
      { ...role('Bob Smith', 'individual', 'Trustee', 'Hope Foundation', 'foundation') },
    ]
    expect(validate(links).errors.some((e) => e.code === 'role-required')).toBe(true)
  })

  it('records a corporate trustee’s role without calling the company a UBO', () => {
    const links = [
      owns('XYZ Trust', 'company', 100, 'ABC LTD'),
      role('Fiduciary Services Ltd', 'company', 'Trustee', 'XYZ Trust'),
      role('Bob Smith', 'individual', 'Beneficiary', 'XYZ Trust'),
    ]
    expect(uboNames(links)).toEqual(['Bob Smith'])
  })

  it('reports an entity entered as two different kinds', () => {
    const links: OwnershipLinkInput[] = [
      owns('XYZ Trust', 'company', 100, 'ABC LTD'),
      role('Bob Smith', 'individual', 'Settlor', 'XYZ Trust'),
      { ...role('Aisha Khan', 'individual', 'Founder', 'XYZ Trust', 'foundation') },
    ]
    expect(validate(links).errors.some((e) => e.code === 'entity-kind-conflict')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Feature 2 — nominee shareholders
// ---------------------------------------------------------------------------

describe('nominee shareholders', () => {
  const nomineeHoldsAll = [nominee('Ali Hassan', 100, 'ABC LTD', 'Husain')]

  it('never makes the nominee a UBO, and makes the nominator one', () => {
    const result = run(nomineeHoldsAll)
    expect(result.ubos.map((u) => [u.name, u.totalPercent])).toEqual([['Husain', 100]])
    expect(result.ubos.some((u) => u.name === 'Ali Hassan')).toBe(false)
    expect(result.owners.some((o) => o.name === 'Ali Hassan')).toBe(false)
  })

  it('still counts the nominee’s shares towards the entity’s 100%', () => {
    expect(validate(nomineeHoldsAll).ok).toBe(true)
    expect(companyTotals(buildGraph(nomineeHoldsAll))).toEqual([
      { key: 'abc ltd', name: 'ABC LTD', total: 100 },
    ])

    const short = [nominee('Ali Hassan', 60, 'ABC LTD', 'Husain')]
    expect(validate(short).errors.some((e) => e.message.includes('owners total 60%'))).toBe(true)
  })

  it('aggregates a nominator’s attributed stake with shares they hold directly', () => {
    const links = [
      nominee('Ali Hassan', 20, 'ABC LTD', 'Husain'),
      owns('Husain', 'individual', 10, 'ABC LTD'),
      owns('Masood', 'individual', 70, 'ABC LTD'),
    ]
    const result = run(links)
    const husain = result.ubos.find((u) => u.name === 'Husain')
    expect(husain?.totalPercent).toBe(30)
    expect(husain?.pathCount).toBe(2)
    expect(result.ubos.map((u) => u.name).sort()).toEqual(['Husain', 'Masood'])
  })

  it('attributes a stake held through a nominee inside a chain', () => {
    const links = [
      nominee('Ali Hassan', 100, 'XYZ Ltd', 'Husain'),
      owns('XYZ Ltd', 'company', 50, 'ABC LTD'),
      owns('Masood', 'individual', 50, 'ABC LTD'),
    ]
    const result = run(links)
    expect(result.ubos.map((u) => [u.name, u.totalPercent])).toEqual([
      ['Husain', 50],
      ['Masood', 50],
    ])
  })

  it('names the nominee in the ownership path', () => {
    expect(run(nomineeHoldsAll).paths.map((p) => p.chain.join(' → '))).toEqual([
      'Husain (via nominee Ali Hassan) → ABC LTD',
    ])
  })

  it('treats the flag per shareholding, so a nominee keeps shares held in their own right', () => {
    const links = [
      nominee('Ali Hassan', 60, 'ABC LTD', 'Husain'),
      owns('Ali Hassan', 'individual', 40, 'ABC LTD'),
    ]
    const result = run(links)
    expect(result.ubos.map((u) => [u.name, u.totalPercent])).toEqual([
      ['Husain', 60],
      ['Ali Hassan', 40],
    ])
  })

  it('keeps a corporate nominator out of the Meydan FZ company dropdown', () => {
    const links = [nominee('Ali Hassan', 100, 'ABC LTD', 'XYZ Ltd', 'company')]
    const graph = buildGraph(links)
    expect(graph.targetCandidates.map((c) => c.name)).toEqual(['ABC LTD'])

    const result = run(links)
    expect(result.ubos).toEqual([])
    expect(result.unidentified.map((g) => [g.name, g.effectivePercent])).toEqual([['XYZ Ltd', 100]])
  })

  it('lets the nominee flag win over a stale controller tick on the same row', () => {
    // The two are opposite claims, and the builder never shows both boxes at
    // once. If the flags ever disagree the shares still move to the nominator.
    const links: OwnershipLinkInput[] = [
      { ...nominee('Ali Hassan', 100, 'ABC LTD', 'Husain'), ownerIsController: true },
    ]
    const graph = buildGraph(links)
    expect(graph.links[0]?.isControl).toBe(false)
    expect(graph.links[0]?.declaredController).toBe(false)
    expect(graph.nodeByKey.get('ali hassan')?.isController).toBe(false)
    expect(uboNames(links)).toEqual(['Husain'])
  })

  it('blocks a nominee row with no nominator named', () => {
    const links: OwnershipLinkInput[] = [
      { ...owns('Ali Hassan', 'individual', 100, 'ABC LTD'), ownerIsNominee: true },
    ]
    expect(validate(links).errors.some((e) => e.code === 'nominator-required')).toBe(true)
  })

  it('blocks a person nominating themselves', () => {
    const links = [nominee('Ali Hassan', 100, 'ABC LTD', 'ali hassan')]
    expect(validate(links).errors.some((e) => e.code === 'self-nomination')).toBe(true)
  })

  it('blocks a company being named as the nominator of its own shares', () => {
    const links = [nominee('Ali Hassan', 100, 'ABC LTD', 'ABC LTD', 'company')]
    expect(validate(links).errors.some((e) => e.code === 'self-nomination')).toBe(true)
  })

  it('reports a nominator entered as an individual on one row and a company on another', () => {
    const links = [
      nominee('Ali Hassan', 50, 'ABC LTD', 'Husain', 'company'),
      owns('Husain', 'individual', 50, 'ABC LTD'),
    ]
    expect(validate(links).errors.some((e) => e.code === 'type-conflict')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Feature 3 — related-party aggregation
// ---------------------------------------------------------------------------

describe('related-party aggregation', () => {
  /** Husain 20%, Layla 5%, and a majority holder who is a UBO on his own. */
  const spouses = [
    owns('Husain', 'individual', 20, 'ABC LTD'),
    owns('Layla', 'individual', 5, 'ABC LTD'),
    owns('Masood', 'individual', 75, 'ABC LTD'),
  ]

  it('leaves both spouses below the threshold when they are not linked', () => {
    expect(uboNames(spouses)).toEqual(['Masood'])
  })

  it('identifies both spouses as UBOs once they are linked', () => {
    expect(uboNames(spouses, 25, [related('Spouses', 'Husain', 'Layla')])).toEqual([
      'Husain',
      'Layla',
      'Masood',
    ])
  })

  it('sums the group and records the label for the summary line', () => {
    const result = run(spouses, 25, [related('Spouses', 'Husain', 'Layla')])
    const group = result.relatedGroups[0]
    expect(group?.label).toBe('Spouses')
    expect(group?.totalPercent).toBe(25)
    expect(group?.qualifies).toBe(true)
    expect(group?.members.map((m) => [m.name, m.effectivePercent])).toEqual([
      ['Husain', 20],
      ['Layla', 5],
    ])
  })

  it('gives a promoted member the aggregation basis and the group id', () => {
    const result = run(spouses, 25, [related('Spouses', 'Husain', 'Layla')])
    const layla = result.ubos.find((u) => u.name === 'Layla')
    expect(layla?.basis).toBe('Related-party aggregation')
    expect(layla?.relatedGroupIds).toEqual(['husain|layla'])
    expect(layla?.totalPercent).toBe(5)
    expect(layla?.pathCount).toBe(1)
  })

  it('chains links into one group: A–B and B–C is a group of three', () => {
    const family = [
      owns('A', 'individual', 10, 'ABC LTD'),
      owns('B', 'individual', 8, 'ABC LTD'),
      owns('C', 'individual', 7, 'ABC LTD'),
      owns('D', 'individual', 75, 'ABC LTD'),
    ]
    const result = run(family, 25, [related('Father & son', 'A', 'B'), related('Siblings', 'B', 'C')])
    expect(result.relatedGroups).toHaveLength(1)
    expect(result.relatedGroups[0]?.members.map((m) => m.name)).toEqual(['A', 'B', 'C'])
    expect(result.relatedGroups[0]?.totalPercent).toBe(25)
    expect(result.relatedGroups[0]?.label).toBe('Father & son / Siblings')
    expect(uboNames(family, 25, [related('Father & son', 'A', 'B'), related('Siblings', 'B', 'C')])).toEqual(
      ['A', 'B', 'C', 'D'],
    )
  })

  it('changes nothing when the parties linked are already UBOs', () => {
    const before = run(SAMPLE_LINKS).ubos.map((u) => [u.name, u.basis])
    const after = run(SAMPLE_LINKS, 25, [related('Brothers', 'Husain', 'Dinesh')]).ubos.map((u) => [
      u.name,
      u.basis,
    ])
    expect(after).toEqual(before)
  })

  it('qualifies at 10% a group that fell short at 25%', () => {
    const links = [
      owns('Husain', 'individual', 6, 'ABC LTD'),
      owns('Layla', 'individual', 5, 'ABC LTD'),
      owns('Masood', 'individual', 89, 'ABC LTD'),
    ]
    const link = [related('Spouses', 'Husain', 'Layla')]
    expect(uboNames(links, 25, link)).toEqual(['Masood'])
    expect(uboNames(links, 10, link)).toEqual(['Husain', 'Layla', 'Masood'])
  })

  it('aggregates effective stakes held through a chain, not just direct ones', () => {
    const links = [
      owns('Husain', 'individual', 40, 'XYZ Ltd'),
      owns('Masood', 'individual', 60, 'XYZ Ltd'),
      owns('XYZ Ltd', 'company', 50, 'ABC LTD'),
      owns('Layla', 'individual', 50, 'ABC LTD'),
    ]
    // Husain holds 20% through XYZ Ltd; Layla holds 50% directly and already
    // qualifies, so the group only has to lift Husain — it does not.
    const result = run(links, 25, [related('Spouses', 'Husain', 'Layla')])
    expect(result.relatedGroups[0]?.totalPercent).toBe(70)
    expect(result.ubos.map((u) => u.name).sort()).toEqual(['Husain', 'Layla', 'Masood'])
  })

  it('never removes a UBO — every structure gains members and loses none', () => {
    const structures: Array<[OwnershipLinkInput[], RelatedPartyLinkInput[]]> = [
      [SAMPLE_LINKS, [related('Brothers', 'Husain', 'Dinesh')]],
      [spouses, [related('Spouses', 'Husain', 'Layla')]],
      [
        [
          owns('XYZ Trust', 'company', 100, 'ABC LTD'),
          role('Bob Smith', 'individual', 'Settlor', 'XYZ Trust'),
          role('Aisha Khan', 'individual', 'Beneficiary', 'XYZ Trust'),
        ],
        [related('Spouses', 'Bob Smith', 'Aisha Khan')],
      ],
      [
        [
          nominee('Ali Hassan', 20, 'ABC LTD', 'Husain'),
          owns('Layla', 'individual', 10, 'ABC LTD'),
          owns('Masood', 'individual', 70, 'ABC LTD'),
        ],
        [related('Spouses', 'Husain', 'Layla')],
      ],
    ]

    for (const [links, relatedParties] of structures) {
      for (const threshold of [25, 10]) {
        const without = new Set(run(links, threshold).ubos.map((u) => u.key))
        const with_ = new Set(run(links, threshold, relatedParties).ubos.map((u) => u.key))
        for (const key of without) expect(with_.has(key)).toBe(true)
      }
    }
  })

  it('never promotes a nominee who holds nothing of their own', () => {
    const links = [
      nominee('Ali Hassan', 20, 'ABC LTD', 'Husain'),
      owns('Layla', 'individual', 10, 'ABC LTD'),
      owns('Masood', 'individual', 70, 'ABC LTD'),
    ]
    // Ali holds 20% on paper and is linked to Layla, who holds 10%. Neither the
    // sum nor the link may turn the nominee into a beneficial owner.
    const result = run(links, 25, [related('Spouses', 'Ali Hassan', 'Layla')])
    expect(result.ubos.some((u) => u.name === 'Ali Hassan')).toBe(false)
    expect(result.relatedGroups[0]?.totalPercent).toBe(10)
  })

  it('counts a company member’s stake but never labels the company a UBO', () => {
    const links = [
      owns('Husain', 'individual', 100, 'XYZ Ltd'),
      owns('XYZ Ltd', 'company', 20, 'ABC LTD'),
      owns('Layla', 'individual', 5, 'ABC LTD'),
      owns('Masood', 'individual', 75, 'ABC LTD'),
    ]
    const result = run(links, 25, [related('Sister companies', 'XYZ Ltd', 'Layla')])
    const group = result.relatedGroups[0]
    expect(group?.totalPercent).toBe(25)
    expect(group?.qualifies).toBe(true)
    expect(group?.qualifiedViaCompanyMember).toBe(true)
    /*
     * Layla is promoted; XYZ Ltd is not, because a beneficial owner is a
     * natural person. Husain, who owns XYZ Ltd, holds 20% effective and is not
     * himself a member of the group, so he is not promoted either — the known
     * limit of manual linking, which `qualifiedViaCompanyMember` flags.
     */
    expect(result.ubos.map((u) => u.name).sort()).toEqual(['Layla', 'Masood'])
  })

  it('flags a group whose members overlap on the same chain', () => {
    const links = [
      owns('Husain', 'individual', 100, 'XYZ Ltd'),
      owns('XYZ Ltd', 'company', 30, 'ABC LTD'),
      owns('Masood', 'individual', 70, 'ABC LTD'),
    ]
    const result = run(links, 25, [related('', 'XYZ Ltd', 'Husain')])
    expect(result.relatedGroups[0]?.overlaps).toBe(true)
    expect(result.relatedGroups[0]?.label).toBe('')
  })

  it('reports a link naming somebody who is not in the structure', () => {
    const issues = validate(spouses, undefined, [related('Spouses', 'Husain', 'Fatima')])
    expect(issues.ok).toBe(false)
    expect(issues.errors.some((e) => e.code === 'related-party-unknown')).toBe(true)
  })

  it('reports a link with fewer than two different parties', () => {
    const issues = validate(spouses, undefined, [related('Spouses', 'Husain', 'husain')])
    expect(issues.errors.some((e) => e.code === 'related-party-too-few')).toBe(true)
  })

  it('ignores a link nobody has filled in yet', () => {
    expect(validate(spouses, undefined, [related('', '', '')]).ok).toBe(true)
  })

  it('refuses to link the Meydan FZ company itself', () => {
    /*
     * The target holds 100% of itself, so a group containing it would clear any
     * threshold and make beneficial owners of everyone in it. Blocking it is
     * what keeps aggregation from inventing UBOs.
     */
    const result = validate(spouses, undefined, [related('Spouses', 'ABC LTD', 'Layla')], 'abc ltd')
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.code === 'related-party-target')).toBe(true)
    expect(() =>
      run(spouses, 25, [related('Spouses', 'ABC LTD', 'Layla')]),
    ).toThrow(/unresolved errors/)
  })
})

describe('the Meydan FZ company dropdown', () => {
  it('never offers a company that holds shares on paper as a nominee', () => {
    const links: OwnershipLinkInput[] = [
      {
        ...owns('Nominee Services Ltd', 'company', 60, 'ABC LTD'),
        ownerIsNominee: true,
        nominatorName: 'Husain',
        nominatorType: 'individual',
      },
      owns('Masood', 'individual', 40, 'ABC LTD'),
      owns('Bob', 'individual', 100, 'Nominee Services Ltd'),
    ]
    const graph = buildGraph(links)
    expect(graph.targetCandidates.map((c) => c.name)).toEqual(['ABC LTD'])

    // The shares are Husain's, so Bob — who owns the nominee company — holds
    // nothing of the target through it.
    const result = run(links)
    expect(result.ubos.map((u) => [u.name, u.totalPercent])).toEqual([
      ['Husain', 60],
      ['Masood', 40],
    ])
  })
})
