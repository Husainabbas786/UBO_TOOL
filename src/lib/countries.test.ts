import { describe, expect, it } from 'vitest'
import type { EntityKind } from '../engine'
import {
  countrySlots,
  reconcileCountries,
  resolveCountries,
  setPartyCountry,
  type CountryEntries,
} from './countries'
import {
  blankManagementRow,
  blankRoleHolder,
  blankRow,
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
