import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { IntermediariesTable } from '../components/results/IntermediariesTable'
import { OwnershipChart } from '../components/results/OwnershipChart'
import { SummaryBlock } from '../components/results/SummaryBlock'
import {
  buildGraph,
  calculate,
  validate,
  type ManagementPersonInput,
  type OwnershipLinkInput,
  type PartyType,
} from '../engine'
import { layoutChart } from '../lib/chartLayout'
import {
  blacklistWarning,
  COUNTRY_NAMES,
  displayRisk,
  lookupRisk,
  resolveRisk,
} from './countryRisk'
import { blacklistedParties, jurisdictionRisk, type CountryMap } from './jurisdiction'

const DPRK = "North Korea - Democratic People's Republic of Korea (DPRK)"

describe('Override tier, shown by party type (Compliance, 8 Oct 2026)', () => {
  it.each([
    ['Iran', 'individual', 'High'],
    ['Iran', 'company', 'Blacklisted'],
    ['Myanmar', 'individual', 'High'],
    ['Myanmar', 'company', 'Blacklisted'],
    [DPRK, 'individual', 'Blacklisted'],
    [DPRK, 'company', 'Blacklisted'],
    ['Panama', 'individual', 'Medium'],
    ['Panama', 'company', 'Medium'],
    ['Afghanistan', 'company', 'High'],
    ['United Arab Emirates', 'individual', 'Low'],
  ] as const)('%s, %s -> %s', (country, type, expected) => {
    expect(resolveRisk(country, type)).toBe(expected)
  })

  it('falls back to company Blacklisted, individual High for an Override country with no rule', () => {
    expect(displayRisk('Override', 'Atlantis', 'company')).toBe('Blacklisted')
    expect(displayRisk('Override', 'Atlantis', 'individual')).toBe('High')
  })

  it('never displays "Override" for any country or party type', () => {
    for (const country of COUNTRY_NAMES) {
      for (const type of ['individual', 'company'] as const) {
        expect(resolveRisk(country, type)).not.toBe('Override')
      }
    }
    // The source list itself is untouched.
    expect(lookupRisk('Iran')?.rating).toBe('Override')
  })

  it('is unknown for blank or unlisted countries', () => {
    expect(resolveRisk('', 'company')).toBeUndefined()
    expect(resolveRisk('Atlantis', 'individual')).toBeUndefined()
  })
})

describe('blacklistWarning', () => {
  it('warns on a company incorporated in a blacklisted jurisdiction', () => {
    expect(blacklistWarning('Iran', 'company')).toBe(
      'Blacklisted jurisdiction: a company incorporated in Iran cannot be onboarded as a shareholder or subsidiary of a Meydan FZ company.',
    )
    expect(blacklistWarning(DPRK, 'company')).toContain('incorporated in North Korea cannot')
  })

  it('warns on a North Korean national', () => {
    expect(blacklistWarning(DPRK, 'individual')).toBe(
      'Blacklisted nationality: North Korean nationals cannot be onboarded.',
    )
  })

  it('says nothing for Iranian or Myanmar nationals, or anyone else', () => {
    expect(blacklistWarning('Iran', 'individual')).toBeNull()
    expect(blacklistWarning('Myanmar', 'individual')).toBeNull()
    expect(blacklistWarning('Panama', 'company')).toBeNull()
    expect(blacklistWarning('', 'company')).toBeNull()
  })
})

let seq = 0
function owns(
  ownerName: string,
  ownerType: PartyType,
  percent: number,
  entityName: string,
  extra: Partial<OwnershipLinkInput> = {},
): OwnershipLinkInput {
  seq += 1
  return {
    id: `b-${seq}`,
    ownerName,
    ownerType,
    ownerIsController: false,
    percent,
    entityName,
    ...extra,
  }
}

/** The structure from the brief, plus a trust incorporated in Iran. */
const LINKS: OwnershipLinkInput[] = [
  owns('Reza Karimi', 'individual', 20, 'Falcon Trading FZCO'),
  owns('Persia Holdings', 'company', 20, 'Falcon Trading FZCO'),
  owns('Kim Jong', 'individual', 20, 'Falcon Trading FZCO'),
  owns('Yangon Ventures', 'company', 20, 'Falcon Trading FZCO'),
  owns('Tehran Family Trust', 'company', 20, 'Falcon Trading FZCO', {
    ownerKind: 'trust',
    roleHolders: [{ id: 'h-1', name: 'Sara Ali', type: 'individual', role: 'Settlor', isUbo: true }],
  }),
  owns('Ali Rezaei', 'individual', 100, 'Persia Holdings'),
  owns('Aung San', 'individual', 100, 'Yangon Ventures'),
]
const MANAGEMENT: ManagementPersonInput[] = [
  { id: 'm-1', name: 'Min Thu', designation: 'Director' },
]
const COUNTRIES: CountryMap = new Map([
  ['reza karimi', 'Iran'],
  ['persia holdings', 'Iran'],
  ['kim jong', DPRK],
  ['yangon ventures', 'Myanmar'],
  ['tehran family trust', 'Iran'],
  ['ali rezaei', 'Iran'],
  ['aung san', 'Panama'],
  ['min thu', 'Myanmar'],
  ['falcon trading fzco', 'United Arab Emirates'],
])

const run = () =>
  calculate(LINKS, { targetKey: 'falcon trading fzco', threshold: 25, management: MANAGEMENT })

describe('blacklisted parties', () => {
  it('lists exactly the blacklisted parties, with why', () => {
    expect(blacklistedParties(run(), COUNTRIES).map((p) => `${p.name} (${p.description})`)).toEqual(
      [
        'Persia Holdings (company, incorporated in Iran)',
        'Kim Jong (individual, North Korean national)',
        'Yangon Ventures (company, incorporated in Myanmar)',
        'Tehran Family Trust (trust, incorporated in Iran)',
      ],
    )
  })

  it('treats a trust incorporated in Iran as Blacklisted', () => {
    const node = layoutChart(run(), COUNTRIES).nodes.find((n) => n.key === 'tehran family trust')!
    expect(node.risk).toBe('Blacklisted')
  })

  it('orders the Jurisdiction risk block Blacklisted, High, Medium', () => {
    expect(jurisdictionRisk(run(), COUNTRIES).tiers.map((tier) => tier.rating)).toEqual([
      'Blacklisted',
      'High',
      'Medium',
    ])
  })

  it('never blocks Calculate and never changes the calculation', () => {
    const validation = validate(LINKS, buildGraph(LINKS), [], 'falcon trading fzco')
    expect(validation.ok).toBe(true)

    const result = run()
    const before = JSON.stringify(result)
    layoutChart(result, COUNTRIES)
    jurisdictionRisk(result, COUNTRIES)
    blacklistedParties(result, COUNTRIES)
    renderToStaticMarkup(<SummaryBlock result={result} countries={COUNTRIES} targetCountryIsDefault />)
    expect(JSON.stringify(result)).toBe(before)
    expect(before).toBe(JSON.stringify(run()))
  })
})

describe('what reaches the screen', () => {
  const result = run()
  const summary = renderToStaticMarkup(
    <SummaryBlock result={result} countries={COUNTRIES} targetCountryIsDefault />,
  )
  const screening = renderToStaticMarkup(
    <IntermediariesTable result={result} countries={COUNTRIES} />,
  )
  const chart = renderToStaticMarkup(<OwnershipChart result={result} countries={COUNTRIES} />)

  it('puts the blacklist banner first in the Summary, listing exactly those parties', () => {
    const banner = summary.indexOf('Blacklisted parties — onboarding not permitted')
    expect(banner).toBeGreaterThanOrEqual(0)
    expect(banner).toBeLessThan(summary.indexOf('beneficial owner'))
    const bannerHtml = summary.slice(banner, summary.indexOf('</ul>', banner))
    for (const name of ['Persia Holdings', 'Kim Jong', 'Yangon Ventures', 'Tehran Family Trust']) {
      expect(bannerHtml).toContain(name)
    }
    for (const name of ['Reza Karimi', 'Ali Rezaei', 'Min Thu', 'Aung San']) {
      expect(bannerHtml).not.toContain(name)
    }
  })

  it('has no banner, and no chart note, when nobody is blacklisted', () => {
    const clean: CountryMap = new Map([['reza karimi', 'Iran']])
    expect(
      renderToStaticMarkup(<SummaryBlock result={result} countries={clean} targetCountryIsDefault />),
    ).not.toContain('Blacklisted parties')
    expect(renderToStaticMarkup(<OwnershipChart result={result} countries={clean} />)).not.toContain(
      'Contains blacklisted parties',
    )
  })

  it('notes blacklisted parties in the chart legend, in literal hex', () => {
    expect(chart).toContain('Blacklisted — onboarding not permitted')
    expect(chart).toMatch(/color:#A4161A[^>]*>Contains blacklisted parties — onboarding not permitted\./)
  })

  it('shows the Blacklisted chip in the screening table', () => {
    expect(screening).toContain('>Blacklisted<')
  })

  it('never shows the word "Override"', () => {
    for (const html of [summary, screening, chart]) expect(html).not.toMatch(/override/i)
  })

  it('has no "Override" in any component source or the README', () => {
    const sources = import.meta.glob<string>(['../components/**/*.tsx', '../../README.md'], {
      query: '?raw',
      import: 'default',
      eager: true,
    })
    expect(Object.keys(sources).some((file) => file.endsWith('README.md'))).toBe(true)
    for (const [file, source] of Object.entries(sources)) {
      // The README may name the spreadsheet's tier when it explains how it is shown.
      const text = file.endsWith('README.md')
        ? source.replace(/[Tt]he spreadsheet's \*\*Override\*\* tier/g, '')
        : source
      expect(text, file).not.toMatch(/Override/)
    }
  })
})
