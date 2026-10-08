import data from '../data/country-risk.json'

/**
 * Compliance's country risk list, and the lookups the UI needs from it.
 *
 * Display only. Nothing in here is read by the engine: a party's country says
 * something about the jurisdiction they sit in, never about how much they own
 * or whether they are a beneficial owner. Keep it that way — the engine must
 * not import this module.
 */

export type RiskRating = 'Low' | 'Medium' | 'High' | 'Override'

/** Highest first — the order the Summary lists them in. */
export const RISK_ORDER: readonly RiskRating[] = ['Override', 'High', 'Medium', 'Low']

export interface CountryRisk {
  country: string
  rating: RiskRating
}

interface CountryRiskFile {
  asOf: string
  sourceFile: string
  entries: Array<{ country: string; score: number; rating: string }>
}

const file = data as CountryRiskFile

/** The date the list was imported, shown on the chart and in the Summary. */
export const RISK_LIST_AS_OF: string = file.asOf

/** Every canonical country name, sorted — the only values the picker stores. */
export const COUNTRY_NAMES: readonly string[] = file.entries.map((entry) => entry.country)

/**
 * Lower case, accents stripped, whitespace (non-breaking included) collapsed.
 * "Côte  d’Ivoire" and "cote d'ivoire" compare equal.
 */
export function normaliseCountry(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

const byName = new Map<string, CountryRisk>(
  file.entries.map((entry) => [
    normaliseCountry(entry.country),
    { country: entry.country, rating: entry.rating as RiskRating },
  ]),
)

/**
 * The rating for a country, or undefined when it is not on the list (or blank).
 * Parties store the canonical name, so in practice this is an exact match; the
 * normalisation only forgives case and spacing.
 */
export function lookupRisk(countryName: string | null | undefined): CountryRisk | undefined {
  if (!countryName) return undefined
  return byName.get(normaliseCountry(countryName))
}

/**
 * Common short forms and other spellings, for type-ahead only.
 *
 * An alias is never stored: picking "UAE" stores "United Arab Emirates". Keys
 * are normalised (see normaliseCountry); values must be canonical names on the
 * list, which a test checks.
 */
export const COUNTRY_ALIASES: Readonly<Record<string, string>> = {
  uae: 'United Arab Emirates',
  emirates: 'United Arab Emirates',
  usa: 'United States',
  us: 'United States',
  'united states of america': 'United States',
  america: 'United States',
  uk: 'United Kingdom',
  gb: 'United Kingdom',
  'great britain': 'United Kingdom',
  britain: 'United Kingdom',
  dprk: "North Korea - Democratic People's Republic of Korea (DPRK)",
  'korea, north': "North Korea - Democratic People's Republic of Korea (DPRK)",
  'korea, south': 'South Korea',
  'republic of korea': 'South Korea',
  turkiye: 'Turkey',
  "cote d'ivoire": "Ivory Coast - (Cote D'Ivoire)",
  'cote divoire': "Ivory Coast - (Cote D'Ivoire)",
  'timor-leste': 'East Timor - (Timor Leste)',
  'timor leste': 'East Timor - (Timor Leste)',
  bvi: 'British Virgin Islands',
  burma: 'Myanmar',
  swaziland: 'Eswatini',
  czechia: 'Czech Republic',
  'cape verde': 'Cabo Verde',
  laos: "Lao People's Democratic Republic",
  'north macedonia': 'Macedonia - Republic of North Macedonia',
  drc: 'Democratic Republic of the Congo',
  'congo-kinshasa': 'Democratic Republic of the Congo',
  'congo-brazzaville': 'Republic of Congo (Congo - Brazzaville)',
  vatican: 'Vatican City State',
  taiwan: 'Chinese Taipei',
}

/**
 * Countries matching what has been typed, best first.
 *
 * An alias typed in full comes first ("UAE"), then names starting with the
 * text ("Pan" → Panama), then names with a word starting with it, then aliases
 * starting with it, then any name containing it ("Pan" → Japan). Every result
 * is a canonical name, each listed once. A blank query lists everything.
 */
export function searchCountries(query: string): string[] {
  const q = normaliseCountry(query)
  if (q === '') return [...COUNTRY_NAMES]

  const tiers: string[][] = [[], [], [], [], []]
  const aliasExact = COUNTRY_ALIASES[q]
  if (aliasExact) tiers[0]!.push(aliasExact)
  for (const [alias, target] of Object.entries(COUNTRY_ALIASES)) {
    if (alias !== q && alias.startsWith(q)) tiers[3]!.push(target)
  }
  for (const name of COUNTRY_NAMES) {
    const n = normaliseCountry(name)
    if (n.startsWith(q)) tiers[1]!.push(name)
    else if (n.split(/[\s(\-]+/).some((word) => word.startsWith(q))) tiers[2]!.push(name)
    else if (n.includes(q)) tiers[4]!.push(name)
  }

  return [...new Set(tiers.flat())]
}
