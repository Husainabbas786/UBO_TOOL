import data from '../data/country-risk.json'
import overrides from '../data/override-rules.json'
import type { PartyType } from '../engine'

/**
 * Compliance's country risk list, and the lookups the UI needs from it.
 *
 * Display only. Nothing in here is read by the engine: a party's country says
 * something about the jurisdiction they sit in, never about how much they own
 * or whether they are a beneficial owner. Keep it that way — the engine must
 * not import this module.
 */

/** The tier as Compliance's spreadsheet gives it. Never shown as such. */
export type RiskRating = 'Low' | 'Medium' | 'High' | 'Override'

/**
 * The rating shown on screen. The spreadsheet's Override tier does not appear:
 * it is turned into High or Blacklisted by party type (see resolveRisk).
 * Blacklisted means the party cannot be onboarded.
 */
export type DisplayRisk = 'Low' | 'Medium' | 'High' | 'Blacklisted'

/** Highest first — the order the Summary lists them in. */
export const RISK_ORDER: readonly DisplayRisk[] = ['Blacklisted', 'High', 'Medium', 'Low']

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

interface OverrideRule {
  individual: DisplayRisk
  company: DisplayRisk
  /** Short name for messages, e.g. "North Korea". Defaults to the list name. */
  shortName?: string
  /** For "North Korean nationals". Defaults to "nationals of <country>". */
  demonym?: string
}

const overrideRules = new Map<string, OverrideRule>(
  Object.entries((overrides as { rules: Record<string, OverrideRule> }).rules).map(
    ([country, rule]) => [normaliseCountry(country), rule],
  ),
)

/**
 * What an Override-tier country with no rule shows. A company incorporated
 * there cannot be onboarded; a national is treated as high risk. The importer
 * warns about any such country so Compliance can be asked.
 */
export const DEFAULT_OVERRIDE_RULE: Readonly<OverrideRule> = {
  individual: 'High',
  company: 'Blacklisted',
}

function overrideRule(country: string): OverrideRule {
  return overrideRules.get(normaliseCountry(country)) ?? DEFAULT_OVERRIDE_RULE
}

/**
 * The rating to display for a party with this country.
 *
 * The same as the list for every tier but Override, which Compliance has
 * asked to be shown by party type (8 Oct 2026): nationality for a person,
 * incorporation for a company, trust, foundation or NPO. The rules live in
 * src/data/override-rules.json so they can be changed without code.
 */
export function resolveRisk(
  countryName: string | null | undefined,
  partyType: PartyType,
): DisplayRisk | undefined {
  const found = lookupRisk(countryName)
  if (!found) return undefined
  return displayRisk(found.rating, found.country, partyType)
}

/** The list's tier as displayed for one party type; see resolveRisk. */
export function displayRisk(rating: RiskRating, country: string, partyType: PartyType): DisplayRisk {
  if (rating !== 'Override') return rating
  return overrideRule(country)[partyType]
}

/**
 * The "cannot onboard" warning for a party, or null when they may be onboarded.
 * Shown under the field the moment the country is picked.
 */
export function blacklistWarning(
  countryName: string | null | undefined,
  partyType: PartyType,
): string | null {
  if (resolveRisk(countryName, partyType) !== 'Blacklisted') return null
  const country = lookupRisk(countryName)!.country
  const rule = overrideRule(country)
  const name = rule.shortName ?? country
  return partyType === 'individual'
    ? `Blacklisted nationality: ${rule.demonym ? `${rule.demonym} nationals` : `nationals of ${name}`} cannot be onboarded.`
    : `Blacklisted jurisdiction: a company incorporated in ${name} cannot be onboarded as a shareholder or subsidiary of a Meydan FZ company.`
}

/** "North Korean national", "incorporated in Iran" — for the Summary banner. */
export function blacklistBasis(country: string, partyType: PartyType): string {
  const rule = overrideRule(country)
  const name = rule.shortName ?? country
  return partyType === 'individual'
    ? rule.demonym
      ? `${rule.demonym} national`
      : `national of ${name}`
    : `incorporated in ${name}`
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
