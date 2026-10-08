import { entityKindLabel, isNonCommercial, type CalculationResult } from '../engine'
import { lookupRisk, RISK_ORDER, type RiskRating } from './countryRisk'

/**
 * Party key (the engine's normalised name) -> canonical country name.
 *
 * Held beside the calculation, never inside it: the engine never sees a
 * country, so a country can never move a percentage or a UBO.
 */
export type CountryMap = ReadonlyMap<string, string>

export const DEFAULT_TARGET_COUNTRY = 'United Arab Emirates'

/** A party's country and its rating, or nulls when none has been entered. */
export function countryRiskOf(
  countries: CountryMap,
  key: string,
): { country: string | null; risk: RiskRating | null } {
  const country = countries.get(key) ?? ''
  if (country === '') return { country: null, risk: null }
  return { country, risk: lookupRisk(country)?.rating ?? null }
}

interface Party {
  key: string
  name: string
  /** "individual", "company", or a structure's kind — "trust", "foundation"… */
  typeLabel: string
}

/**
 * Everyone named on the file: every party in the ownership structure, then any
 * officer of the Meydan FZ company who is not already one of them.
 */
export function partiesOf(result: CalculationResult): Party[] {
  const parties: Party[] = result.graph.nodes.map((node) => ({
    key: node.key,
    name: node.name,
    typeLabel:
      node.type === 'individual'
        ? 'individual'
        : isNonCommercial(node.entityKind)
          ? entityKindLabel(node.entityKind).toLowerCase()
          : 'company',
  }))
  const seen = new Set(parties.map((party) => party.key))
  for (const person of result.management) {
    if (seen.has(person.key)) continue
    seen.add(person.key)
    parties.push({ key: person.key, name: person.name, typeLabel: 'individual' })
  }
  return parties
}

export interface JurisdictionLine {
  key: string
  name: string
  typeLabel: string
  country: string
}

export interface JurisdictionRisk {
  /** Medium and above, highest tier first; empty tiers are left out. */
  tiers: Array<{ rating: Exclude<RiskRating, 'Low'>; parties: JurisdictionLine[] }>
  /**
   * Parties with no country, named only when somebody else does have one —
   * when nobody has a country, the feature simply was not used.
   */
  missing: string[]
}

/** The Summary's "Jurisdiction risk" block, worked out from the result. */
export function jurisdictionRisk(result: CalculationResult, countries: CountryMap): JurisdictionRisk {
  const parties = partiesOf(result).map((party) => ({
    ...party,
    ...countryRiskOf(countries, party.key),
  }))

  const tiers: JurisdictionRisk['tiers'] = []
  for (const rating of RISK_ORDER) {
    if (rating === 'Low') continue
    const lines = parties
      .filter((party) => party.risk === rating)
      .map(({ key, name, typeLabel, country }) => ({ key, name, typeLabel, country: country! }))
    if (lines.length > 0) tiers.push({ rating, parties: lines })
  }

  const withCountry = parties.filter((party) => party.country !== null)
  const missing =
    withCountry.length > 0 && withCountry.length < parties.length
      ? parties.filter((party) => party.country === null).map((party) => party.name)
      : []

  return { tiers, missing }
}
