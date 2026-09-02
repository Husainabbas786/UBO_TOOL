/** A party is either a natural person or a legal entity. */
export type PartyType = 'individual' | 'company'

/**
 * One row of the Ownership Links builder: `owner` owns `percent` % of `entity`.
 * This is the only shape the UI has to produce; everything else is derived.
 */
export interface OwnershipLinkInput {
  /** Stable row id, used to attach validation errors back to the row. */
  id: string
  ownerName: string
  ownerType: PartyType
  /** Manual compliance flag: this person is a UBO by control, whatever they own. */
  ownerIsController: boolean
  percent: number
  /** Entities are always companies — an individual cannot be owned. */
  entityName: string
}

/** A de-duplicated party in the ownership graph. */
export interface PartyNode {
  /** Normalised identity: trimmed, whitespace-collapsed, lower-cased. */
  key: string
  /** Display name, in the spelling it was first entered with. */
  name: string
  type: PartyType
  isController: boolean
}

/** A link after name normalisation, pointing at node keys rather than names. */
export interface GraphLink {
  id: string
  ownerKey: string
  entityKey: string
  percent: number
  /**
   * A 0% link from a flagged individual: control without ownership. It carries
   * no economic interest, so it is excluded from ownership maths and from the
   * "owners must total 100%" rule, and drawn as a dashed edge on the chart.
   */
  isControl: boolean
}

export interface OwnershipGraph {
  nodes: PartyNode[]
  nodeByKey: ReadonlyMap<string, PartyNode>
  links: GraphLink[]
  /** Company nodes that own nothing — the candidates for "target entity". */
  targetCandidates: PartyNode[]
}

export type ValidationCode =
  | 'no-links'
  | 'too-many-links'
  | 'empty-owner-name'
  | 'empty-entity-name'
  | 'invalid-percent'
  | 'percent-precision'
  | 'self-ownership'
  | 'duplicate-link'
  | 'individual-owned'
  | 'type-conflict'
  | 'totals-not-100'
  | 'circular-ownership'
  | 'no-target'

export interface ValidationIssue {
  code: ValidationCode
  message: string
  /** Set when the issue belongs to a single builder row. */
  linkId?: string
  /** Set when the issue belongs to a party rather than a row. */
  nodeKey?: string
}

export interface ValidationResult {
  ok: boolean
  /** Blocking problems — Calculate stays disabled while any exist. */
  errors: ValidationIssue[]
  /** Non-blocking notes, e.g. the 50-link soft cap. */
  warnings: ValidationIssue[]
}

/**
 * A beneficial owner is always a natural person, so a company is never labelled
 * 'UBO'. A company only reaches the end of a chain when its own owners were
 * never entered, and that is what 'No owners entered' says.
 */
export type UboStatus = 'UBO' | 'Below threshold' | 'No owners entered'
export type UboBasis = 'Ownership' | 'Control' | 'Ownership + Control'

/** One route from an ultimate owner down to the target entity. */
export interface OwnershipPath {
  ownerKey: string
  ownerName: string
  ownerType: PartyType
  /** Display names from the ultimate owner through to the target, inclusive. */
  chain: string[]
  /** Product of the percentages along the chain, rounded to 2 decimals. */
  effectivePercent: number
  status: UboStatus
}

/** One ultimate owner, with their paths aggregated. */
export interface UboSummaryEntry {
  key: string
  name: string
  type: PartyType
  /** Sum of this owner's path percentages, rounded to 2 decimals. */
  totalPercent: number
  basis: UboBasis
  isController: boolean
  pathCount: number
}

/** A company on a path to the target, to be screened in the ERP. */
export interface IntermediaryCompany {
  key: string
  name: string
  /** Effective % of the target held by this company, rounded to 2 decimals. */
  effectivePercent: number
}

/**
 * A qualifying stake that runs into a company whose own owners were never
 * entered — the chain stops there and the real beneficial owner is unknown.
 */
export interface UnidentifiedOwnerGap {
  key: string
  name: string
  /** Effective % of the target held by the company with no owners entered. */
  effectivePercent: number
}

export interface CalculationResult {
  target: PartyNode
  /** The de-duplicated graph the result was computed from, for the chart. */
  graph: OwnershipGraph
  threshold: number
  /** Every route from every ultimate owner to the target, highest % first. */
  paths: OwnershipPath[]
  /** Every ultimate owner, highest % first — UBO and below-threshold alike. */
  owners: UboSummaryEntry[]
  /** The subset of `owners` that qualifies, by ownership or by control. */
  ubos: UboSummaryEntry[]
  /** Companies at or above the threshold that sit between owners and target. */
  intermediaries: IntermediaryCompany[]
  /** Companies at or above the threshold whose own owners are missing. */
  unidentified: UnidentifiedOwnerGap[]
  /** Total parties considered, for the summary note. */
  entityCount: number
  /** Total paths considered, for the summary note. */
  pathCount: number
}

/** Thrown when calculate() is handed a structure that does not validate. */
export class EngineError extends Error {
  readonly issues: ValidationIssue[]
  constructor(message: string, issues: ValidationIssue[] = []) {
    super(message)
    this.name = 'EngineError'
    this.issues = issues
  }
}
