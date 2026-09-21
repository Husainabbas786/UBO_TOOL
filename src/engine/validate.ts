import { formatPercentShort, round2 } from './format'
import { entityKindLabel, isRoleValid, rolesFor, type EntityKind } from './kinds'
import {
  buildGraph,
  findCycle,
  isControlRow,
  normaliseName,
  resolveEntityKinds,
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

  const kinds = resolveEntityKinds(links)
  const ownerDeclarations = new Map<string, Set<PartyType>>()
  const entityKeys = new Set<string>()
  const seenPairs = new Map<string, string>()
  const kindDeclarations = new Map<string, Set<EntityKind>>()

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
    const entityKind = kinds.get(toKey(entityName)) ?? 'company'
    const isRole = entityName !== '' && entityKind !== 'company'

    if (ownerName === '') {
      errors.push({ code: 'empty-owner-name', message: 'Owner name is required.', linkId: link.id })
    }
    if (entityName === '') {
      errors.push({ code: 'empty-entity-name', message: 'Entity name is required.', linkId: link.id })
    }

    if (entityName !== '') {
      let declaredKinds = kindDeclarations.get(toKey(entityName))
      if (!declaredKinds) {
        declaredKinds = new Set<EntityKind>()
        kindDeclarations.set(toKey(entityName), declaredKinds)
      }
      declaredKinds.add(link.entityKind ?? 'company')
    }

    /*
     * A row into a trust, foundation or NPO states a position, not a holding:
     * there are no shares to total, so the percentage is neither asked for nor
     * checked. What it does need is the role itself.
     */
    if (isRole) {
      if (!isRoleValid(entityKind, link.role)) {
        errors.push({
          code: 'role-required',
          message: `Choose this person's role in ${entityName} (${rolesFor(entityKind).join(', ')}).`,
          linkId: link.id,
        })
      }
    } else {
      // 0% (or a blank percentage) is allowed for a flagged individual: that is
      // control without ownership.
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
    }

    /*
     * A nominee holding is only meaningful once we know who it is held for:
     * the whole point of the flag is to move the shares to that person, so a
     * blank nominator would silently leave them with the nominee.
     */
    const nominatorName = normaliseName(link.nominatorName ?? '')
    if (!isRole && link.ownerIsNominee) {
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
        message: isRole
          ? `${ownerName} cannot hold a role in itself.`
          : `${ownerName} cannot own itself.`,
        linkId: link.id,
      })
      continue
    }

    /*
     * One person can hold two roles in the same trust — settlor and beneficiary
     * is an ordinary arrangement — so a role row is a duplicate only when the
     * role repeats too.
     */
    /*
     * Shares held as a nominee are a different parcel from shares held in the
     * agent's own right, so the two are not duplicates of each other — the
     * nominator is part of what makes a holding distinct.
     */
    const heldFor = link.ownerIsNominee ? toKey(nominatorName) : ''
    const pair = isRole
      ? `${ownerKey}>${entityKey}>${link.role ?? ''}`
      : `${ownerKey}>${entityKey}>${heldFor}`
    const firstRow = seenPairs.get(pair)
    if (firstRow === undefined) {
      seenPairs.set(pair, link.id)
    } else {
      errors.push({
        code: 'duplicate-link',
        message: isRole
          ? `${ownerName} is already entered as ${link.role} of ${entityName} on another row.`
          : heldFor !== ''
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
        code: 'entity-kind-conflict',
        message: `${name} is entered as a ${nonCommercial
          .map(entityKindLabel)
          .join(' and a ')} on different rows. An entity can only be one kind.`,
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

  errors.push(...validateRelatedParties(relatedParties, resolved))

  return { ok: errors.length === 0, errors, warnings }
}

/**
 * Related-party links are checked only once the agent has started one. A link
 * naming somebody who is not in the structure is the dangerous case: left
 * unreported it would look linked on screen and count for nothing.
 */
function validateRelatedParties(
  relatedParties: RelatedPartyLinkInput[],
  graph: OwnershipGraph,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  relatedParties.forEach((group, index) => {
    const names = group.memberNames.map(normaliseName).filter((name) => name !== '')
    if (names.length === 0) return

    const label = `Related-party link ${index + 1}`
    for (const name of names) {
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
 * Per-entity owner totals, in the order the entities were first seen. Trusts,
 * foundations and NPOs are left out: they have no shares, so there is nothing
 * to total and the 100% rule does not apply to them.
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
