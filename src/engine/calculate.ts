import { atLeast, round2 } from './format'
import { entityKindLabel } from './kinds'
import { beneficialOwnerKey, buildGraph, holdingsOf, ownersOf } from './normalize'
import { validate } from './validate'
import {
  EngineError,
  type CalculationResult,
  type ExcludedController,
  type ExcludedRoleHolder,
  type IntermediaryCompany,
  type OwnershipGraph,
  type OwnershipLinkInput,
  type OwnershipPath,
  type PartyNode,
  type RelatedPartyGroup,
  type RelatedPartyLinkInput,
  type RoleClaim,
  type UboBasis,
  type UboBasisPart,
  type UboSummaryEntry,
  type UnidentifiedOwnerGap,
} from './types'

/** The two thresholds the tool offers, per MOE risk rating. */
export const THRESHOLDS = [
  { value: 25, label: '25% (standard, low and medium risk)' },
  { value: 10, label: '10% (high risk, enhanced due diligence)' },
] as const

export const DEFAULT_THRESHOLD = 25

export interface CalculateOptions {
  /** Node key of the company being analysed. */
  targetKey: string
  /** Qualifying percentage; effective % >= threshold is a UBO. */
  threshold: number
  /** Parties the agent has linked to be assessed together. */
  relatedParties?: RelatedPartyLinkInput[]
}

/** The target the UI should preselect: the first company that owns nothing. */
export function defaultTargetKey(graph: OwnershipGraph): string | null {
  return graph.targetCandidates[0]?.key ?? null
}

/** Raw (unrounded) path, kept at full precision until the very last step. */
interface RawPath {
  ownerKey: string
  chainKeys: string[]
  /** Display label per chain step, which may name the nominee used at that step. */
  chainLabels: string[]
  fraction: number
}

/**
 * Every route from an ultimate owner down to the target. An ultimate owner is a
 * party nobody owns, which is why the sample structure yields three paths and
 * not four — XYZ Ltd is owned by Husain and Dinesh, so it is not an endpoint.
 *
 * Steps are walked beneficially: a parcel held by a nominee continues up to the
 * nominator, so the nominee is never an endpoint and never holds a stake. The
 * step is labelled with the nominee's name, because the paths table is the one
 * place the arrangement is recorded line by line.
 *
 * Assumes the graph is acyclic; validate() rejects loops before we get here.
 */
function enumeratePaths(graph: OwnershipGraph, targetKey: string): RawPath[] {
  const found: RawPath[] = []
  const maxDepth = graph.nodes.length + 1
  const nameOf = (key: string): string => graph.nodeByKey.get(key)?.name ?? key

  const walk = (
    key: string,
    fraction: number,
    chainKeys: string[],
    chainLabels: string[],
    depth: number,
  ): void => {
    if (depth > maxDepth) {
      throw new EngineError('Ownership chain is longer than the number of parties entered.')
    }
    const owners = ownersOf(graph, key)
    if (owners.length === 0) {
      if (chainKeys.length > 1) found.push({ ownerKey: key, chainKeys, chainLabels, fraction })
      return
    }
    for (const link of owners) {
      const holderKey = beneficialOwnerKey(link)
      const label =
        link.nominatorKey === null
          ? nameOf(holderKey)
          : `${nameOf(holderKey)} (via nominee ${nameOf(link.ownerKey)})`
      walk(
        holderKey,
        (fraction * link.percent) / 100,
        [holderKey, ...chainKeys],
        [label, ...chainLabels],
        depth + 1,
      )
    }
  }

  walk(targetKey, 1, [targetKey], [nameOf(targetKey)], 0)
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

/** Basis parts, always in the same order, joined for display. */
const BASIS_ORDER: UboBasisPart[] = ['Ownership', 'Control', 'Role', 'Related-party aggregation']

function basisFrom(parts: Set<UboBasisPart>): UboBasis {
  const ordered = BASIS_ORDER.filter((part) => parts.has(part))
  return ordered.length > 0 ? ordered.join(' + ') : 'Ownership'
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
  const relatedParties = options.relatedParties ?? []
  const validation = validate(links, graph, relatedParties, options.targetKey)
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

  const shares = sharesOfTarget(graph, target.key)
  /** Effective % of the target held by a party, rounded the way it is shown. */
  const shareOf = (key: string): number => round2((shares.get(key) ?? 0) * 100)

  const rawPaths = enumeratePaths(graph, target.key)

  /** Non-commercial entities whose role-holders have actually been entered. */
  const entitiesWithRoles = new Set(
    graph.links.filter((link) => link.isRole).map((link) => link.entityKey),
  )

  const paths: OwnershipPath[] = rawPaths
    .map((raw): OwnershipPath => {
      const effectivePercent = round2(raw.fraction * 100)
      const node = graph.nodeByKey.get(raw.ownerKey)
      const ownerType = node?.type ?? 'individual'
      return {
        ownerKey: raw.ownerKey,
        ownerName: nameOf(raw.ownerKey),
        ownerType,
        chain: raw.chainLabels,
        effectivePercent,
        // A company at the end of a chain is a gap in the structure, not a UBO —
        // unless it is a trust or foundation whose role-holders were captured,
        // which is how a non-commercial structure legitimately ends a chain.
        status:
          ownerType === 'company'
            ? entitiesWithRoles.has(raw.ownerKey)
              ? 'Role holders identified'
              : 'No owners entered'
            : atLeast(effectivePercent, threshold)
              ? 'UBO'
              : 'Below threshold',
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

  /*
   * Which companies each flagged person controls.
   *
   * A dedicated control-only row is the clearest statement of intent, so those
   * win outright. Only when someone has none do we fall back to the rows where
   * the box happens to be ticked — the checkbox syncs across every row for the
   * same person, so treating all of them as control claims would overstate it.
   */
  const controlOnly = new Map<string, string[]>()
  const declaredOn = new Map<string, string[]>()
  for (const link of graph.links) {
    if (!link.declaredController) continue
    const bucket = link.isControl ? controlOnly : declaredOn
    const list = bucket.get(link.ownerKey) ?? []
    if (!list.includes(link.entityKey)) list.push(link.entityKey)
    bucket.set(link.ownerKey, list)
  }
  const controlsFor = (key: string): string[] =>
    controlOnly.get(key) ?? declaredOn.get(key) ?? []

  /*
   * Control only reaches the target through a company that matters.
   *
   * Controlling the target company is control of the target, full stop. But
   * controlling an intermediary only carries down to the target if that
   * intermediary itself holds a qualifying stake — the same test, and the same
   * effective %, that puts it on the screening list. Control of a company that
   * holds 2% of the target does not make anyone a beneficial owner of it, so
   * switching the threshold can legitimately change who qualifies.
   */
  const reachesTarget = (entityKey: string): boolean =>
    entityKey === target.key || atLeast(shareOf(entityKey), threshold)

  const qualifyingControlKeys = (key: string): string[] =>
    controlsFor(key).filter(reachesTarget)

  /*
   * Roles in a trust, foundation or NPO, gated exactly like control.
   *
   * A settlor of a trust that holds 80% of the Meydan FZ company is a
   * beneficial owner of it; a settlor of a trust holding 2% is not. Same test,
   * same effective %, so the two manual routes to UBO status behave alike and
   * there is only one rule for a reviewer to learn.
   */
  const roleClaimsFor = new Map<string, RoleClaim[]>()
  for (const link of graph.links) {
    if (!link.isRole || link.role === null) continue
    const entity = graph.nodeByKey.get(link.entityKey)
    if (!entity) continue
    const list = roleClaimsFor.get(link.ownerKey) ?? []
    list.push({
      entityKey: link.entityKey,
      entityName: entity.name,
      entityKind: entity.entityKind,
      role: link.role,
      effectivePercent: shareOf(link.entityKey),
    })
    roleClaimsFor.set(link.ownerKey, list)
  }
  const qualifyingRoles = (key: string): RoleClaim[] =>
    (roleClaimsFor.get(key) ?? []).filter((claim) => reachesTarget(claim.entityKey))

  const toEntry = (node: PartyNode, fraction: number, pathCount: number): UboSummaryEntry => {
    const totalPercent = round2(fraction * 100)
    const controls = qualifyingControlKeys(node.key).map(nameOf)
    const roles = qualifyingRoles(node.key)
    const parts = new Set<UboBasisPart>()
    if (atLeast(totalPercent, threshold)) parts.add('Ownership')
    if (controls.length > 0) parts.add('Control')
    if (roles.length > 0) parts.add('Role')
    return {
      key: node.key,
      name: node.name,
      type: node.type,
      totalPercent,
      basis: basisFrom(parts),
      isController: node.isController,
      controls,
      roles,
      relatedGroupIds: [],
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

  // A UBO is a natural person: qualifying by effective ownership, by qualifying
  // control, or by a qualifying role. Control and roles count even with no
  // ownership path to the target at all.
  const ubos: UboSummaryEntry[] = owners.filter(
    (owner) =>
      owner.type === 'individual' &&
      (atLeast(owner.totalPercent, threshold) ||
        owner.controls.length > 0 ||
        owner.roles.length > 0),
  )
  for (const node of graph.nodes) {
    if (node.type !== 'individual') continue
    if (qualifyingControlKeys(node.key).length === 0 && qualifyingRoles(node.key).length === 0) {
      continue
    }
    if (ubos.some((ubo) => ubo.key === node.key)) continue
    ubos.push(toEntry(node, 0, 0))
  }

  const relatedGroups = buildRelatedGroups(graph, relatedParties, shares, rawPaths, threshold)
  promoteRelatedParties(graph, relatedGroups, ubos, owners, toEntry)

  ubos.sort((a, b) => b.totalPercent - a.totalPercent || a.name.localeCompare(b.name))

  /*
   * A member lifted over the line by a related-party group holds less than the
   * threshold on their own, so every path of theirs reads "Below threshold"
   * while the summary lists them as a beneficial owner. Two blocks of the same
   * report contradicting each other is the kind of thing a reviewer stops at,
   * so the status says both: this stake falls short, the person is captured.
   *
   * Only those promoted *solely* by a group are relabelled — anyone who
   * qualifies on their own stake keeps the plain "UBO" their paths already had.
   */
  const groupOnlyKeys = new Set(
    ubos.filter((ubo) => ubo.basis === 'Related-party aggregation').map((ubo) => ubo.key),
  )
  for (const path of paths) {
    if (path.status === 'Below threshold' && groupOnlyKeys.has(path.ownerKey)) {
      path.status = 'Below threshold (UBO via group)'
    }
  }

  /*
   * Why a badged controller is not on the list.
   *
   * The chart marks everyone who was flagged, so a person whose control does
   * not reach the target appears there with a Control badge and no UBO
   * highlight. Left at that, a reviewer sees the badge and finds nothing
   * anywhere saying why it did not count. These entries carry the reason.
   */
  const uboKeys = new Set(ubos.map((ubo) => ubo.key))
  const excludedControllers: ExcludedController[] = graph.nodes
    .filter((node) => node.type === 'individual' && node.isController && !uboKeys.has(node.key))
    .map((node) => ({
      key: node.key,
      name: node.name,
      companies: controlsFor(node.key).map((entityKey) => ({
        name: nameOf(entityKey),
        effectivePercent: shareOf(entityKey),
      })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  /** The same explanation, for a role-holder whose trust sits below the threshold. */
  const excludedRoleHolders: ExcludedRoleHolder[] = graph.nodes
    .filter(
      (node) =>
        node.type === 'individual' &&
        (roleClaimsFor.get(node.key)?.length ?? 0) > 0 &&
        !uboKeys.has(node.key),
    )
    .map((node) => ({
      key: node.key,
      name: node.name,
      entities: (roleClaimsFor.get(node.key) ?? []).map((claim) => ({
        name: claim.entityName,
        kindLabel: entityKindLabel(claim.entityKind),
        role: claim.role,
        effectivePercent: shareOf(claim.entityKey),
      })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const intermediaries: IntermediaryCompany[] = graph.nodes
    .filter((node) => node.type === 'company' && node.key !== target.key)
    .map((node) => ({
      key: node.key,
      name: node.name,
      effectivePercent: shareOf(node.key),
    }))
    .filter(
      (company) => company.effectivePercent > 0 && atLeast(company.effectivePercent, threshold),
    )
    .sort((a, b) => b.effectivePercent - a.effectivePercent || a.name.localeCompare(b.name))

  // A qualifying stake that runs into a company with no owners entered: the
  // chain stops there, so the real beneficial owner behind it is unknown. A
  // trust or foundation with its role-holders entered is not such a gap.
  const unidentified: UnidentifiedOwnerGap[] = graph.nodes
    .filter(
      (node) =>
        node.type === 'company' &&
        node.key !== target.key &&
        ownersOf(graph, node.key).length === 0 &&
        !entitiesWithRoles.has(node.key),
    )
    .map((node) => ({
      key: node.key,
      name: node.name,
      effectivePercent: shareOf(node.key),
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
    excludedControllers,
    excludedRoleHolders,
    relatedGroups,
    entityCount: graph.nodes.length,
    pathCount: paths.length,
  }
}

/**
 * Merges the agent's links into groups and sums each group's stake.
 *
 * Links chain, so the groups are the connected components of the links: A–B and
 * B–C is one group of three, not two groups of two. Summing is done on the
 * unrounded fractions and rounded once, the same as everywhere else.
 */
function buildRelatedGroups(
  graph: OwnershipGraph,
  relatedParties: RelatedPartyLinkInput[],
  shares: Map<string, number>,
  rawPaths: RawPath[],
  threshold: number,
): RelatedPartyGroup[] {
  const parent = new Map<string, string>()
  const find = (key: string): string => {
    let root = key
    while (parent.get(root) !== undefined && parent.get(root) !== root) root = parent.get(root)!
    return root
  }
  const union = (a: string, b: string) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent.set(rootA, rootB)
  }

  const labelsByKey = new Map<string, string[]>()

  for (const group of relatedParties) {
    const keys = group.memberNames
      .map((name) => name.trim().replace(/\s+/g, ' ').toLowerCase())
      .filter((key) => key !== '' && graph.nodeByKey.has(key))
    const distinct = [...new Set(keys)]
    if (distinct.length < 2) continue

    for (const key of distinct) if (!parent.has(key)) parent.set(key, key)
    for (let index = 1; index < distinct.length; index += 1) union(distinct[0]!, distinct[index]!)

    const label = group.label.trim()
    for (const key of distinct) {
      const list = labelsByKey.get(key) ?? []
      if (label !== '' && !list.includes(label)) list.push(label)
      labelsByKey.set(key, list)
    }
  }

  const components = new Map<string, string[]>()
  for (const key of parent.keys()) {
    const root = find(key)
    const list = components.get(root) ?? []
    list.push(key)
    components.set(root, list)
  }

  /** Every party that appears on an individual member's own chain. */
  const chainKeysFor = (key: string): Set<string> => {
    const keys = new Set<string>()
    for (const raw of rawPaths) {
      if (raw.ownerKey !== key) continue
      for (const step of raw.chainKeys) keys.add(step)
    }
    return keys
  }

  return [...components.values()]
    .map((memberKeys): RelatedPartyGroup => {
      const sorted = [...memberKeys].sort()
      const members = sorted
        .map((key) => {
          const node = graph.nodeByKey.get(key)!
          return {
            key,
            name: node.name,
            type: node.type,
            effectivePercent: round2((shares.get(key) ?? 0) * 100),
          }
        })
        .sort((a, b) => b.effectivePercent - a.effectivePercent || a.name.localeCompare(b.name))

      const fraction = sorted.reduce((sum, key) => sum + (shares.get(key) ?? 0), 0)
      const totalPercent = round2(fraction * 100)
      const individualFraction = sorted
        .filter((key) => graph.nodeByKey.get(key)?.type === 'individual')
        .reduce((sum, key) => sum + (shares.get(key) ?? 0), 0)

      const labels: string[] = []
      for (const key of sorted) {
        for (const label of labelsByKey.get(key) ?? []) {
          if (!labels.includes(label)) labels.push(label)
        }
      }

      // Does a company member sit on an individual member's chain? Then their
      // stakes overlap and the sum counts the same shares twice.
      const companyKeys = sorted.filter((key) => graph.nodeByKey.get(key)?.type === 'company')
      const overlaps = sorted.some((key) => {
        if (graph.nodeByKey.get(key)?.type !== 'individual') return false
        const chain = chainKeysFor(key)
        return companyKeys.some((company) => chain.has(company))
      })

      return {
        id: sorted.join('|'),
        label: labels.join(' / '),
        members,
        totalPercent,
        qualifies: atLeast(totalPercent, threshold),
        qualifiedViaCompanyMember:
          atLeast(totalPercent, threshold) && !atLeast(round2(individualFraction * 100), threshold),
        overlaps,
      }
    })
    .sort((a, b) => b.totalPercent - a.totalPercent || a.id.localeCompare(b.id))
}

/**
 * Adds the members of a qualifying group to the UBO list.
 *
 * Aggregation only ever adds: nobody is removed, and anyone who already
 * qualified keeps the basis they qualified on. Two parties are never promoted —
 * a company, because a beneficial owner is a natural person, and a nominee with
 * no stake of their own, because the shares they hold are somebody else's and
 * being linked to a relative cannot change that.
 */
function promoteRelatedParties(
  graph: OwnershipGraph,
  groups: RelatedPartyGroup[],
  ubos: UboSummaryEntry[],
  owners: UboSummaryEntry[],
  toEntry: (node: PartyNode, fraction: number, pathCount: number) => UboSummaryEntry,
): void {
  for (const group of groups) {
    if (!group.qualifies) continue
    for (const member of group.members) {
      const node = graph.nodeByKey.get(member.key)
      if (!node || node.type !== 'individual') continue
      // A nominee holding shares for somebody else has no stake of their own,
      // and being linked to a relative cannot give them one.
      if (node.isNominee && member.effectivePercent === 0) continue

      const existing = ubos.find((ubo) => ubo.key === member.key)
      if (existing) {
        if (!existing.relatedGroupIds.includes(group.id)) existing.relatedGroupIds.push(group.id)
        continue
      }

      /*
       * Reuse their entry from the owners list so their real path count and
       * effective % carry over, but as a copy: the owners list records what
       * each party holds on their own, and aggregation must not rewrite it.
       */
      const base = owners.find((owner) => owner.key === member.key)
      const entry: UboSummaryEntry = base
        ? { ...base, controls: [...base.controls], roles: [...base.roles], relatedGroupIds: [] }
        : toEntry(node, 0, 0)
      // Their own stake fell short: aggregation is the whole basis.
      entry.basis = 'Related-party aggregation'
      entry.relatedGroupIds.push(group.id)
      ubos.push(entry)
    }
  }
}
