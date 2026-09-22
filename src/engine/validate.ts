import { formatPercentShort, round2 } from './format'
import { entityKindLabel, isRoleValid, rolesFor, type EntityKind } from './kinds'
import {
  buildGraph,
  findCycle,
  isControlRow,
  normaliseName,
  resolveOwnerKinds,
  toKey,
} from './normalize'
import type {
  OwnershipGraph,
  OwnershipLinkInput,
  PartyType,
  RelatedPartyLinkInput,
  ValidationIssue,
  ValidationResult,
} from './types'

/** Rounding allowance on the "owners must total 100%" rule. */
export const TOTAL_TOLERANCE = 0.01

/** Soft cap on builder rows — a warning, not a blocker. */
export const MAX_LINKS = 50

/**
 * Every blocking problem in one pass, so the UI can list them all at once and
 * keep Calculate disabled until the structure is sound.
 */
export function validate(
  links: OwnershipLinkInput[],
  graph?: OwnershipGraph,
  relatedParties: RelatedPartyLinkInput[] = [],
  /** The company being analysed, which cannot be a member of a related group. */
  targetKey?: string | null,
): ValidationResult {
  const resolved = graph ?? buildGraph(links)
  const errors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []

  if (links.length === 0) {
    errors.push({ code: 'no-links', message: 'Add at least one ownership link.' })
    return { ok: false, errors, warnings }
  }

  if (links.length > MAX_LINKS) {
    warnings.push({
      code: 'too-many-links',
      message: `${links.length} ownership links entered, above the recommended maximum of ${MAX_LINKS}.`,
    })
  }

  const kinds = resolveOwnerKinds(links)
  const ownerDeclarations = new Map<string, Set<PartyType>>()
  const entityKeys = new Set<string>()
  const seenPairs = new Map<string, string>()
  const kindDeclarations = new Map<string, Set<EntityKind>>()
  /** Non-commercial shareholders, so a row trying to own one can be caught. */
  const nonCommercialKeys = new Set(
    [...kinds.entries()].filter(([, kind]) => kind !== 'company').map(([key]) => key),
  )

  const declareOwner = (key: string, type: PartyType) => {
    let declared = ownerDeclarations.get(key)
    if (!declared) {
      declared = new Set<PartyType>()
      ownerDeclarations.set(key, declared)
    }
    declared.add(type)
  }

  for (const link of links) {
    const ownerName = normaliseName(link.ownerName)
    const entityName = normaliseName(link.entityName)
    const ownerKind = kinds.get(toKey(ownerName)) ?? 'company'
    const isNonCommercialOwner = ownerName !== '' && ownerKind !== 'company'

    if (ownerName === '') {
      errors.push({ code: 'empty-owner-name', message: 'Owner name is required.', linkId: link.id })
    }
    if (entityName === '') {
      errors.push({ code: 'empty-entity-name', message: 'Entity name is required.', linkId: link.id })
    }

    if (ownerName !== '' && link.ownerType === 'company') {
      let declaredKinds = kindDeclarations.get(toKey(ownerName))
      if (!declaredKinds) {
        declaredKinds = new Set<EntityKind>()
        kindDeclarations.set(toKey(ownerName), declaredKinds)
      }
      declaredKinds.add(link.ownerKind ?? 'company')
    }

    /*
     * A trust, foundation or NPO has no share capital, so nobody can hold a
     * percentage of one. Before the legal type moved to the shareholder side
     * this row *was* how a role was entered; now it is simply wrong, and
     * saying so is what points the agent at the inline role entry instead.
     */
    if (entityName !== '' && nonCommercialKeys.has(toKey(entityName))) {
      const kindName = entityKindLabel(kinds.get(toKey(entityName)) ?? 'company').toLowerCase()
      errors.push({
        code: 'non-commercial-owned',
        message: `${entityName} is a ${kindName} and has no shares to own. Enter its people as role-holders on its own shareholder row.`,
        linkId: link.id,
      })
    }

    if (isNonCommercialOwner) {
      errors.push(...validateRoleHolders(link, ownerName, ownerKind))
    }

    /*
     * Every row is a shareholding: a trust holds its stake in a company like
     * any other shareholder, and it is only the trust's *own* ownership that
     * does not exist. 0% (or a blank percentage) is allowed for a flagged
     * individual, which is control without ownership.
     */
    const control = isControlRow(link)
    const blankOrZero = link.percent === 0 || !Number.isFinite(link.percent)

    if (control) {
      // Nothing to check: a control row carries no percentage.
    } else if (blankOrZero && link.ownerType === 'individual' && !link.ownerIsNominee) {
      // Point them straight at the checkbox. In the field this is the moment a
      // first-time user gives up, because nothing tells them it exists.
      errors.push({
        code: 'invalid-percent',
        message:
          'Enter a percentage above 0, or tick Controller if this person has control (e.g. voting rights) without ownership.',
        linkId: link.id,
      })
    } else if (!Number.isFinite(link.percent) || link.percent <= 0 || link.percent > 100) {
      errors.push({
        code: 'invalid-percent',
        message: 'Percentage must be greater than 0 and no more than 100.',
        linkId: link.id,
      })
    } else if (round2(link.percent) !== link.percent) {
      errors.push({
        code: 'percent-precision',
        message: 'Percentage may have at most 2 decimal places.',
        linkId: link.id,
      })
    }

    /*
     * A nominee holding is only meaningful once we know who it is held for:
     * the whole point of the flag is to move the shares to that person, so a
     * blank nominator would silently leave them with the nominee.
     */
    const nominatorName = normaliseName(link.nominatorName ?? '')
    if (link.ownerIsNominee) {
      if (nominatorName === '') {
        errors.push({
          code: 'nominator-required',
          message: 'Name the nominator — the actual shareholder these shares are held for.',
          linkId: link.id,
        })
      } else if (ownerName !== '' && toKey(nominatorName) === toKey(ownerName)) {
        errors.push({
          code: 'self-nomination',
          message: `${ownerName} cannot be their own nominator. Name the actual shareholder, or untick Nominee.`,
          linkId: link.id,
        })
      } else if (entityName !== '' && toKey(nominatorName) === toKey(entityName)) {
        errors.push({
          code: 'self-nomination',
          message: `${entityName} cannot be the nominator of its own shares.`,
          linkId: link.id,
        })
      } else {
        declareOwner(toKey(nominatorName), link.nominatorType ?? 'individual')
      }
    }

    if (ownerName === '' || entityName === '') continue

    const ownerKey = toKey(ownerName)
    const entityKey = toKey(entityName)

    if (ownerKey === entityKey) {
      errors.push({
        code: 'self-ownership',
        message: `${ownerName} cannot own itself.`,
        linkId: link.id,
      })
      continue
    }

    /*
     * Shares held as a nominee are a different parcel from shares held in the
     * agent's own right, so the two are not duplicates of each other — the
     * nominator is part of what makes a holding distinct.
     */
    const heldFor = link.ownerIsNominee ? toKey(nominatorName) : ''
    const pair = `${ownerKey}>${entityKey}>${heldFor}`
    const firstRow = seenPairs.get(pair)
    if (firstRow === undefined) {
      seenPairs.set(pair, link.id)
    } else {
      errors.push({
        code: 'duplicate-link',
        message:
          heldFor !== ''
            ? `${ownerName} already holds shares in ${entityName} for ${nominatorName} on another row. Combine them into one link.`
            : `${ownerName} already owns ${entityName} on another row. Combine them into one link.`,
        linkId: link.id,
      })
    }

    declareOwner(ownerKey, link.ownerType)
    entityKeys.add(entityKey)
  }

  for (const [key, declaredKinds] of kindDeclarations) {
    const nonCommercial = [...declaredKinds].filter((kind) => kind !== 'company')
    if (nonCommercial.length > 1) {
      const name = resolved.nodeByKey.get(key)?.name ?? key
      errors.push({
        code: 'owner-kind-conflict',
        message: `${name} is entered as a ${nonCommercial
          .map(entityKindLabel)
          .join(' and a ')} on different rows. A shareholder can only be one kind.`,
        nodeKey: key,
      })
    }
  }

  for (const [key, declared] of ownerDeclarations) {
    const name = resolved.nodeByKey.get(key)?.name ?? key
    if (declared.size > 1) {
      errors.push({
        code: 'type-conflict',
        message: `${name} is entered as an individual on one row and a company on another. Pick one.`,
        nodeKey: key,
      })
    }
    if (declared.has('individual') && entityKeys.has(key)) {
      errors.push({
        code: 'individual-owned',
        message: `${name} is an individual and cannot be owned by anyone.`,
        nodeKey: key,
      })
    }
  }

  for (const { key, name, total } of companyTotals(resolved)) {
    if (Math.abs(total - 100) <= TOTAL_TOLERANCE + 1e-9) continue
    const gap = round2(Math.abs(100 - total))
    const direction = total < 100 ? 'missing' : 'over'
    errors.push({
      code: 'totals-not-100',
      message: `${name}: owners total ${formatPercentShort(total)}%, ${formatPercentShort(gap)}% ${direction}`,
      nodeKey: key,
    })
  }

  // A self-owning row is already reported above; don't report it twice as a loop.
  if (!errors.some((issue) => issue.code === 'self-ownership')) {
    const cycle = findCycle(resolved)
    if (cycle) {
      errors.push({
        code: 'circular-ownership',
        message: `Circular ownership detected: ${cycle.join(' → ')}. Ownership cannot loop back on itself.`,
      })
    }
  }

  if (resolved.links.length > 0 && resolved.targetCandidates.length === 0) {
    errors.push({
      code: 'no-target',
      message:
        'No Meydan FZ company found. Every company entered owns something else, so none of them can be the company being analysed.',
    })
  }

  errors.push(...validateRelatedParties(relatedParties, resolved, targetKey ?? null))

  return { ok: errors.length === 0, errors, warnings }
}

/**
 * The people entered inline under a trust, foundation or NPO shareholder.
 *
 * These entries are the whole of what the tool knows about a structure with no
 * share capital, so a half-finished one — a name with no role, a role with no
 * name — is a blocking error rather than something quietly dropped. Each error
 * carries the holder's id so the builder can mark the right line.
 */
function validateRoleHolders(
  link: OwnershipLinkInput,
  ownerName: string,
  ownerKind: EntityKind,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const seen = new Map<string, string>()

  for (const holder of link.roleHolders ?? []) {
    const name = normaliseName(holder.name)

    if (name === '') {
      // An untouched blank line is how the builder offers the next person; only
      // one with a role already chosen is a half-finished entry.
      if (holder.role !== null) {
        issues.push({
          code: 'role-holder-name-required',
          message: `Name the ${holder.role} of ${ownerName}.`,
          linkId: link.id,
          roleHolderId: holder.id,
        })
      }
      continue
    }

    if (!isRoleValid(ownerKind, holder.role)) {
      issues.push({
        code: 'role-required',
        message: `Choose ${name}'s role in ${ownerName} (${rolesFor(ownerKind).join(', ')}).`,
        linkId: link.id,
        roleHolderId: holder.id,
      })
      continue
    }

    if (toKey(name) === toKey(ownerName)) {
      issues.push({
        code: 'self-ownership',
        message: `${ownerName} cannot hold a role in itself.`,
        linkId: link.id,
        roleHolderId: holder.id,
      })
      continue
    }

    /*
     * One person can hold two roles in the same structure — settlor and
     * beneficiary is an ordinary arrangement — so an entry is a duplicate only
     * when the role repeats too.
     */
    const signature = `${toKey(name)}>${holder.role}`
    if (seen.has(signature)) {
      issues.push({
        code: 'duplicate-link',
        message: `${name} is already entered as ${holder.role} of ${ownerName}.`,
        linkId: link.id,
        roleHolderId: holder.id,
      })
      continue
    }
    seen.set(signature, holder.id)
  }

  return issues
}

/**
 * Related-party links are checked only once the agent has started one. A link
 * naming somebody who is not in the structure is the dangerous case: left
 * unreported it would look linked on screen and count for nothing.
 */
function validateRelatedParties(
  relatedParties: RelatedPartyLinkInput[],
  graph: OwnershipGraph,
  targetKey: string | null,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  relatedParties.forEach((group, index) => {
    const names = group.memberNames.map(normaliseName).filter((name) => name !== '')
    if (names.length === 0) return

    const label = `Related-party link ${index + 1}`
    for (const name of names) {
      /*
       * The company being analysed holds 100% of itself, so linking it to a
       * shareholder would carry any group straight past the threshold and make
       * beneficial owners of everyone in it. It is what the group is measured
       * against, never a member of one.
       */
      if (targetKey !== null && toKey(name) === targetKey) {
        issues.push({
          code: 'related-party-target',
          message: `${label}: ${name} is the Meydan FZ company itself and cannot be linked. Link its shareholders instead.`,
          relatedId: group.id,
        })
        continue
      }
      if (graph.nodeByKey.has(toKey(name))) continue
      issues.push({
        code: 'related-party-unknown',
        message: `${label}: "${name}" is not a party in the structure above. Check the spelling.`,
        relatedId: group.id,
      })
    }

    const distinct = new Set(names.map(toKey))
    if (distinct.size < 2) {
      issues.push({
        code: 'related-party-too-few',
        message: `${label}: link at least two different parties, or remove the link.`,
        relatedId: group.id,
      })
    }
  })

  return issues
}

/**
 * Per-company owner totals, in the order the companies were first seen. Trusts,
 * foundations and NPOs are left out: they have no shares, so there is nothing
 * to total and the 100% rule does not apply to them, however much of a company
 * they hold themselves.
 */
export function companyTotals(
  graph: OwnershipGraph,
): Array<{ key: string; name: string; total: number }> {
  const totals = new Map<string, number>()
  for (const link of graph.links) {
    // A control-only or role link is not a shareholding, so it neither counts
    // towards the 100% total nor makes an entity subject to the rule.
    if (link.isControl || link.isRole || !Number.isFinite(link.percent)) continue
    totals.set(link.entityKey, (totals.get(link.entityKey) ?? 0) + link.percent)
  }
  return graph.nodes
    .filter((node) => node.entityKind === 'company' && totals.has(node.key))
    .map((node) => ({ key: node.key, name: node.name, total: round2(totals.get(node.key) ?? 0) }))
}
