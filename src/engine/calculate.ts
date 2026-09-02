import { atLeast, round2 } from './format'
import { buildGraph, holdingsOf, ownersOf } from './normalize'
import { validate } from './validate'
import {
  EngineError,
  type CalculationResult,
  type IntermediaryCompany,
  type OwnershipGraph,
  type OwnershipLinkInput,
  type OwnershipPath,
  type PartyNode,
  type UboBasis,
  type UboSummaryEntry,
  type UnidentifiedOwnerGap,
} from './types'

/** The two thresholds the tool offers, per MOE risk rating. */
export const THRESHOLDS = [
  { value: 25, label: '25% — Standard (Low / Medium risk)' },
  { value: 10, label: '10% — High risk (Enhanced due diligence)' },
] as const

export const DEFAULT_THRESHOLD = 25

export interface CalculateOptions {
  /** Node key of the company being analysed. */
  targetKey: string
  /** Qualifying percentage; effective % >= threshold is a UBO. */
  threshold: number
}

/** The target the UI should preselect: the first company that owns nothing. */
export function defaultTargetKey(graph: OwnershipGraph): string | null {
  return graph.targetCandidates[0]?.key ?? null
}

/** Raw (unrounded) path, kept at full precision until the very last step. */
interface RawPath {
  ownerKey: string
  chainKeys: string[]
  fraction: number
}

/**
 * Every route from an ultimate owner down to the target. An ultimate owner is a
 * party nobody owns, which is why the sample structure yields three paths and
 * not four — XYZ Ltd is owned by Husain and Dinesh, so it is not an endpoint.
 *
 * Assumes the graph is acyclic; validate() rejects loops before we get here.
 */
function enumeratePaths(graph: OwnershipGraph, targetKey: string): RawPath[] {
  const found: RawPath[] = []
  const maxDepth = graph.nodes.length + 1

  const walk = (key: string, fraction: number, chainKeys: string[], depth: number): void => {
    if (depth > maxDepth) {
      throw new EngineError('Ownership chain is longer than the number of parties entered.')
    }
    const owners = ownersOf(graph, key)
    if (owners.length === 0) {
      if (chainKeys.length > 1) found.push({ ownerKey: key, chainKeys, fraction })
      return
    }
    for (const link of owners) {
      walk(link.ownerKey, (fraction * link.percent) / 100, [link.ownerKey, ...chainKeys], depth + 1)
    }
  }

  walk(targetKey, 1, [targetKey], 0)
  return found
}

/**
 * Effective fraction of the target held by every party, by walking downwards and
 * memoising. Used for the intermediary list, where the parties in the middle of
 * a chain each need their own share of the target.
 */
function sharesOfTarget(graph: OwnershipGraph, targetKey: string): Map<string, number> {
  const memo = new Map<string, number>()

  const share = (key: string): number => {
    if (key === targetKey) return 1
    const cached = memo.get(key)
    if (cached !== undefined) return cached
    let total = 0
    for (const link of holdingsOf(graph, key)) {
      total += (link.percent / 100) * share(link.entityKey)
    }
    memo.set(key, total)
    return total
  }

  for (const node of graph.nodes) share(node.key)
  memo.set(targetKey, 1)
  return memo
}

function basisFor(qualifiesByOwnership: boolean, isController: boolean): UboBasis {
  if (qualifiesByOwnership && isController) return 'Ownership + Control'
  if (isController) return 'Control'
  return 'Ownership'
}

/**
 * The whole calculation: paths, aggregated owners, UBOs and intermediaries.
 * Throws EngineError if the structure does not validate — the UI keeps
 * Calculate disabled until it does, so this is a guard rather than a code path.
 */
export function calculate(
  links: OwnershipLinkInput[],
  options: CalculateOptions,
): CalculationResult {
  const graph = buildGraph(links)
  const validation = validate(links, graph)
  if (!validation.ok) {
    throw new EngineError(
      'Cannot calculate: the ownership structure has unresolved errors.',
      validation.errors,
    )
  }

  const target = graph.nodeByKey.get(options.targetKey)
  if (!target) {
    throw new EngineError(`Target entity "${options.targetKey}" is not part of this structure.`)
  }

  const nameOf = (key: string): string => graph.nodeByKey.get(key)?.name ?? key
  const { threshold } = options

  const rawPaths = enumeratePaths(graph, target.key)

  const paths: OwnershipPath[] = rawPaths
    .map((raw): OwnershipPath => {
      const effectivePercent = round2(raw.fraction * 100)
      return {
        ownerKey: raw.ownerKey,
        ownerName: nameOf(raw.ownerKey),
        ownerType: graph.nodeByKey.get(raw.ownerKey)?.type ?? 'individual',
        chain: raw.chainKeys.map(nameOf),
        effectivePercent,
        status: atLeast(effectivePercent, threshold) ? 'UBO' : 'Below threshold',
      }
    })
    .sort(
      (a, b) => b.effectivePercent - a.effectivePercent || a.ownerName.localeCompare(b.ownerName),
    )

  // Aggregate at full precision and round once, so an owner reached by several
  // paths gets the exact total rather than a sum of rounded parts.
  const totals = new Map<string, { fraction: number; pathCount: number }>()
  for (const raw of rawPaths) {
    const entry = totals.get(raw.ownerKey) ?? { fraction: 0, pathCount: 0 }
    entry.fraction += raw.fraction
    entry.pathCount += 1
    totals.set(raw.ownerKey, entry)
  }

  const toEntry = (node: PartyNode, fraction: number, pathCount: number): UboSummaryEntry => {
    const totalPercent = round2(fraction * 100)
    return {
      key: node.key,
      name: node.name,
      type: node.type,
      totalPercent,
      basis: basisFor(atLeast(totalPercent, threshold), node.isController),
      isController: node.isController,
      pathCount,
    }
  }

  const owners: UboSummaryEntry[] = [...totals.entries()]
    .map(([key, { fraction, pathCount }]) => {
      const node = graph.nodeByKey.get(key)
      if (!node) throw new EngineError(`Unknown party "${key}" in ownership path.`)
      return toEntry(node, fraction, pathCount)
    })
    .sort((a, b) => b.totalPercent - a.totalPercent || a.name.localeCompare(b.name))

  // A UBO is a natural person: qualifying by effective ownership, by the manual
  // control flag, or both. Controllers count even with no path to the target.
  const ubos: UboSummaryEntry[] = owners.filter(
    (owner) =>
      owner.type === 'individual' && (atLeast(owner.totalPercent, threshold) || owner.isController),
  )
  for (const node of graph.nodes) {
    if (node.type !== 'individual' || !node.isController) continue
    if (ubos.some((ubo) => ubo.key === node.key)) continue
    ubos.push(toEntry(node, 0, 0))
  }
  ubos.sort((a, b) => b.totalPercent - a.totalPercent || a.name.localeCompare(b.name))

  const shares = sharesOfTarget(graph, target.key)
  const intermediaries: IntermediaryCompany[] = graph.nodes
    .filter((node) => node.type === 'company' && node.key !== target.key)
    .map((node) => ({
      key: node.key,
      name: node.name,
      effectivePercent: round2((shares.get(node.key) ?? 0) * 100),
    }))
    .filter(
      (company) => company.effectivePercent > 0 && atLeast(company.effectivePercent, threshold),
    )
    .sort((a, b) => b.effectivePercent - a.effectivePercent || a.name.localeCompare(b.name))

  // A qualifying stake that runs into a company with no owners entered: the
  // chain stops there, so the real beneficial owner behind it is unknown.
  const unidentified: UnidentifiedOwnerGap[] = graph.nodes
    .filter(
      (node) =>
        node.type === 'company' &&
        node.key !== target.key &&
        ownersOf(graph, node.key).length === 0,
    )
    .map((node) => ({
      key: node.key,
      name: node.name,
      effectivePercent: round2((shares.get(node.key) ?? 0) * 100),
    }))
    .filter((gap) => gap.effectivePercent > 0 && atLeast(gap.effectivePercent, threshold))
    .sort((a, b) => b.effectivePercent - a.effectivePercent || a.name.localeCompare(b.name))

  return {
    target,
    graph,
    threshold,
    paths,
    owners,
    ubos,
    intermediaries,
    unidentified,
    entityCount: graph.nodes.length,
    pathCount: paths.length,
  }
}
