import { isNonCommercial, toKey, type EntityKind } from '../engine'
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
  for (const row of rows) {
    slots.push({ id: `${row.id}:owner`, key: toKey(row.ownerName) })
    const isStructure =
      row.ownerType === 'company' && isNonCommercial(ownerKinds.get(row.id) ?? row.ownerKind)
    // Only fields actually on screen count: a hidden nominator or people list
    // is not a place the party is named.
    if (row.ownerIsNominee && !isStructure) {
      slots.push({ id: `${row.id}:nominator`, key: toKey(row.nominatorName) })
    }
    if (isStructure) {
      for (const holder of row.roleHolders) {
        slots.push({ id: `${row.id}:holder:${holder.id}`, key: toKey(holder.name) })
      }
    }
  }
  for (const row of management) slots.push({ id: `mgmt:${row.id}`, key: toKey(row.name) })
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
