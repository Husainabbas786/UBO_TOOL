import { describe, expect, it } from 'vitest'
import {
  calculate,
  type CalculationResult,
  type ManagementPersonInput,
  type OwnershipLinkInput,
  type PartyType,
} from '../engine'
import { SAMPLE_LINKS } from '../engine/sample'
import {
  COUNTRY_FONT_SIZE,
  RISK_CHIP_GAP,
  layoutChart,
  riskChipWidth,
  textWidth,
  type ChartNode,
} from '../lib/chartLayout'
import { countryRiskOf, jurisdictionRisk, partiesOf, type CountryMap } from './jurisdiction'

let seq = 0
function owns(
  ownerName: string,
  ownerType: PartyType,
  percent: number,
  entityName: string,
): OwnershipLinkInput {
  seq += 1
  return { id: `j-${seq}`, ownerName, ownerType, ownerIsController: false, percent, entityName }
}

/** The structure from the feature brief: one party per tier, plus a blank. */
const LINKS: OwnershipLinkInput[] = [
  owns('Yangda Corporation', 'company', 40, 'Falcon Trading FZCO'),
  owns('Persia Holdings', 'company', 20, 'Falcon Trading FZCO'),
  owns('Ahmad Zai', 'individual', 30, 'Falcon Trading FZCO'),
  owns('Sara Ali', 'individual', 10, 'Falcon Trading FZCO'),
  owns('Li Wei', 'individual', 100, 'Yangda Corporation'),
  owns('Reza Karimi', 'individual', 100, 'Persia Holdings'),
]
const MANAGEMENT: ManagementPersonInput[] = [
  { id: 'm-1', name: 'Omar Haddad', designation: 'Director' },
]

const COUNTRIES: CountryMap = new Map([
  ['yangda corporation', 'Panama'],
  ['persia holdings', 'Iran'],
  ['ahmad zai', 'Afghanistan'],
  ['sara ali', 'United Arab Emirates'],
  ['falcon trading fzco', 'United Arab Emirates'],
  ['reza karimi', 'Iran'],
  ['omar haddad', 'Myanmar'],
  // Li Wei is left blank.
])

function run(links = LINKS, management = MANAGEMENT): CalculationResult {
  return calculate(links, { targetKey: 'falcon trading fzco', threshold: 25, management })
}

/** The chart node without anything the country line adds. */
function withoutCountry(node: ChartNode) {
  const { country: _c, countryLines: _l, risk: _r, x: _x, y: _y, height: _h, width: _w, ...rest } =
    node
  return rest
}

describe('guardrail: countries never touch the calculation', () => {
  it('the engine does not import the risk list', () => {
    const sources = import.meta.glob<string>('../engine/*.ts', {
      query: '?raw',
      import: 'default',
      eager: true,
    })
    expect(Object.keys(sources).length).toBeGreaterThan(5)
    for (const [file, source] of Object.entries(sources)) {
      expect(source, file).not.toMatch(/from\s+['"][^'"]*(risk|countr)/i)
    }
  })

  it('gives byte-identical results with and without countries', () => {
    const plain = run()
    const before = JSON.stringify(plain)

    // Everything the UI does with countries, run against the result.
    const withCountries = run()
    layoutChart(withCountries, COUNTRIES)
    jurisdictionRisk(withCountries, COUNTRIES)
    partiesOf(withCountries)

    expect(JSON.stringify(withCountries)).toBe(before)
    expect(JSON.stringify(plain)).toBe(before)
  })

  it('keeps the example at 25.00 / 37.50 / 37.50 with countries entered', () => {
    const result = calculate(SAMPLE_LINKS, { targetKey: 'abc ltd', threshold: 25 })
    const countries: CountryMap = new Map([
      ['masood', 'Iran'],
      ['husain', 'Panama'],
      ['xyz ltd', 'Afghanistan'],
      ['abc ltd', 'United Arab Emirates'],
    ])
    const before = JSON.stringify(result)
    layoutChart(result, countries)
    jurisdictionRisk(result, countries)
    expect(JSON.stringify(result)).toBe(before)
    expect(Object.fromEntries(result.ubos.map((ubo) => [ubo.name, ubo.totalPercent]))).toEqual({
      Masood: 25,
      Husain: 37.5,
      Dinesh: 37.5,
    })
  })

  it('draws the same chart apart from the country lines', () => {
    const plain = layoutChart(run())
    const dressed = layoutChart(run(), COUNTRIES)
    expect(dressed.nodes.map(withoutCountry)).toEqual(plain.nodes.map(withoutCountry))
    expect(dressed.edges.map((edge) => [edge.ownerKey, edge.entityKey, edge.label, edge.tone])).toEqual(
      plain.edges.map((edge) => [edge.ownerKey, edge.entityKey, edge.label, edge.tone]),
    )
  })
})

describe('chart country line', () => {
  const layout = layoutChart(run(), COUNTRIES)
  const node = (key: string) => layout.nodes.find((candidate) => candidate.key === key)!

  it('puts the country and rating on each party with one', () => {
    expect(node('yangda corporation')).toMatchObject({ country: 'Panama', risk: 'Medium' })
    expect(node('ahmad zai')).toMatchObject({ country: 'Afghanistan', risk: 'High' })
    expect(node('persia holdings')).toMatchObject({ country: 'Iran', risk: 'Override' })
    expect(node('sara ali')).toMatchObject({ country: 'United Arab Emirates', risk: 'Low' })
  })

  it('leaves a party with no country exactly as it was', () => {
    const plain = layoutChart(run()).nodes.find((candidate) => candidate.key === 'li wei')!
    const blank = node('li wei')
    expect(blank).toMatchObject({ country: null, countryLines: [], risk: null })
    expect([blank.width, blank.height]).toEqual([plain.width, plain.height])
  })

  it('gives management boxes a country line too', () => {
    const officer = layout.nodes.find((candidate) => candidate.isManagement)!
    expect(officer).toMatchObject({ country: 'Myanmar', risk: 'Override' })
  })

  it('wraps a long country so its chip stays inside the box', () => {
    const result = run()
    const long = layoutChart(
      result,
      new Map([['persia holdings', "North Korea - Democratic People's Republic of Korea (DPRK)"]]),
    ).nodes.find((candidate) => candidate.key === 'persia holdings')!
    expect(long.countryLines.length).toBeGreaterThan(1)
    const last = long.countryLines[long.countryLines.length - 1]!
    const chipRight =
      38 + textWidth(last, COUNTRY_FONT_SIZE) + RISK_CHIP_GAP + riskChipWidth('Override')
    expect(chipRight).toBeLessThanOrEqual(long.width)
  })
})

describe('jurisdictionRisk', () => {
  it('lists Medium and above, Override first, with type and country', () => {
    const { tiers } = jurisdictionRisk(run(), COUNTRIES)
    expect(tiers.map((tier) => tier.rating)).toEqual(['Override', 'High', 'Medium'])
    expect(tiers[0]!.parties.map((p) => `${p.name} (${p.typeLabel}) — ${p.country}`)).toEqual([
      'Persia Holdings (company) — Iran',
      'Reza Karimi (individual) — Iran',
      'Omar Haddad (individual) — Myanmar',
    ])
    expect(tiers[1]!.parties.map((p) => p.name)).toEqual(['Ahmad Zai'])
    expect(tiers[2]!.parties.map((p) => `${p.name} (${p.typeLabel}) — ${p.country}`)).toEqual([
      'Yangda Corporation (company) — Panama',
    ])
  })

  it('names the parties with no country when others have one', () => {
    expect(jurisdictionRisk(run(), COUNTRIES).missing).toEqual(['Li Wei'])
  })

  describe('the untouched UAE default on the Meydan FZ company', () => {
    const example = calculate(SAMPLE_LINKS, { targetKey: 'abc ltd', threshold: 25 })
    const defaulted: CountryMap = new Map([['abc ltd', 'United Arab Emirates']])

    it('does not trigger the footnote — Load example shows none', () => {
      expect(
        jurisdictionRisk(example, defaulted, { targetCountryIsDefault: true }).missing,
      ).toEqual([])
    })

    it('triggers it once the agent enters a country for anybody else', () => {
      const one = new Map(defaulted).set('husain', 'Panama')
      expect(
        jurisdictionRisk(example, one, { targetCountryIsDefault: true }).missing,
      ).toEqual(['Masood', 'XYZ Ltd', 'Dinesh'])
    })

    it('counts the target once the agent has moved it off the default', () => {
      const edited: CountryMap = new Map([['abc ltd', 'Panama']])
      expect(
        jurisdictionRisk(example, edited, { targetCountryIsDefault: false }).missing.sort(),
      ).toEqual(['Dinesh', 'Husain', 'Masood', 'XYZ Ltd'])
    })

    it('counts a target cleared by the agent as having no country', () => {
      const one: CountryMap = new Map([['husain', 'Panama']])
      expect(
        jurisdictionRisk(example, one, { targetCountryIsDefault: false }).missing,
      ).toContain('ABC LTD')
    })
  })

  it('says nothing when nobody has a country, or when everybody does', () => {
    expect(jurisdictionRisk(run(), new Map())).toEqual({ tiers: [], missing: [] })
    const all = new Map(COUNTRIES).set('li wei', 'China')
    expect(jurisdictionRisk(run(), all).missing).toEqual([])
  })

  it('has no block when everyone is Low', () => {
    const low: CountryMap = new Map([['sara ali', 'United Arab Emirates']])
    expect(jurisdictionRisk(run(), low).tiers).toEqual([])
  })

  it('counts a director who is also a shareholder once', () => {
    const result = run(LINKS, [{ id: 'm-2', name: 'ahmad  zai', designation: 'Director' }])
    expect(partiesOf(result).filter((party) => party.key === 'ahmad zai')).toHaveLength(1)
  })
})

describe('countryRiskOf', () => {
  it('reads blank as no country', () => {
    expect(countryRiskOf(new Map([['a', '']]), 'a')).toEqual({ country: null, risk: null })
    expect(countryRiskOf(new Map(), 'a')).toEqual({ country: null, risk: null })
  })
})
