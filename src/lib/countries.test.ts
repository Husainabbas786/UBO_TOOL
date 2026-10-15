import { describe, expect, it } from 'vitest'
import { calculate, formatPercent, type EntityKind } from '../engine'
import {
  countryPlaceholder,
  countryRequiredMessage,
  countrySlots,
  exampleCountryEntries,
  missingCountries,
  reconcileCountries,
  resolveCountries,
  setPartyCountry,
  type CountryEntries,
} from './countries'
import {
  blankManagementRow,
  blankRoleHolder,
  blankRow,
  exampleRows,
  withOwnerKind,
  type LinkRowState,
  type ManagementRowState,
} from './rows'

const NO_KINDS = new Map<string, EntityKind>()

function row(ownerName: string, entityName = 'Falcon Trading FZCO'): LinkRowState {
  return { ...blankRow(), ownerName, entityName, percentText: '10', percent: 10 }
}

/**
 * Plays the page: every edit is followed by the reconcile the App runs, and
 * the countries shown are read back the way the App reads them.
 */
function page(rows: LinkRowState[], management: ManagementRowState[] = []) {
  let state = { rows, management, entries: new Map() as CountryEntries }
  const slots = () => countrySlots(state.rows, state.management, NO_KINDS)
  const settle = () => {
    state = { ...state, entries: reconcileCountries(slots(), state.entries) }
  }
  settle()
  return {
    setCountry(name: string, country: string) {
      state = {
        ...state,
        entries: setPartyCountry(slots(), state.entries, name.trim().toLowerCase(), country),
      }
      settle()
    },
    edit(rows: LinkRowState[], management = state.management) {
      state = { ...state, rows, management }
      settle()
    },
    get rows() {
      return state.rows
    },
    countries: () => resolveCountries(slots(), state.entries),
  }
}

describe('country per party, held per field', () => {
  it('keeps the country when a row is renamed', () => {
    const p = page([row('Yangda Corp'), row('Ahmad Zai')])
    p.setCountry('Yangda Corp', 'Panama')

    // Corrected one keystroke at a time, the way it is typed.
    let rows = p.rows
    for (const name of ['Yangda Corpo', 'Yangda Corpor', 'Yangda Corporation']) {
      rows = rows.map((r, i) => (i === 0 ? { ...r, ownerName: name } : r))
      p.edit(rows)
    }

    expect(p.countries().get('yangda corporation')).toBe('Panama')
    expect(p.countries().has('yangda corp')).toBe(false)
  })

  it('keeps two rows for the same party in step', () => {
    const p = page([row('Yangda Corp'), row('Li Wei', 'Yangda Corp')])
    p.setCountry('Yangda Corp', 'Panama')

    // A second shareholding by the same company shows the same country.
    p.edit([...p.rows, row('Yangda Corp', 'Other Ltd')])
    expect(p.countries().get('yangda corp')).toBe('Panama')

    // Changing it from either row changes it for both.
    p.setCountry('Yangda Corp', 'Iran')
    expect(p.countries().get('yangda corp')).toBe('Iran')

    // Removing the first row leaves the second still holding it…
    p.edit(p.rows.slice(1))
    expect(p.countries().get('yangda corp')).toBe('Iran')

    // …and it is the second row's own now, so it survives a rename too.
    p.edit(p.rows.map((r) => (r.ownerName === 'Yangda Corp' ? { ...r, ownerName: 'Yangda Corporation' } : r)))
    expect(p.countries().get('yangda corporation')).toBe('Iran')
  })

  it('drops the country when the last row for the party is removed', () => {
    const p = page([row('Yangda Corp'), row('Yangda Corp', 'Other Ltd'), row('Ahmad Zai')])
    p.setCountry('Yangda Corp', 'Panama')
    p.setCountry('Ahmad Zai', 'Afghanistan')

    p.edit(p.rows.slice(1))
    expect(p.countries().get('yangda corp')).toBe('Panama')
    p.edit(p.rows.slice(1))
    expect(p.countries().has('yangda corp')).toBe(false)
    expect(p.countries().get('ahmad zai')).toBe('Afghanistan')

    // Typing the name again starts from blank — the country went with the row.
    p.edit([...p.rows, row('Yangda Corp')])
    expect(p.countries().has('yangda corp')).toBe(false)
  })

  it('does not pick up another party’s country while a name is being typed', () => {
    const p = page([row('Husain'), row('')])
    p.setCountry('Husain', 'United Arab Emirates')

    let rows = p.rows
    for (const name of ['Husain', 'Husain ', 'Husain A', 'Husain Abbas']) {
      rows = rows.map((r, i) => (i === 1 ? { ...r, ownerName: name } : r))
      p.edit(rows)
    }

    expect(p.countries().get('husain')).toBe('United Arab Emirates')
    expect(p.countries().has('husain abbas')).toBe(false)
  })

  it('syncs a shareholder with the same person as a director or role-holder', () => {
    const trust = withOwnerKind({ ...row('Smith Family Trust'), ownerType: 'company' }, 'trust')
    const holder = { ...blankRoleHolder(), name: 'Ahmad Zai' }
    const kinds = new Map<string, EntityKind>([[trust.id, 'trust']])
    const rows = [{ ...trust, roleHolders: [holder] }, row('Ahmad Zai')]
    const management = [{ ...blankManagementRow(), name: 'ahmad  zai' }]

    const slots = countrySlots(rows, management, kinds)
    const entries = reconcileCountries(slots, setPartyCountry(slots, new Map(), 'ahmad zai', 'Jordan'))
    expect(slots.filter((slot) => slot.key === 'ahmad zai')).toHaveLength(3)
    expect([...entries.values()].filter((e) => e.country === 'Jordan')).toHaveLength(3)
  })

  it('keeps a deliberate clear', () => {
    const p = page([row('Yangda Corp'), row('Yangda Corp', 'Other Ltd')])
    p.setCountry('Yangda Corp', 'Panama')
    p.setCountry('Yangda Corp', '')
    expect(p.countries().has('yangda corp')).toBe(false)
  })

  it('returns the same map when nothing changed', () => {
    const rows = [row('A')]
    const slots = countrySlots(rows, [], NO_KINDS)
    const entries = reconcileCountries(slots, setPartyCountry(slots, new Map(), 'a', 'Panama'))
    expect(reconcileCountries(slots, entries)).toBe(entries)
  })
})

describe('a country is required for every party', () => {
  const TARGET = { key: 'falcon trading fzco', name: 'Falcon Trading FZCO' }
  const UAE = 'United Arab Emirates'

  /** What the App checks: entered countries, plus the target's own picker. */
  function blockers(
    rows: LinkRowState[],
    management: ManagementRowState[],
    entries: CountryEntries,
    kinds: ReadonlyMap<string, EntityKind> = NO_KINDS,
    targetCountry = UAE,
  ) {
    const slots = countrySlots(rows, management, kinds)
    const countries = resolveCountries(slots, reconcileCountries(slots, entries))
    if (targetCountry !== '') countries.set(TARGET.key, targetCountry)
    return missingCountries(slots, countries, TARGET)
  }

  /** Every named place set to the UAE, then the given parties cleared. */
  function allSetExcept(
    rows: LinkRowState[],
    management: ManagementRowState[],
    kinds: ReadonlyMap<string, EntityKind>,
    ...missing: string[]
  ): CountryEntries {
    const slots = countrySlots(rows, management, kinds)
    let entries: CountryEntries = new Map()
    for (const slot of slots) {
      if (slot.key !== '' && !missing.includes(slot.key)) {
        entries = setPartyCountry(slots, entries, slot.key, UAE)
      }
    }
    return entries
  }

  it('blocks on a shareholder with no country, naming the row, party and field', () => {
    const rows = [
      { ...row('XYZ Ltd'), ownerType: 'company' as const },
      row('Husain'),
      row('Dinesh'),
    ]
    expect(blockers(rows, [], allSetExcept(rows, [], NO_KINDS, 'husain'))).toEqual([
      "Row 2: select Husain's nationality.",
    ])
    expect(blockers(rows, [], allSetExcept(rows, [], NO_KINDS, 'xyz ltd'))).toEqual([
      "Row 1: select XYZ Ltd's country of incorporation.",
    ])
  })

  it('blocks on a nominator with no country', () => {
    const nominee: LinkRowState = {
      ...row('Gulf Nominees Ltd'),
      ownerType: 'company',
      ownerIsNominee: true,
      nominatorName: 'Cedar Holdings',
      nominatorType: 'company',
    }
    const rows = [row('Masood'), nominee]
    expect(blockers(rows, [], allSetExcept(rows, [], NO_KINDS, 'cedar holdings'))).toEqual([
      "Nominator on row 2: select Cedar Holdings's country of incorporation.",
    ])
  })

  it('blocks on a person behind a trust with no country', () => {
    const trust = withOwnerKind({ ...row('Smith Family Trust'), ownerType: 'company' }, 'trust')
    const rows = [{ ...trust, roleHolders: [{ ...blankRoleHolder(), name: 'Ahmad Zai' }] }]
    const kinds = new Map<string, EntityKind>([[trust.id, 'trust']])
    expect(blockers(rows, [], allSetExcept(rows, [], kinds, 'ahmad zai'), kinds)).toEqual([
      "Person 1 on row 1: select Ahmad Zai's nationality.",
    ])
  })

  it('blocks on a management entry with no country', () => {
    const rows = [row('Masood')]
    const management = [
      { ...blankManagementRow(), name: 'Althaf' },
      { ...blankManagementRow(), name: 'Shafeer' },
    ]
    expect(
      blockers(rows, management, allSetExcept(rows, management, NO_KINDS, 'shafeer')),
    ).toEqual(["Management 2: select Shafeer's nationality."])
  })

  it("blocks once the Meydan FZ company's UAE default is cleared", () => {
    const rows = [row('Masood')]
    const entries = allSetExcept(rows, [], NO_KINDS)
    expect(blockers(rows, [], entries)).toEqual([])
    expect(blockers(rows, [], entries, NO_KINDS, '')).toEqual([
      "Meydan FZ company: select Falcon Trading FZCO's country of incorporation.",
    ])
  })

  it('unblocks once every party has a country', () => {
    const rows = [row('Masood'), row('Husain')]
    const management = [{ ...blankManagementRow(), name: 'Shafeer' }]
    expect(blockers(rows, management, new Map())).toHaveLength(3)
    expect(blockers(rows, management, allSetExcept(rows, management, NO_KINDS))).toEqual([])
  })

  it('takes one entry for a party named on two rows, and names them once', () => {
    const rows = [row('Husain'), row('Husain', 'XYZ Ltd')]
    expect(blockers(rows, [], new Map())).toEqual(["Row 1: select Husain's nationality."])

    const p = page(rows)
    p.setCountry('Husain', 'India')
    const slots = countrySlots(rows, [], NO_KINDS)
    expect(
      missingCountries(slots, new Map(p.countries()).set(TARGET.key, UAE), TARGET),
    ).toEqual([])
  })

  it('counts a deliberate clear as no country', () => {
    const p = page([row('Husain')])
    p.setCountry('Husain', 'India')
    p.setCountry('Husain', '')
    const slots = countrySlots(p.rows, [], NO_KINDS)
    expect(missingCountries(slots, p.countries(), null)).toEqual([
      "Row 1: select Husain's nationality.",
    ])
  })

  it('leaves an unnamed field to the row’s own errors', () => {
    const management = [blankManagementRow()]
    expect(blockers([blankRow()], management, new Map())).toEqual([])
  })

  it('asks for the right field, marked as required', () => {
    expect(countryPlaceholder('individual')).toBe('Nationality *')
    expect(countryPlaceholder('company')).toBe('Country of incorporation *')
    expect(countryRequiredMessage('individual')).toBe('Select a nationality.')
    expect(countryRequiredMessage('company')).toBe('Select the country of incorporation.')
  })
})

describe('Load example', () => {
  it('arrives with a country for every party and calculates the same figures', () => {
    const rows = exampleRows()
    const entries = exampleCountryEntries(rows, 'United Arab Emirates')
    const slots = countrySlots(rows, [], NO_KINDS)
    const countries = resolveCountries(slots, reconcileCountries(slots, entries))
    expect([...countries.keys()].sort()).toEqual(['dinesh', 'husain', 'masood', 'xyz ltd'])
    countries.set('abc ltd', 'United Arab Emirates')
    expect(missingCountries(slots, countries, { key: 'abc ltd', name: 'ABC LTD' })).toEqual([])

    const result = calculate(rows, { targetKey: 'abc ltd', threshold: 25 })
    expect(
      result.ubos.map((ubo) => `${ubo.name} ${formatPercent(ubo.totalPercent)}`).sort(),
    ).toEqual(['Dinesh 37.50', 'Husain 37.50', 'Masood 25.00'])
    expect(result.entityCount).toBe(5)
    expect(result.pathCount).toBe(3)
  })
})
