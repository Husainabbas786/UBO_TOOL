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
  return link.percent === 0 || !Number.isFinite(link.percent)
}

/**
 * Turns builder rows into a de-duplicated graph. A name that appears on both
 * sides of the arrows is one node, and a party seen as a company anywhere stays
 * a company — the entity side of a link is always a company by definition.
 *
 * Rows with a blank name on either side are skipped; validation reports those.
 */
export function buildGraph(links: OwnershipLinkInput[]): OwnershipGraph {
  const nodeByKey = new Map<string, PartyNode>()
  const graphLinks: GraphLink[] = []

  const upsert = (rawName: string, type: PartyType, isController: boolean): PartyNode => {
    const key = toKey(rawName)
    const existing = nodeByKey.get(key)
    if (!existing) {
      const node: PartyNode = { key, name: normaliseName(rawName), type, isController }
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

    const owner = upsert(link.ownerName, link.ownerType, link.ownerIsController)
    const entity = upsert(link.entityName, 'company', false)
    const control = isControlRow(link)
    graphLinks.push({
      id: link.id,
      ownerKey: owner.key,
      entityKey: entity.key,
      // An empty percentage on a control row normalises to a clean 0.
      percent: control ? 0 : link.percent,
      isControl: control,
      declaredController: link.ownerType === 'individual' && link.ownerIsController,
    })
  }

  // The controller flag only means anything for a natural person.
  for (const node of nodeByKey.values()) {
    if (node.type === 'company') node.isController = false
  }

  // A control-only link is not a shareholding, so it does not stop a company
  // from being the target.
  const owners = new Set(graphLinks.filter((l) => !l.isControl).map((link) => link.ownerKey))
  const nodes = [...nodeByKey.values()]

  return {
    nodes,
    nodeByKey,
    links: graphLinks,
    targetCandidates: nodes.filter((n) => n.type === 'company' && !owners.has(n.key)),
  }
}

/**
 * Shareholdings in `key` — who owns this party. Control-only links are excluded:
 * they carry no economic interest, so no ownership calculation should see them.
 */
export function ownersOf(graph: OwnershipGraph, key: string): GraphLink[] {
  return graph.links.filter((link) => link.entityKey === key && !link.isControl)
}

/** Shareholdings held by `key` — what this party owns. Excludes control links. */
export function holdingsOf(graph: OwnershipGraph, key: string): GraphLink[] {
  return graph.links.filter((link) => link.ownerKey === key && !link.isControl)
}

/** The control-only links, which the chart draws as dashed edges. */
export function controlLinks(graph: OwnershipGraph): GraphLink[] {
  return graph.links.filter((link) => link.isControl)
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
