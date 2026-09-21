import {
  TOTAL_TOLERANCE,
  buildGraph,
  isRoleValid,
  type EntityKind,
  type OwnershipLinkInput,
  type PartyType,
  type RelatedPartyLinkInput,
  type RoleName,
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
  /** Always set on a row, unlike the engine input where it is optional. */
  entityKind: EntityKind
  role: RoleName | null
  ownerIsNominee: boolean
  nominatorName: string
  nominatorType: PartyType
}

/** One related-party link in the aggregation section. */
export interface RelatedRowState extends RelatedPartyLinkInput {}

let counter = 0

function nextId(prefix = 'row'): string {
  counter += 1
  return `${prefix}-${counter}`
}

export function blankRow(entityName = '', entityKind: EntityKind = 'company'): LinkRowState {
  return {
    id: nextId(),
    ownerName: '',
    ownerType: 'individual',
    ownerIsController: false,
    percent: Number.NaN,
    percentText: '',
    entityName,
    entityPrefilled: entityName !== '',
    entityKind,
    role: null,
    ownerIsNominee: false,
    nominatorName: '',
    nominatorType: 'individual',
  }
}

export function blankRelatedRow(): RelatedRowState {
  return { id: nextId('related'), memberNames: ['', ''], label: '' }
}

/** Typing in the company field makes the name the user's own. */
export function withEntityName(row: LinkRowState, entityName: string): LinkRowState {
  return { ...row, entityName, entityPrefilled: false }
}

/**
 * Changing what the entity is.
 *
 * A role that does not belong to the new kind is dropped — Trustee means
 * nothing to a foundation — but nothing else is cleared. The percentage and the
 * flags are simply not read on a role row, so switching back and forth is
 * reversible and never loses what the agent typed.
 */
export function withEntityKind(row: LinkRowState, entityKind: EntityKind): LinkRowState {
  return {
    ...row,
    entityKind,
    role: isRoleValid(entityKind, row.role) ? row.role : null,
  }
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

/**
 * Ticking Nominee drops the controller flag: shares held on paper for somebody
 * else are the opposite claim to holding control of them.
 */
export function withNominee(row: LinkRowState, ownerIsNominee: boolean): LinkRowState {
  return {
    ...row,
    ownerIsNominee,
    ownerIsController: ownerIsNominee ? false : row.ownerIsController,
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

/** A related-party link nobody has started — ignored rather than reported. */
export function isRelatedRowDirty(row: RelatedRowState): boolean {
  return row.memberNames.some((name) => name.trim() !== '') || row.label.trim() !== ''
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
 * A trust, foundation or NPO is never suggested: it has no shares, so it can
 * never reach 100% and would hold the prompt there for ever.
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
    // Control and roles carry no shareholding, so they never complete a company.
    if (link.isControl || link.isRole || !Number.isFinite(link.percent)) continue
    totals.set(link.entityKey, (totals.get(link.entityKey) ?? 0) + link.percent)
  }

  const companies = graph.nodes.filter(
    (node) => node.type === 'company' && node.entityKind === 'company',
  )
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
    ...blankRow(),
    ...link,
    id: nextId(),
    percentText: String(link.percent),
    entityPrefilled: false,
  }))
}
