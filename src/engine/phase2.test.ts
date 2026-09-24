import { describe, expect, it } from 'vitest'
import { buildGraph } from './normalize'
import { calculate, defaultTargetKey } from './calculate'
import { companyTotals, validate } from './validate'
import { SAMPLE_LINKS } from './sample'
import type {
  EntityKind,
  ManagementPersonInput,
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

/** One party behind a structure: a name, a role, and how it was recorded. */
interface Holder {
  name: string
  role: RoleName | null
  ubo?: boolean
  type?: PartyType
}

/**
 * A role-holder the agent marked as a beneficial owner, having read the
 * constitutional document. Only a marked role-holder can ever qualify.
 */
const ubo = (name: string, role: RoleName | null): Holder => ({ name, role, ubo: true })

/** A role-holder recorded on the file but not marked — captured, never counted. */
const recorded = (name: string, role: RoleName | null): Holder => ({ name, role })

/**
 * A company holding a role. It can never be a beneficial owner itself, so it
 * carries no tick: its own ownership is entered as ordinary rows and the
 * engine drills through it to the people.
 */
const corporate = (name: string, role: RoleName): Holder => ({ name, role, type: 'company' })

/**
 * A trust, foundation or NPO shareholder: it holds `percent` of `entityName`
 * like any other shareholder, and the people behind it are entered inline on
 * the same row, with roles instead of percentages.
 */
function trust(
  ownerName: string,
  percent: number,
  entityName: string,
  holders: Holder[],
  ownerKind: EntityKind = 'trust',
): OwnershipLinkInput {
  return {
    id: id(),
    ownerName,
    ownerType: 'company',
    ownerIsController: false,
    percent,
    entityName,
    ownerKind,
    roleHolders: holders.map((holder) => ({
      id: id(),
      name: holder.name,
      role: holder.role,
      type: holder.type,
      isUbo: holder.ubo,
    })),
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
  management: ManagementPersonInput[] = [],
) {
  const graph = buildGraph(links)
  const targetKey = defaultTargetKey(graph)
  expect(targetKey).not.toBeNull()
  return calculate(links, {
    targetKey: targetKey as string,
    threshold,
    relatedParties,
    management,
  })
}

/** One management row, the way the builder hands it over. */
function officer(name: string, designation: ManagementPersonInput['designation']) {
  return { id: id(), name, designation }
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
    trust('XYZ Trust', 100, 'ABC LTD', [ubo('Bob Smith', 'Settlor'), ubo('Aisha Khan', 'Beneficiary')]),
  ]

  it('makes the settlor and beneficiary marked as UBOs beneficial owners', () => {
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

  /*
   * The change Compliance asked for, and the one that matters most: holding a
   * role is not being a beneficial owner. The constitutional document decides,
   * the agent reads it and ticks, and the tool reports what was ticked.
   */
  it('does not make a role-holder a UBO until the agent marks them one', () => {
    const links = [
      trust(
        'Hope Foundation',
        100,
        'ABC LTD',
        [recorded('Layla', 'Council Member'), recorded('Omar', 'Council Member')],
        'foundation',
      ),
    ]
    expect(run(links).ubos).toEqual([])
  })

  it('counts only the council member who was marked, not the others', () => {
    const links = [
      trust(
        'Hope Foundation',
        100,
        'ABC LTD',
        [
          recorded('Layla', 'Council Member'),
          ubo('Omar', 'Council Member'),
          recorded('Sara', 'Beneficiary'),
        ],
        'foundation',
      ),
    ]
    expect(uboNames(links)).toEqual(['Omar'])
  })

  it('keeps the unmarked role-holders on the file, with their roles', () => {
    const links = [
      trust(
        'Hope Foundation',
        100,
        'ABC LTD',
        [recorded('Layla', 'Council Member'), ubo('Omar', 'Founder')],
        'foundation',
      ),
    ]
    expect(run(links).recordedRoleHolders).toEqual([
      {
        key: 'layla',
        name: 'Layla',
        entities: [{ name: 'Hope Foundation', kindLabel: 'Foundation', role: 'Council Member' }],
      },
    ])
  })

  it('applies the tick to every role, settlor and beneficiary alike', () => {
    const links = [
      trust('XYZ Trust', 100, 'ABC LTD', [
        recorded('Bob Smith', 'Settlor'),
        recorded('Aisha Khan', 'Beneficiary'),
        recorded('Dana', 'Trustee'),
        recorded('Eli', 'Protector'),
      ]),
    ]
    expect(run(links).ubos).toEqual([])
    expect(run(links).recordedRoleHolders.map((r) => r.name)).toEqual([
      'Aisha Khan',
      'Bob Smith',
      'Dana',
      'Eli',
    ])
  })

  it('leaves a plain commercial shareholder on automatic percentages', () => {
    // No tick anywhere: the ordinary structure is untouched by the change.
    expect(uboNames(SAMPLE_LINKS)).toEqual(['Dinesh', 'Husain', 'Masood'])
  })

  it('exempts a trust from the 100%-owners rule', () => {
    expect(validate(trustOwnsTarget).ok).toBe(true)
    expect(companyTotals(buildGraph(trustOwnsTarget)).map((c) => c.name)).toEqual(['ABC LTD'])
  })

  it('still counts the trust’s own stake towards the company it holds', () => {
    const links = [
      trust('XYZ Trust', 60, 'ABC LTD', [ubo('Bob Smith', 'Settlor')]),
      owns('Masood', 'individual', 40, 'ABC LTD'),
    ]
    expect(validate(links).ok).toBe(true)
    expect(companyTotals(buildGraph(links))).toEqual([
      { key: 'abc ltd', name: 'ABC LTD', total: 100 },
    ])
  })

  it('still holds a commercial company to exactly 100%', () => {
    const short = [trust('XYZ Trust', 60, 'ABC LTD', [ubo('Bob Smith', 'Settlor')])]
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

  it('still reports a trust with nobody entered behind it as a gap', () => {
    const result = run([trust('XYZ Trust', 100, 'ABC LTD', [])])
    expect(result.unidentified.map((g) => g.name)).toEqual(['XYZ Trust'])
    expect(result.ubos).toEqual([])
  })

  it('makes the marked role-holders of a qualifying foundation UBOs', () => {
    const links = [
      trust(
        'Hope Foundation',
        30,
        'ABC LTD',
        [ubo('Layla', 'Founder'), ubo('Omar', 'Council Member')],
        'foundation',
      ),
      owns('Masood', 'individual', 70, 'ABC LTD'),
    ]
    expect(uboNames(links)).toEqual(['Layla', 'Masood', 'Omar'])
  })

  it('does not make the role-holders of a below-threshold trust UBOs', () => {
    const links = [
      trust('XYZ Trust', 20, 'ABC LTD', [ubo('Bob Smith', 'Trustee')]),
      owns('Masood', 'individual', 80, 'ABC LTD'),
    ]
    expect(uboNames(links)).toEqual(['Masood'])
  })

  it('says why a below-threshold trust’s marked role-holder was not counted', () => {
    const links = [
      trust('XYZ Trust', 20, 'ABC LTD', [ubo('Bob Smith', 'Trustee')]),
      owns('Masood', 'individual', 80, 'ABC LTD'),
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

  it('keeps the two reasons apart: not marked is not the same as below threshold', () => {
    const links = [
      trust('XYZ Trust', 20, 'ABC LTD', [ubo('Bob Smith', 'Trustee'), recorded('Dana', 'Settlor')]),
      owns('Masood', 'individual', 80, 'ABC LTD'),
    ]
    const result = run(links)
    expect(result.excludedRoleHolders.map((e) => e.name)).toEqual(['Bob Smith'])
    expect(result.recordedRoleHolders.map((e) => e.name)).toEqual(['Dana'])
  })

  it('counts the same trust at 10% that it refused at 25%', () => {
    const links = [
      trust('XYZ Trust', 20, 'ABC LTD', [ubo('Bob Smith', 'Trustee')]),
      owns('Masood', 'individual', 80, 'ABC LTD'),
    ]
    expect(uboNames(links, 10)).toEqual(['Bob Smith', 'Masood'])
  })

  it('carries a trust’s roles down through an intermediary company', () => {
    const links = [
      trust('XYZ Trust', 60, 'Mid Co', [ubo('Bob Smith', 'Protector')]),
      owns('Masood', 'individual', 40, 'Mid Co'),
      owns('Mid Co', 'company', 100, 'ABC LTD'),
    ]
    const result = run(links)
    expect(result.ubos.map((u) => u.name).sort()).toEqual(['Bob Smith', 'Masood'])
    expect(result.intermediaries.map((c) => [c.name, c.effectivePercent])).toEqual([
      ['Mid Co', 100],
      ['XYZ Trust', 60],
    ])
  })

  it('resolves the kind per shareholder name, so another row naming it follows', () => {
    // The trust holds stakes in two companies; only the first row says what it
    // is, and the second must be read as the same trust all the same.
    const links: OwnershipLinkInput[] = [
      trust('XYZ Trust', 60, 'Mid Co', [ubo('Bob Smith', 'Settlor')]),
      owns('Masood', 'individual', 40, 'Mid Co'),
      { ...owns('XYZ Trust', 'company', 30, 'ABC LTD'), ownerKind: undefined },
      owns('Mid Co', 'company', 70, 'ABC LTD'),
    ]
    const graph = buildGraph(links)
    expect(graph.nodeByKey.get('xyz trust')?.entityKind).toBe('trust')
    expect(validate(links).ok).toBe(true)
    // 60% of 70% plus 30% = 72%, so the trust clears the threshold either way.
    expect(uboNames(links)).toEqual(['Bob Smith', 'Masood'])
  })

  it('counts a role once when the same people are held on two of the trust’s rows', () => {
    const holders: Holder[] = [ubo('Bob Smith', 'Settlor')]
    const links = [
      trust('XYZ Trust', 60, 'Mid Co', holders),
      owns('Masood', 'individual', 40, 'Mid Co'),
      trust('XYZ Trust', 30, 'ABC LTD', holders),
      owns('Mid Co', 'company', 70, 'ABC LTD'),
    ]
    expect(validate(links).ok).toBe(true)
    expect(buildGraph(links).links.filter((l) => l.isRole)).toHaveLength(1)
    expect(run(links).ubos.find((u) => u.name === 'Bob Smith')?.roles).toHaveLength(1)
  })

  it('keeps the tick when only one of the trust’s rows carries it', () => {
    // The builder syncs the panel across rows, but a merge must never lose a
    // decision the agent made — so any row marking them is enough.
    const links = [
      trust('XYZ Trust', 60, 'Mid Co', [recorded('Bob Smith', 'Settlor')]),
      owns('Masood', 'individual', 40, 'Mid Co'),
      trust('XYZ Trust', 30, 'ABC LTD', [ubo('Bob Smith', 'Settlor')]),
      owns('Mid Co', 'company', 70, 'ABC LTD'),
    ]
    expect(uboNames(links)).toEqual(['Bob Smith', 'Masood'])
  })

  it('allows one person to hold two roles in the same trust', () => {
    const links = [
      trust('XYZ Trust', 100, 'ABC LTD', [
        ubo('Bob Smith', 'Settlor'),
        ubo('Bob Smith', 'Beneficiary'),
      ]),
    ]
    expect(validate(links).ok).toBe(true)
    expect(run(links).ubos.find((u) => u.name === 'Bob Smith')?.roles).toHaveLength(2)
  })

  it('rejects a repeat of the same role for the same person', () => {
    const links = [
      trust('XYZ Trust', 100, 'ABC LTD', [
        ubo('Bob Smith', 'Settlor'),
        ubo('Bob Smith', 'Settlor'),
      ]),
    ]
    expect(validate(links).errors.some((e) => e.code === 'duplicate-link')).toBe(true)
  })

  it('blocks a role-holder with no role chosen', () => {
    const links = [trust('XYZ Trust', 100, 'ABC LTD', [ubo('Bob Smith', null)])]
    expect(validate(links).errors.some((e) => e.code === 'role-required')).toBe(true)
  })

  it('blocks a role chosen with nobody named', () => {
    const links = [trust('XYZ Trust', 100, 'ABC LTD', [ubo('', 'Settlor')])]
    expect(validate(links).errors.some((e) => e.code === 'role-holder-name-required')).toBe(true)
  })

  it('ignores an untouched blank role-holder line', () => {
    const links = [
      trust('XYZ Trust', 100, 'ABC LTD', [ubo('Bob Smith', 'Settlor'), recorded('', null)]),
    ]
    expect(validate(links).ok).toBe(true)
    expect(uboNames(links)).toEqual(['Bob Smith'])
  })

  it('rejects a role that does not belong to the kind', () => {
    // 'Trustee' is a trust role, not a foundation role.
    const links = [
      trust('Hope Foundation', 100, 'ABC LTD', [ubo('Bob Smith', 'Trustee')], 'foundation'),
    ]
    expect(validate(links).errors.some((e) => e.code === 'role-required')).toBe(true)
  })

  it('blocks a person holding a role in themselves', () => {
    const links = [trust('XYZ Trust', 100, 'ABC LTD', [ubo('xyz trust', 'Settlor')])]
    expect(validate(links).errors.some((e) => e.code === 'self-ownership')).toBe(true)
  })

  it('blocks a percentage entered into a trust, and says where its people go', () => {
    // The mistake the old entity-side dropdown invited: typing the trust on the
    // "% of" side. A trust has no shares, so this row cannot mean anything.
    const links = [
      trust('XYZ Trust', 100, 'ABC LTD', [ubo('Bob Smith', 'Settlor')]),
      owns('Aisha Khan', 'individual', 100, 'XYZ Trust'),
    ]
    const errors = validate(links).errors
    expect(errors.some((e) => e.code === 'non-commercial-owned')).toBe(true)
    expect(errors.find((e) => e.code === 'non-commercial-owned')?.message).toContain(
      'role-holders on its own shareholder row',
    )
  })

  it('reports a shareholder entered as two different kinds', () => {
    const links: OwnershipLinkInput[] = [
      trust('XYZ Trust', 60, 'ABC LTD', [ubo('Bob Smith', 'Settlor')]),
      trust('XYZ Trust', 40, 'Mid Co', [ubo('Aisha Khan', 'Founder')], 'foundation'),
      owns('Mid Co', 'company', 40, 'ABC LTD'),
    ]
    expect(validate(links).errors.some((e) => e.code === 'owner-kind-conflict')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Feature 1b — a company holding a role, drilled through to the people
// ---------------------------------------------------------------------------

describe('a company holding a role in a trust', () => {
  /** A corporate trustee, owned outright by one person. */
  const corporateTrustee = [
    trust('XYZ Trust', 100, 'ABC LTD', [corporate('Fiduciary Services Ltd', 'Trustee')]),
    owns('Layla', 'individual', 100, 'Fiduciary Services Ltd'),
  ]

  it('never makes the company itself a beneficial owner', () => {
    expect(run(corporateTrustee).ubos.some((u) => u.name === 'Fiduciary Services Ltd')).toBe(false)
  })

  it('drills through it to the natural person behind it', () => {
    expect(uboNames(corporateTrustee)).toEqual(['Layla'])
  })

  it('names the company the role runs through, and the stake in it', () => {
    const layla = run(corporateTrustee).ubos.find((u) => u.name === 'Layla')
    expect(layla?.basis).toBe('Role')
    expect(layla?.roles).toEqual([
      {
        entityKey: 'xyz trust',
        entityName: 'XYZ Trust',
        entityKind: 'trust',
        role: 'Trustee',
        effectivePercent: 100,
        via: { key: 'fiduciary services ltd', name: 'Fiduciary Services Ltd', percentOfHolder: 100 },
      },
    ])
  })

  it('needs no tick for a company: ownership decides who is behind it', () => {
    // The corporate role-holder carries no UBO toggle in the builder, and the
    // people found beneath it qualify on their shareholding as usual.
    expect(buildGraph(corporateTrustee).links.some((l) => l.isRole && l.roleMarkedUbo)).toBe(false)
    expect(uboNames(corporateTrustee)).toEqual(['Layla'])
  })

  it('drills two levels deep, company inside company', () => {
    const links = [
      trust('XYZ Trust', 100, 'ABC LTD', [corporate('Fiduciary Services Ltd', 'Trustee')]),
      owns('Holdco Ltd', 'company', 100, 'Fiduciary Services Ltd'),
      owns('Layla', 'individual', 100, 'Holdco Ltd'),
    ]
    const result = run(links)
    expect(result.ubos.map((u) => u.name)).toEqual(['Layla'])
    expect(result.ubos[0]?.roles[0]?.via?.name).toBe('Fiduciary Services Ltd')
  })

  it('leaves out an owner of the company who falls below the threshold', () => {
    const links = [
      trust('XYZ Trust', 100, 'ABC LTD', [corporate('Fiduciary Services Ltd', 'Trustee')]),
      owns('Layla', 'individual', 90, 'Fiduciary Services Ltd'),
      owns('Tariq', 'individual', 10, 'Fiduciary Services Ltd'),
    ]
    expect(uboNames(links)).toEqual(['Layla'])
    expect(uboNames(links, 10)).toEqual(['Layla', 'Tariq'])
  })

  it('still applies the trust’s own threshold gate', () => {
    const links = [
      trust('XYZ Trust', 20, 'ABC LTD', [corporate('Fiduciary Services Ltd', 'Trustee')]),
      owns('Masood', 'individual', 80, 'ABC LTD'),
      owns('Layla', 'individual', 100, 'Fiduciary Services Ltd'),
    ]
    expect(uboNames(links)).toEqual(['Masood'])
    expect(uboNames(links, 10)).toEqual(['Layla', 'Masood'])
  })

  it('works for a beneficiary as well as a trustee', () => {
    const links = [
      trust('XYZ Trust', 100, 'ABC LTD', [
        corporate('Beneficiary Holdings Ltd', 'Beneficiary'),
        ubo('Bob Smith', 'Settlor'),
      ]),
      owns('Nadia', 'individual', 100, 'Beneficiary Holdings Ltd'),
    ]
    expect(uboNames(links)).toEqual(['Bob Smith', 'Nadia'])
  })

  it('reports a corporate role-holder with nobody entered behind it as a gap', () => {
    const links = [trust('XYZ Trust', 100, 'ABC LTD', [corporate('Fiduciary Services Ltd', 'Trustee')])]
    const result = run(links)
    expect(result.ubos).toEqual([])
    expect(result.unidentified.map((g) => g.name)).toEqual(['Fiduciary Services Ltd'])
  })

  it('holds a corporate role-holder to the 100% rule once owners are entered', () => {
    const links = [
      trust('XYZ Trust', 100, 'ABC LTD', [corporate('Fiduciary Services Ltd', 'Trustee')]),
      owns('Layla', 'individual', 60, 'Fiduciary Services Ltd'),
    ]
    expect(validate(links).errors.some((e) => e.message.includes('Fiduciary Services Ltd'))).toBe(
      true,
    )
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

  /*
   * The arrangement is a reported fact in its own right, not just an input to
   * the ownership maths: the register says one name and the beneficial owner
   * is another, and a file that shows only the conclusion has lost that.
   */
  it('reports the arrangement itself, while the nominator stays the UBO', () => {
    const result = run(nomineeHoldsAll)
    expect(result.nominees).toEqual([
      {
        nomineeKey: 'ali hassan',
        nomineeName: 'Ali Hassan',
        entityKey: 'abc ltd',
        entityName: 'ABC LTD',
        nominatorKey: 'husain',
        nominatorName: 'Husain',
        percent: 100,
      },
    ])
    expect(result.ubos.map((u) => u.name)).toEqual(['Husain'])
  })

  it('reports every arrangement when there is more than one', () => {
    const links = [
      nominee('Ali Hassan', 40, 'ABC LTD', 'Husain'),
      nominee('Sara Noor', 35, 'ABC LTD', 'Layla'),
      owns('Masood', 'individual', 25, 'ABC LTD'),
    ]
    const result = run(links)
    expect(result.nominees.map((n) => [n.nomineeName, n.entityName, n.nominatorName])).toEqual([
      ['Ali Hassan', 'ABC LTD', 'Husain'],
      ['Sara Noor', 'ABC LTD', 'Layla'],
    ])
    expect(result.ubos.map((u) => u.name).sort()).toEqual(['Husain', 'Layla', 'Masood'])
  })

  it('reports nothing for a structure with no nominee in it', () => {
    expect(run(SAMPLE_LINKS).nominees).toEqual([])
  })

  it('reports the nominee parcel without touching the shares they own outright', () => {
    const links = [
      nominee('Ali Hassan', 60, 'ABC LTD', 'Husain'),
      owns('Ali Hassan', 'individual', 40, 'ABC LTD'),
    ]
    const result = run(links)
    expect(result.nominees.map((n) => [n.nomineeName, n.percent])).toEqual([['Ali Hassan', 60]])
    expect(result.ubos.map((u) => [u.name, u.totalPercent])).toEqual([
      ['Husain', 60],
      ['Ali Hassan', 40],
    ])
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

  it('marks a group-qualified member’s path as captured, not merely below', () => {
    /*
     * The summary calls Layla a UBO; her own 5% does not reach the threshold.
     * The paths table has to say both, or the two blocks contradict each other
     * on the same page.
     */
    const result = run(spouses, 25, [related('Spouses', 'Husain', 'Layla')])
    const statusOf = (name: string) => result.paths.find((p) => p.ownerName === name)?.status

    expect(statusOf('Layla')).toBe('Below threshold (UBO via group)')
    expect(statusOf('Husain')).toBe('Below threshold (UBO via group)')
    // Masood clears the threshold on his own stake, so his path is unchanged.
    expect(statusOf('Masood')).toBe('UBO')

    // Without the link the same two paths are plainly below the threshold.
    const unlinked = run(spouses)
    expect(unlinked.paths.find((p) => p.ownerName === 'Layla')?.status).toBe('Below threshold')
    expect(unlinked.paths.find((p) => p.ownerName === 'Husain')?.status).toBe('Below threshold')
  })

  it('leaves a below-threshold non-member reading plainly below', () => {
    const links = [
      owns('Husain', 'individual', 20, 'ABC LTD'),
      owns('Layla', 'individual', 5, 'ABC LTD'),
      owns('Omar', 'individual', 5, 'ABC LTD'),
      owns('Masood', 'individual', 70, 'ABC LTD'),
    ]
    const result = run(links, 25, [related('Spouses', 'Husain', 'Layla')])
    expect(result.paths.find((p) => p.ownerName === 'Omar')?.status).toBe('Below threshold')
    expect(result.ubos.map((u) => u.name).sort()).toEqual(['Husain', 'Layla', 'Masood'])
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
          trust('XYZ Trust', 100, 'ABC LTD', [
            ubo('Bob Smith', 'Settlor'),
            ubo('Aisha Khan', 'Beneficiary'),
          ]),
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

// ---------------------------------------------------------------------------
// Feature 4 — the Meydan FZ company's own management
// ---------------------------------------------------------------------------

describe('management of the Meydan FZ company', () => {
  const board: ManagementPersonInput[] = [
    officer('Jane Doe', 'Director'),
    officer('John Roe', 'Manager'),
  ]

  it('reports the officers entered, with their designations', () => {
    expect(run(SAMPLE_LINKS, 25, [], board).management).toEqual([
      { key: 'jane doe', name: 'Jane Doe', designation: 'Director' },
      { key: 'john roe', name: 'John Roe', designation: 'Manager' },
    ])
  })

  it('never puts an officer in the UBO list', () => {
    const result = run(SAMPLE_LINKS, 25, [], board)
    expect(result.ubos.map((u) => u.name).sort()).toEqual(['Dinesh', 'Husain', 'Masood'])
    expect(result.owners.some((o) => o.name === 'Jane Doe')).toBe(false)
    expect(result.paths.some((p) => p.chain.includes('Jane Doe'))).toBe(false)
  })

  it('changes nothing else about the result', () => {
    const without = run(SAMPLE_LINKS)
    const with_ = run(SAMPLE_LINKS, 25, [], board)
    expect(with_.ubos).toEqual(without.ubos)
    expect(with_.paths).toEqual(without.paths)
    expect(with_.intermediaries).toEqual(without.intermediaries)
    expect(with_.entityCount).toBe(without.entityCount)
    expect(with_.pathCount).toBe(without.pathCount)
  })

  it('leaves every company’s 100% total alone', () => {
    // An officer's name never becomes a party, so no company gains an owner.
    const totalsWith = companyTotals(buildGraph(SAMPLE_LINKS))
    expect(run(SAMPLE_LINKS, 25, [], board).graph.nodes.map((n) => n.name)).toEqual(
      buildGraph(SAMPLE_LINKS).nodes.map((n) => n.name),
    )
    expect(totalsWith.every((company) => company.total === 100)).toBe(true)
    expect(validate(SAMPLE_LINKS).ok).toBe(true)
  })

  it('records a shareholder who is also a director in both places, once each', () => {
    const result = run(SAMPLE_LINKS, 25, [], [officer('Masood', 'Director')])
    expect(result.management).toEqual([
      { key: 'masood', name: 'Masood', designation: 'Director' },
    ])
    expect(result.ubos.filter((u) => u.name === 'Masood')).toHaveLength(1)
    expect(result.ubos.find((u) => u.name === 'Masood')?.totalPercent).toBe(25)
  })

  it('keeps one person who holds two offices, and drops an exact repeat', () => {
    const entries = [
      officer('Jane Doe', 'Director'),
      officer('Jane Doe', 'Manager'),
      officer('jane doe', 'Director'),
    ]
    expect(run(SAMPLE_LINKS, 25, [], entries).management).toEqual([
      { key: 'jane doe', name: 'Jane Doe', designation: 'Director' },
      { key: 'jane doe', name: 'Jane Doe', designation: 'Manager' },
    ])
  })

  it('ignores a row with nobody named', () => {
    const entries = [officer('   ', 'Director'), officer('Jane Doe', 'Authorized Person')]
    expect(run(SAMPLE_LINKS, 25, [], entries).management).toEqual([
      { key: 'jane doe', name: 'Jane Doe', designation: 'Authorized Person' },
    ])
  })

  it('reports none when none were entered', () => {
    expect(run(SAMPLE_LINKS).management).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Feature 5 — screening covers every party, whatever they hold
// ---------------------------------------------------------------------------

describe('parties for screening', () => {
  it('lists a shareholder far below the threshold', () => {
    const links = [
      owns('Tariq', 'individual', 1, 'ABC LTD'),
      owns('Masood', 'individual', 99, 'ABC LTD'),
    ]
    const result = run(links)
    expect(result.screening.map((p) => [p.name, p.effectivePercent])).toEqual([
      ['Masood', 99],
      ['Tariq', 1],
    ])
    // Screening scope and UBO identification are separate questions.
    expect(result.ubos.map((u) => u.name)).toEqual(['Masood'])
  })

  it('lists individuals as well as companies', () => {
    const result = run(SAMPLE_LINKS)
    expect(result.screening.map((p) => `${p.name} (${p.type})`).sort()).toEqual([
      'Dinesh (individual)',
      'Husain (individual)',
      'Masood (individual)',
      'XYZ Ltd (company)',
    ])
  })

  it('lists both a nominee and the nominator behind them', () => {
    const links = [
      nominee('Ali Hassan', 40, 'ABC LTD', 'Husain'),
      owns('Masood', 'individual', 60, 'ABC LTD'),
    ]
    const names = run(links).screening.map((p) => p.name)
    expect(names).toContain('Ali Hassan')
    expect(names).toContain('Husain')
    // The nominee holds nothing beneficially, and is screened all the same.
    expect(run(links).screening.find((p) => p.name === 'Ali Hassan')?.effectivePercent).toBe(0)
  })

  it('lists a role-holder who was recorded and not marked a UBO', () => {
    const links = [
      trust(
        'Hope Foundation',
        100,
        'ABC LTD',
        [recorded('Layla', 'Council Member'), ubo('Omar', 'Founder')],
        'foundation',
      ),
    ]
    const result = run(links)
    expect(result.screening.map((p) => p.name).sort()).toEqual([
      'Hope Foundation',
      'Layla',
      'Omar',
    ])
    expect(result.ubos.map((u) => u.name)).toEqual(['Omar'])
  })

  it('lists a flagged controller who holds no shares', () => {
    const links = [
      owns('Masood', 'individual', 100, 'ABC LTD'),
      { ...owns('Nadia', 'individual', 0, 'ABC LTD'), ownerIsController: true },
    ]
    expect(run(links).screening.map((p) => p.name).sort()).toEqual(['Masood', 'Nadia'])
  })

  it('never lists the Meydan FZ company itself', () => {
    expect(run(SAMPLE_LINKS).screening.some((p) => p.name === 'ABC LTD')).toBe(false)
  })

  it('leaves the intermediary list to its own, threshold-based rule', () => {
    const links = [
      owns('Small Holdings', 'company', 1, 'ABC LTD'),
      owns('Masood', 'individual', 99, 'ABC LTD'),
      owns('Tariq', 'individual', 100, 'Small Holdings'),
    ]
    const result = run(links)
    expect(result.intermediaries.map((c) => c.name)).toEqual([])
    expect(result.screening.map((p) => p.name)).toContain('Small Holdings')
  })
})
