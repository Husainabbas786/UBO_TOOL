import { isNonCommercial, toKey, type EntityKind, type PartyType } from '../engine'
import type { LinkRowState, ManagementRowState } from './rows'

/**
 * Where a party's country is held: one entry per place a name is typed — a
 * row's shareholder, its nominator, each person behind a trust, each
 * management line.
 *
 * Holding it per place rather than per name is what lets a typo be fixed
 * without losing the country: the entry stays with the field, whatever the
 * field now says. A party named in several places is kept in step the way the
 * Controller box is — setting the country in one place sets it in all of them.
 *
 * None of this reaches the engine. The rows handed to calculate() carry no
 * country; this map sits beside them.
 */
export interface CountrySlot {
  /** Stable across renames: the row or entry id plus which field it is. */
  id: string
  /** The party currently named in that field ('' when blank). */
  key: string
  /** The name as typed, for messages. */
  name: string
  /** Decides whether the field asks for a nationality or a country of incorporation. */
  partyType: PartyType
  /** Where the field is on the page, as the blockers list names it: "Row 3". */
  place: string
}

export interface CountryEntry {
  /** A canonical country name, or '' for a deliberate clear. */
  country: string
  /**
   * Set when the entry was copied from another place naming the same party,
   * rather than picked here: the party key it was copied for.
   *
   * A copy belongs to the name, not to the field. If the field's name changes
   * the copy is dropped — otherwise typing "Husain Abbas" would pick up the
   * country of "Husain" on the way past and keep it. A copy becomes the
   * field's own once nowhere else holds the party's country, so the last place
   * naming a party keeps it through a rename like any other.
   */
  adoptedFrom: string | null
}

export type CountryEntries = ReadonlyMap<string, CountryEntry>

/** Every place on the page that names a party, in page order. */
export function countrySlots(
  rows: LinkRowState[],
  management: ManagementRowState[],
  ownerKinds: ReadonlyMap<string, EntityKind>,
): CountrySlot[] {
  const slots: CountrySlot[] = []
  rows.forEach((row, index) => {
    const rowNumber = index + 1
    slots.push({
      id: `${row.id}:owner`,
      key: toKey(row.ownerName),
      name: row.ownerName.trim(),
      partyType: row.ownerType,
      place: `Row ${rowNumber}`,
    })
    const isStructure =
      row.ownerType === 'company' && isNonCommercial(ownerKinds.get(row.id) ?? row.ownerKind)
    // Only fields actually on screen count: a hidden nominator or people list
    // is not a place the party is named.
    if (row.ownerIsNominee && !isStructure) {
      slots.push({
        id: `${row.id}:nominator`,
        key: toKey(row.nominatorName),
        name: row.nominatorName.trim(),
        partyType: row.nominatorType,
        place: `Nominator on row ${rowNumber}`,
      })
    }
    if (isStructure) {
      row.roleHolders.forEach((holder, holderIndex) => {
        slots.push({
          id: `${row.id}:holder:${holder.id}`,
          key: toKey(holder.name),
          name: holder.name.trim(),
          partyType: holder.type ?? 'individual',
          place: `Person ${holderIndex + 1} on row ${rowNumber}`,
        })
      })
    }
  })
  management.forEach((row, index) => {
    slots.push({
      id: `mgmt:${row.id}`,
      key: toKey(row.name),
      name: row.name.trim(),
      partyType: 'individual',
      place: `Management ${index + 1}`,
    })
  })
  return slots
}

/**
 * Each party's country: the first place's own entry, else the first copy.
 * Only parties with a country are listed; a deliberate clear lists nothing.
 */
export function resolveCountries(
  slots: CountrySlot[],
  entries: CountryEntries,
): Map<string, string> {
  const own = new Map<string, string>()
  const copied = new Map<string, string>()
  for (const slot of slots) {
    if (slot.key === '') continue
    const entry = entries.get(slot.id)
    if (!entry) continue
    const target = entry.adoptedFrom === null ? own : copied
    if (!target.has(slot.key)) target.set(slot.key, entry.country)
  }
  const resolved = new Map<string, string>()
  for (const [key, country] of copied) if (!own.has(key)) resolved.set(key, country)
  for (const [key, country] of own) resolved.set(key, country)
  for (const [key, country] of resolved) if (country === '') resolved.delete(key)
  return resolved
}

/** Picking a country for a party sets it everywhere that party is named. */
export function setPartyCountry(
  slots: CountrySlot[],
  entries: CountryEntries,
  key: string,
  country: string,
): Map<string, CountryEntry> {
  const next = new Map(entries)
  if (key === '') return next
  for (const slot of slots) {
    if (slot.key === key) next.set(slot.id, { country, adoptedFrom: null })
  }
  return next
}

/**
 * Brings the entries in line with what the page now names. Returns the same
 * map when nothing changed, so it can run on every edit without re-rendering.
 *
 * - A removed row's entries go with it — so removing the last place naming a
 *   party drops its country.
 * - A copy whose field no longer names the party it was copied for is dropped.
 * - A copy becomes the field's own once no other place holds the party's
 *   country itself.
 * - A place newly naming a party that already has a country takes a copy, so
 *   two rows for the same party always agree.
 */
export function reconcileCountries(
  slots: CountrySlot[],
  entries: CountryEntries,
): CountryEntries {
  const next = new Map(entries)
  let changed = false
  const ids = new Set(slots.map((slot) => slot.id))

  for (const id of next.keys()) {
    if (!ids.has(id)) {
      next.delete(id)
      changed = true
    }
  }

  for (const slot of slots) {
    const entry = next.get(slot.id)
    if (entry && entry.adoptedFrom !== null && entry.adoptedFrom !== slot.key) {
      next.delete(slot.id)
      changed = true
    }
  }

  const ownKeys = new Set(
    slots
      .filter((slot) => slot.key !== '' && next.get(slot.id)?.adoptedFrom === null)
      .map((slot) => slot.key),
  )
  for (const slot of slots) {
    const entry = next.get(slot.id)
    if (entry && entry.adoptedFrom !== null && !ownKeys.has(slot.key)) {
      next.set(slot.id, { country: entry.country, adoptedFrom: null })
      ownKeys.add(slot.key)
      changed = true
    }
  }

  const resolved = resolveCountries(slots, next)
  for (const slot of slots) {
    if (slot.key === '' || next.has(slot.id)) continue
    const country = resolved.get(slot.key)
    if (country === undefined) continue
    next.set(slot.id, { country, adoptedFrom: slot.key })
    changed = true
  }

  return changed ? next : entries
}

/** The inline error under an empty country picker. */
export function countryRequiredMessage(partyType: PartyType): string {
  return partyType === 'individual'
    ? 'Select a nationality.'
    : 'Select the country of incorporation.'
}

/** What a picker asks for; the asterisk says it cannot be left blank. */
export function countryPlaceholder(partyType: PartyType): string {
  return partyType === 'individual' ? 'Nationality *' : 'Country of incorporation *'
}

/**
 * Every party needs a country before Calculate will run: a nationality for a
 * person, a country of incorporation for anything else.
 *
 * Returns one line per party still without one, in page order, for the list
 * under the disabled button. A party named in several places is listed once —
 * one entry sets the country everywhere they appear, so one line is enough. An
 * unnamed field is not a party yet and is left to the row's own errors.
 *
 * The Meydan FZ company is not typed into a field of its own, so it is passed
 * in separately and checked last, where its picker sits on the page.
 */
export function missingCountries(
  slots: CountrySlot[],
  countries: ReadonlyMap<string, string>,
  target: { key: string; name: string } | null,
): string[] {
  const reasons: string[] = []
  const seen = new Set<string>()
  const require = (key: string, name: string, partyType: PartyType, place: string) => {
    if (key === '' || seen.has(key)) return
    seen.add(key)
    if ((countries.get(key) ?? '') !== '') return
    const field = partyType === 'individual' ? 'nationality' : 'country of incorporation'
    reasons.push(`${place}: select ${name}'s ${field}.`)
  }
  for (const slot of slots) require(slot.key, slot.name, slot.partyType, slot.place)
  if (target) require(target.key, target.name, 'company', 'Meydan FZ company')
  return reasons
}

/**
 * Load example's countries: every party in the sample structure entered as a
 * UAE party, so the example calculates now that a country is required. Kept
 * beside the rows rather than in the engine's sample, which never carries one.
 */
export function exampleCountryEntries(
  rows: LinkRowState[],
  country: string,
): Map<string, CountryEntry> {
  const entries = new Map<string, CountryEntry>()
  for (const slot of countrySlots(rows, [], new Map())) {
    if (slot.key !== '') entries.set(slot.id, { country, adoptedFrom: null })
  }
  return entries
}
