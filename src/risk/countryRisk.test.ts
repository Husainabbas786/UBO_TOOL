import { describe, expect, it } from 'vitest'
import data from '../data/country-risk.json'
import {
  COUNTRY_ALIASES,
  COUNTRY_NAMES,
  RISK_LIST_AS_OF,
  lookupRisk,
  normaliseCountry,
  searchCountries,
} from './countryRisk'

describe('country-risk.json', () => {
  it('loads with an as-of date, a source and entries', () => {
    expect(data.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(RISK_LIST_AS_OF).toBe(data.asOf)
    expect(data.sourceFile).toBe('data/country-risk.xlsx')
    expect(data.entries.length).toBeGreaterThan(200)
    expect(COUNTRY_NAMES).toHaveLength(data.entries.length)
  })

  it('has exactly the four tiers', () => {
    const tiers = new Set(data.entries.map((entry) => entry.rating))
    expect([...tiers].sort()).toEqual(['High', 'Low', 'Medium', 'Override'])
  })

  it('rates the known countries, with the rating column winning over the score', () => {
    expect(lookupRisk('United Arab Emirates')?.rating).toBe('Low')
    expect(lookupRisk('Iran')?.rating).toBe('Override')
    expect(lookupRisk('Myanmar')?.rating).toBe('Override')
    // Score 30 in the spreadsheet, rating Medium: the rating is the truth.
    expect(lookupRisk('Turkey')?.rating).toBe('Medium')
    // Listed twice in the source, once as Low: Compliance confirmed Medium.
    expect(lookupRisk('Eswatini')?.rating).toBe('Medium')
  })

  it('has no duplicate names', () => {
    const keys = data.entries.map((entry) => normaliseCountry(entry.country))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('has no non-breaking or untidy spaces in any name', () => {
    for (const entry of data.entries) {
      expect(entry.country).not.toMatch(/ /)
      expect(entry.country).toBe(entry.country.trim())
      expect(entry.country).not.toMatch(/\s{2,}/)
    }
    expect(lookupRisk('Cayman Islands')?.country).toBe('Cayman Islands')
  })

  it('is sorted by country', () => {
    const sorted = [...COUNTRY_NAMES].sort((a, b) => a.localeCompare(b, 'en'))
    expect(COUNTRY_NAMES).toEqual(sorted)
  })
})

describe('lookupRisk', () => {
  it('matches case-insensitively with whitespace normalised', () => {
    expect(lookupRisk('  united   ARAB emirates ')?.country).toBe('United Arab Emirates')
    expect(lookupRisk('cayman islands')?.rating).toBe('Medium')
  })

  it('returns undefined for blank or unknown input', () => {
    expect(lookupRisk('')).toBeUndefined()
    expect(lookupRisk(null)).toBeUndefined()
    expect(lookupRisk(undefined)).toBeUndefined()
    expect(lookupRisk('Atlantis')).toBeUndefined()
  })

  it('does not resolve aliases — parties store canonical names', () => {
    expect(lookupRisk('UAE')).toBeUndefined()
  })
})

describe('normaliseCountry', () => {
  it('strips accents, curly quotes and extra spaces', () => {
    expect(normaliseCountry('  Côte  d’Ivoire ')).toBe("cote d'ivoire")
    expect(normaliseCountry('Türkiye')).toBe('turkiye')
  })
})

describe('searchCountries', () => {
  it('lists every country for a blank query', () => {
    expect(searchCountries('  ')).toEqual([...COUNTRY_NAMES])
  })

  it('resolves aliases to canonical names, first', () => {
    expect(searchCountries('UAE')[0]).toBe('United Arab Emirates')
    expect(searchCountries('usa')[0]).toBe('United States')
    expect(searchCountries('US')[0]).toBe('United States')
    expect(searchCountries('UK')[0]).toBe('United Kingdom')
    expect(searchCountries('DPRK')[0]).toBe(
      "North Korea - Democratic People's Republic of Korea (DPRK)",
    )
    expect(searchCountries('Türkiye')[0]).toBe('Turkey')
    expect(searchCountries('Turkiye')[0]).toBe('Turkey')
    expect(searchCountries("Côte d'Ivoire")[0]).toBe("Ivory Coast - (Cote D'Ivoire)")
    expect(searchCountries('Timor-Leste')[0]).toBe('East Timor - (Timor Leste)')
    expect(searchCountries('BVI')[0]).toBe('British Virgin Islands')
  })

  it('ranks a prefix above a substring', () => {
    const results = searchCountries('Pan')
    expect(results[0]).toBe('Panama')
    expect(results).toContain('Japan')
    expect(results.indexOf('Panama')).toBeLessThan(results.indexOf('Japan'))
  })

  it('matches anywhere in the name', () => {
    expect(searchCountries('cayman')).toEqual(['Cayman Islands'])
    expect(searchCountries('emirates')).toContain('United Arab Emirates')
  })

  it('only ever returns canonical names, each once', () => {
    for (const query of ['u', 'kor', 'congo', 'is', 'uae']) {
      const results = searchCountries(query)
      expect(new Set(results).size).toBe(results.length)
      for (const name of results) expect(COUNTRY_NAMES).toContain(name)
    }
  })

  it('points every alias at a country on the list', () => {
    for (const [alias, target] of Object.entries(COUNTRY_ALIASES)) {
      expect(normaliseCountry(alias)).toBe(alias)
      expect(lookupRisk(target)?.country, `${alias} -> ${target}`).toBe(target)
    }
  })
})
