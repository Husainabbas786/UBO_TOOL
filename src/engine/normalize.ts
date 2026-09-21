import { isRoleValid, type EntityKind } from './kinds'
import type {
  GraphLink,
  OwnershipGraph,
  OwnershipLinkInput,
  PartyNode,
  PartyType,
} from './types'

/** Display form: trimmed, with runs of whitespace collapsed to one space. */
export function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

/** Identity form: names match case-insensitively once normalised. */
export function toKey(name: string): string {
  return normaliseName(name).toLowerCase()
}

/**
 * A control-only row: a person flagged as a controller who holds no shares.
 *
 * The percentage may be 0 or left empty. A first-time user types the name and
 * ticks the box without ever touching the percent field, and that has to work
 * exactly as well as typing a 0 first.
 */
export function isControlRow(link: OwnershipLinkInput): boolean {
  if (link.ownerType !== 'individual' || !link.ownerIsController) return false
  if (link.ownerIsNominee) return false
  return link.percent === 0 || !Number.isFinite(link.percent)
}

/**
 * The kind of every entity named on the right of a row, keyed by name.
 *
 * Resolved per entity rather than per row: a company is a trust everywhere or
 * nowhere, so marking it once is enough and a row typed before the kind was set
 * still becomes a role row. The first non-company declaration wins; a second,
 * different one is reported by validation rather than silently overriding.
 */
export function resolveEntityKinds(links: OwnershipLinkInput[]): Map<string, EntityKind> {
  const kinds = new Map<string, EntityKind>()
  for (const link of links) {
    const key = toKey(link.entityName)
    if (key === '') continue
    const declared = link.entityKind ?? 'company'
    if (declared !== 'company' && !kinds.has(key)) kinds.set(key, declared)
  }
  return kinds
}

/**
 * Who a link's shares really belong to. For a nominee holding that is the
 * nominator; for everything else it is the owner as entered. Every ownership
 * calculation walks this, so a nominee never accumulates a stake of their own.
 */
export function beneficialOwnerKey(link: GraphLink): string {
  return link.nominatorKey ?? link.ownerKey
}

/** A link that carries an economic interest — not control, not a role. */
function isEconomic(link: GraphLink): boolean {
  return !link.isControl && !link.isRole
}

/**
 * Turns builder rows into a de-duplicated graph. A name that appears on both
 * sides of the arrows is one node, and a party seen as a company anywhere stays
 * a company — the entity side of a link is always a legal entity by definition.
 *
 * Rows with a blank name on either side are skipped; validation reports those.
 */
export function buildGraph(links: OwnershipLinkInput[]): OwnershipGraph {
  const nodeByKey = new Map<string, PartyNode>()
  const graphLinks: GraphLink[] = []
  const kinds = resolveEntityKinds(links)

  const upsert = (rawName: string, type: PartyType, isController: boolean): PartyNode => {
    const key = toKey(rawName)
    const existing = nodeByKey.get(key)
    if (!existing) {
      const node: PartyNode = {
        key,
        name: normaliseName(rawName),
        type,
        isController,
        entityKind: kinds.get(key) ?? 'company',
        isNominee: false,
      }
      nodeByKey.set(key, node)
      return node
    }
    // Company wins: a company that owns things is still a company.
    if (type === 'company') existing.type = 'company'
    if (isController) existing.isController = true
    return existing
  }

  for (const link of links) {
    if (normaliseName(link.ownerName) === '' || normaliseName(link.entityName) === '') continue

    const entityKey = toKey(link.entityName)
    const entityKind = kinds.get(entityKey) ?? 'company'
    // A role row states a position in a trust or foundation, never a holding,
    // so the controller and nominee flags on it are not read.
    const isRole = entityKind !== 'company'
    const nomineeTicked = !isRole && (link.ownerIsNominee ?? false)

    const owner = upsert(link.ownerName, link.ownerType, !isRole && link.ownerIsController)
    const entity = upsert(link.entityName, 'company', false)
    const control = isControlRow(link) && !isRole

    /*
     * The nominator, when one is named. A blank name or the nominee's own name
     * leaves the holding where it is and lets validation say so, rather than
     * quietly attributing the shares to nobody.
     */
    let nominatorKey: string | null = null
    if (nomineeTicked && normaliseName(link.nominatorName ?? '') !== '') {
      const nominator = upsert(
        link.nominatorName as string,
        link.nominatorType ?? 'individual',
        false,
      )
      if (nominator.key !== owner.key) nominatorKey = nominator.key
    }
    if (nominatorKey !== null) owner.isNominee = true

    graphLinks.push({
      id: link.id,
      ownerKey: owner.key,
      entityKey: entity.key,
      // An empty percentage on a control or role row normalises to a clean 0.
      percent: control || isRole ? 0 : link.percent,
      isControl: control,
      declaredController: !isRole && !nomineeTicked && link.ownerType === 'individual' && link.ownerIsController,
      isRole,
      role: isRole && isRoleValid(entityKind, link.role) ? link.role : null,
      nominatorKey,
    })
  }

  // The controller flag only means anything for a natural person.
  for (const node of nodeByKey.values()) {
    if (node.type === 'company') node.isController = false
  }

  /*
   * A company that owns nothing is a candidate for the Meydan FZ company.
   * Control and role links are not shareholdings, and a nominee's holding
   * belongs to its nominator, so none of the three disqualifies a candidate.
   * A trust or foundation is never the company being analysed.
   */
  const owners = new Set(graphLinks.filter(isEconomic).map(beneficialOwnerKey))
  const nodes = [...nodeByKey.values()]

  return {
    nodes,
    nodeByKey,
    links: graphLinks,
    targetCandidates: nodes.filter(
      (n) => n.type === 'company' && n.entityKind === 'company' && !owners.has(n.key),
    ),
  }
}

/**
 * Shareholdings in `key` — who owns this party. Control and role links are
 * excluded: they carry no economic interest, so no ownership calculation should
 * see them. Read the holder off each link with `beneficialOwnerKey`.
 */
export function ownersOf(graph: OwnershipGraph, key: string): GraphLink[] {
  return graph.links.filter((link) => link.entityKey === key && isEconomic(link))
}

/**
 * Shareholdings held by `key` — what this party owns, beneficially. A parcel
 * held through a nominee belongs to the nominator here, which is what keeps a
 * nominee from ever accumulating a stake.
 */
export function holdingsOf(graph: OwnershipGraph, key: string): GraphLink[] {
  return graph.links.filter((link) => isEconomic(link) && beneficialOwnerKey(link) === key)
}

/** The control-only links, which the chart draws as dashed edges. */
export function controlLinks(graph: OwnershipGraph): GraphLink[] {
  return graph.links.filter((link) => link.isControl)
}

/** The role links into trusts, foundations and NPOs. */
export function roleLinks(graph: OwnershipGraph): GraphLink[] {
  return graph.links.filter((link) => link.isRole)
}

/** The shareholdings held through a nominee, for the chart and the summary. */
export function nomineeLinks(graph: OwnershipGraph): GraphLink[] {
  return graph.links.filter((link) => link.nominatorKey !== null)
}

/**
 * Finds a cycle in the ownership graph, following links from owner to entity.
 * Returns the display names around the loop (`A -> B -> A`), or null if none.
 * Iterative so that a deep chain cannot overflow the stack.
 */
export function findCycle(graph: OwnershipGraph): string[] | null {
  const WHITE = 0
  const GREY = 1
  const BLACK = 2
  const colour = new Map<string, number>()
  for (const node of graph.nodes) colour.set(node.key, WHITE)

  const nameOf = (key: string) => graph.nodeByKey.get(key)?.name ?? key

  for (const start of graph.nodes) {
    if (colour.get(start.key) !== WHITE) continue

    const stack: Array<{ key: string; next: number; edges: GraphLink[] }> = [
      { key: start.key, next: 0, edges: holdingsOf(graph, start.key) },
    ]
    colour.set(start.key, GREY)

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!
      if (frame.next >= frame.edges.length) {
        colour.set(frame.key, BLACK)
        stack.pop()
        continue
      }
      const edge = frame.edges[frame.next]!
      frame.next += 1
      const nextKey = edge.entityKey

      if (colour.get(nextKey) === GREY) {
        // Found the back edge; unwind the stack to the start of the loop.
        const loopStart = stack.findIndex((f) => f.key === nextKey)
        return [...stack.slice(loopStart).map((f) => nameOf(f.key)), nameOf(nextKey)]
      }
      if (colour.get(nextKey) === WHITE) {
        colour.set(nextKey, GREY)
        stack.push({ key: nextKey, next: 0, edges: holdingsOf(graph, nextKey) })
      }
    }
  }

  return null
}
