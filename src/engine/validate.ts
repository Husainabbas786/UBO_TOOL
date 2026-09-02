import { formatPercentShort, round2 } from './format'
import { buildGraph, findCycle, normaliseName, toKey } from './normalize'
import type {
  OwnershipGraph,
  OwnershipLinkInput,
  PartyType,
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
export function validate(links: OwnershipLinkInput[], graph?: OwnershipGraph): ValidationResult {
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
      message: `${links.length} ownership links entered — above the recommended maximum of ${MAX_LINKS}.`,
    })
  }

  const ownerDeclarations = new Map<string, Set<PartyType>>()
  const entityKeys = new Set<string>()
  const seenPairs = new Map<string, string>()

  for (const link of links) {
    const ownerName = normaliseName(link.ownerName)
    const entityName = normaliseName(link.entityName)

    if (ownerName === '') {
      errors.push({ code: 'empty-owner-name', message: 'Owner name is required.', linkId: link.id })
    }
    if (entityName === '') {
      errors.push({ code: 'empty-entity-name', message: 'Entity name is required.', linkId: link.id })
    }

    if (!Number.isFinite(link.percent) || link.percent <= 0 || link.percent > 100) {
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

    const pair = `${ownerKey}>${entityKey}`
    const firstRow = seenPairs.get(pair)
    if (firstRow === undefined) {
      seenPairs.set(pair, link.id)
    } else {
      errors.push({
        code: 'duplicate-link',
        message: `${ownerName} already owns ${entityName} on another row — combine them into one link.`,
        linkId: link.id,
      })
    }

    let declared = ownerDeclarations.get(ownerKey)
    if (!declared) {
      declared = new Set<PartyType>()
      ownerDeclarations.set(ownerKey, declared)
    }
    declared.add(link.ownerType)
    entityKeys.add(entityKey)
  }

  for (const [key, declared] of ownerDeclarations) {
    const name = resolved.nodeByKey.get(key)?.name ?? key
    if (declared.size > 1) {
      errors.push({
        code: 'type-conflict',
        message: `${name} is entered as an individual on one row and a company on another — pick one.`,
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
      message: `${name}: owners total ${formatPercentShort(total)}% — ${formatPercentShort(gap)}% ${direction}`,
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
      message: 'No target entity found — every company entered owns something else.',
    })
  }

  return { ok: errors.length === 0, errors, warnings }
}

/** Per-company owner totals, in the order the companies were first seen. */
export function companyTotals(
  graph: OwnershipGraph,
): Array<{ key: string; name: string; total: number }> {
  const totals = new Map<string, number>()
  for (const link of graph.links) {
    if (!Number.isFinite(link.percent)) continue
    totals.set(link.entityKey, (totals.get(link.entityKey) ?? 0) + link.percent)
  }
  return graph.nodes
    .filter((node) => totals.has(node.key))
    .map((node) => ({ key: node.key, name: node.name, total: round2(totals.get(node.key) ?? 0) }))
}
