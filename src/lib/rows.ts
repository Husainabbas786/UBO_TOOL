import {
  TOTAL_TOLERANCE,
  buildGraph,
  type OwnershipLinkInput,
  type PartyType,
} from '../engine'
import { SAMPLE_LINKS } from '../engine/sample'

/**
 * A builder row. It satisfies OwnershipLinkInput so it can be handed straight to
 * the engine, plus the raw text the user is typing into the percentage box —
 * a half-typed "3." must survive until they finish, so the draft is kept
 * alongside the parsed number rather than being re-derived from it.
 */
export interface LinkRowState extends OwnershipLinkInput {
  percentText: string
  /**
   * The company name was filled in for the user, not typed by them. It clears
   * the moment they edit the field, and it keeps a freshly added row counting
   * as untouched so a prefill does not fire off that row's inline errors.
   */
  entityPrefilled: boolean
}

let counter = 0

function nextId(): string {
  counter += 1
  return `row-${counter}`
}

export function blankRow(entityName = ''): LinkRowState {
  return {
    id: nextId(),
    ownerName: '',
    ownerType: 'individual',
    ownerIsController: false,
    percent: Number.NaN,
    percentText: '',
    entityName,
    entityPrefilled: entityName !== '',
  }
}

/** Typing in the company field makes the name the user's own. */
export function withEntityName(row: LinkRowState, entityName: string): LinkRowState {
  return { ...row, entityName, entityPrefilled: false }
}

/** Parses the percentage box; blank or nonsense becomes NaN, which validation rejects. */
export function parsePercent(text: string): number {
  return text.trim() === '' ? Number.NaN : Number(text)
}

export function withPercentText(row: LinkRowState, percentText: string): LinkRowState {
  return { ...row, percentText, percent: parsePercent(percentText) }
}

/** Switching an owner to a company drops the controller flag, which is person-only. */
export function withOwnerType(row: LinkRowState, ownerType: PartyType): LinkRowState {
  return {
    ...row,
    ownerType,
    ownerIsController: ownerType === 'individual' ? row.ownerIsController : false,
  }
}

/** A row nobody has touched yet — we hold back its inline errors until they do. */
export function isRowDirty(row: LinkRowState): boolean {
  return (
    row.ownerName.trim() !== '' ||
    (!row.entityPrefilled && row.entityName.trim() !== '') ||
    row.percentText.trim() !== ''
  )
}

/**
 * The company whose shareholders the agent should be completing next.
 *
 * Companies are worked through one at a time, in the order they first appear,
 * with the Meydan FZ company itself always first — so its shareholders are
 * finished before the tool asks about the intermediaries behind them. A company
 * counts as still open until its shareholdings reach 100%, which is exactly the
 * rule that has to be satisfied before Calculate will run.
 *
 * Returns null when everything entered so far already totals 100%.
 */
export function nextCompanyToComplete(
  rows: LinkRowState[],
  targetKey: string | null,
): string | null {
  const graph = buildGraph(rows)

  const totals = new Map<string, number>()
  for (const link of graph.links) {
    // Control carries no shareholding, so it never completes a company.
    if (link.isControl || !Number.isFinite(link.percent)) continue
    totals.set(link.entityKey, (totals.get(link.entityKey) ?? 0) + link.percent)
  }

  const companies = graph.nodes.filter((node) => node.type === 'company')
  const ordered = [
    ...companies.filter((node) => node.key === targetKey),
    ...companies.filter((node) => node.key !== targetKey),
  ]

  const open = ordered.find((node) => (totals.get(node.key) ?? 0) < 100 - TOTAL_TOLERANCE)
  return open?.name ?? null
}

/** True until the agent has named a single company, when we still have to ask. */
export function hasNamedCompany(rows: LinkRowState[]): boolean {
  return buildGraph(rows).nodes.some((node) => node.type === 'company')
}

/** The CLAUDE.md sample structure, with fresh row ids. */
export function exampleRows(): LinkRowState[] {
  return SAMPLE_LINKS.map((link) => ({
    ...link,
    id: nextId(),
    percentText: String(link.percent),
    entityPrefilled: false,
  }))
}
