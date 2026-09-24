import { isRoleValid, type EntityKind } from './kinds'
import type {
  GraphLink,
  OwnershipGraph,
  OwnershipLinkInput,
  PartyNode,
  PartyType,
  RoleHolderInput,
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
 * The kind of every shareholder named on the left of a row, keyed by name.
 *
 * Resolved per shareholder rather than per row: a party is a trust everywhere
 * or nowhere, so marking it once is enough and a row typed before the kind was
 * set still follows it. The first non-company declaration wins; a second,
 * different one is reported by validation rather than silently overriding.
 *
 * A kind only means anything for a non-natural person, so a row whose owner is
 * an individual is not read — a person cannot be a foundation.
 */
export function resolveOwnerKinds(links: OwnershipLinkInput[]): Map<string, EntityKind> {
  const kinds = new Map<string, EntityKind>()
  for (const link of links) {
    const key = toKey(link.ownerName)
    if (key === '' || link.ownerType !== 'company') continue
    const declared = link.ownerKind ?? 'company'
    if (declared !== 'company' && !kinds.has(key)) kinds.set(key, declared)
  }
  return kinds
}

/** The role-holder entries on a row that actually name somebody. */
export function namedRoleHolders(link: OwnershipLinkInput): RoleHolderInput[] {
  return (link.roleHolders ?? []).filter((holder) => normaliseName(holder.name) !== '')
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
  const kinds = resolveOwnerKinds(links)
  /** Role links already emitted, keyed person|structure|role — see below. */
  const seenRoles = new Map<string, GraphLink>()

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

    const nomineeTicked = link.ownerIsNominee ?? false
    /*
     * A control claim, once the rows that cannot carry one are excluded. Shares
     * held on paper for somebody else are the opposite claim to holding control
     * of them, so a nominee row never flags its owner as a controller — on the
     * link, or on the person.
     */
    const claimsControl = !nomineeTicked && link.ownerIsController

    const owner = upsert(link.ownerName, link.ownerType, claimsControl)
    const entity = upsert(link.entityName, 'company', false)
    const control = isControlRow(link)

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
      // An empty percentage on a control row normalises to a clean 0.
      percent: control ? 0 : link.percent,
      isControl: control,
      declaredController: claimsControl && link.ownerType === 'individual',
      isRole: false,
      role: null,
      roleMarkedUbo: false,
      nominatorKey,
    })

    /*
     * The people behind a trust, foundation or NPO shareholder, entered inline
     * on its row. They hold a position in that structure, never a shareholding,
     * so the link runs into the shareholder and carries no percentage.
     *
     * One structure can be a shareholder on several rows, and the builder keeps
     * its people in step across all of them, so each role is emitted once: a
     * repeat across rows is one fact stated twice, not two facts. A repeat
     * within a single row's list is a mistake, and validation says so.
     */
    const ownerKind = kinds.get(owner.key) ?? 'company'
    if (ownerKind === 'company') continue
    for (const holder of namedRoleHolders(link)) {
      const role = isRoleValid(ownerKind, holder.role) ? holder.role : null
      const holderType = holder.type ?? 'individual'
      /*
       * The tick is a decision about the person, so it survives the merge: if
       * any row marks them a beneficial owner they are one, rather than
       * whichever row happened to be read first deciding it.
       */
      const markedUbo = holderType === 'individual' && (holder.isUbo ?? false)
      const signature = `${toKey(holder.name)}>${owner.key}>${role ?? ''}`
      const existing = seenRoles.get(signature)
      if (existing) {
        if (markedUbo) existing.roleMarkedUbo = true
        continue
      }
      const person = upsert(holder.name, holderType, false)
      const roleLink: GraphLink = {
        id: `${link.id}:${holder.id}`,
        ownerKey: person.key,
        entityKey: owner.key,
        percent: 0,
        isControl: false,
        declaredController: false,
        isRole: true,
        role,
        roleMarkedUbo: markedUbo,
        nominatorKey: null,
      }
      seenRoles.set(signature, roleLink)
      graphLinks.push(roleLink)
    }
  }

  // The controller flag only means anything for a natural person.
  for (const node of nodeByKey.values()) {
    if (node.type === 'company') node.isController = false
  }

  /*
   * A company that owns nothing is a candidate for the Meydan FZ company.
   * Control and role links are not shareholdings, so neither disqualifies a
   * candidate, and a trust or foundation is never the company being analysed —
   * a shareholder is the only side of a row it can be entered on.
   *
   * A nominee holding disqualifies *both* ends: the nominator, who owns it
   * beneficially, and the nominee, who owns it on paper. A nominee company
   * holds shares in something, and a company that holds shares in something is
   * not the company we are analysing — however little of it is really theirs.
   */
  const owners = new Set<string>()
  for (const link of graphLinks) {
    if (!isEconomic(link)) continue
    owners.add(link.ownerKey)
    owners.add(beneficialOwnerKey(link))
  }
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
