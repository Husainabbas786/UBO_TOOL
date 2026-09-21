import type { EntityKind, RoleName } from './kinds'

export type { EntityKind, RoleName }

/** A party is either a natural person or a legal entity. */
export type PartyType = 'individual' | 'company'

/**
 * One row of the Ownership Links builder: `owner` owns `percent` % of `entity`.
 * This is the only shape the UI has to produce; everything else is derived.
 *
 * Everything past `entityName` is optional, so a plain commercial shareholding
 * is still written exactly as it always was.
 */
export interface OwnershipLinkInput {
  /** Stable row id, used to attach validation errors back to the row. */
  id: string
  ownerName: string
  ownerType: PartyType
  /** Manual compliance flag: this person is a UBO by control, whatever they own. */
  ownerIsController: boolean
  percent: number
  /** Entities are legal entities — an individual cannot be owned. */
  entityName: string
  /**
   * What the entity is. Defaults to 'company'. Declared per row but resolved per
   * entity *name*: marking "XYZ Trust" a trust on one row makes it a trust on
   * every row it appears on, the same way the controller flag follows a person.
   */
  entityKind?: EntityKind
  /**
   * The owner's role in a non-commercial entity. Only read when the resolved
   * entity kind is a trust, foundation or NPO, where it replaces the percentage.
   */
  role?: RoleName | null
  /**
   * This shareholding is held on paper by the owner for someone else. The
   * percentage still counts towards the entity's 100%, but the ownership is
   * attributed to the nominator for every UBO purpose.
   *
   * Unlike the controller flag this is a property of the *shareholding*, not of
   * the person: the same person can hold one parcel as nominee and another in
   * their own right, and only the first is attributed away.
   */
  ownerIsNominee?: boolean
  /** The actual shareholder behind a nominee holding. */
  nominatorName?: string
  nominatorType?: PartyType
}

/**
 * Two or more parties the compliance agent has decided to assess together —
 * family members, or parties acting in concert. Their effective stakes are
 * summed against the threshold. Links chain: A–B and B–C form one group.
 */
export interface RelatedPartyLinkInput {
  id: string
  /** Names as entered; matched to parties case-insensitively. */
  memberNames: string[]
  /** Free text, e.g. "Spouses". May be empty. */
  label: string
}

/** A de-duplicated party in the ownership graph. */
export interface PartyNode {
  /** Normalised identity: trimmed, whitespace-collapsed, lower-cased. */
  key: string
  /** Display name, in the spelling it was first entered with. */
  name: string
  type: PartyType
  isController: boolean
  /** Only meaningful when `type` is 'company'; individuals are always 'company'. */
  entityKind: EntityKind
  /** Holds at least one parcel of shares on paper for someone else. */
  isNominee: boolean
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
  /** The Controller box was ticked on this row, whatever the percentage. */
  declaredController: boolean
  /**
   * A role in a trust, foundation or NPO. Like a control link it carries no
   * economic interest, so it is excluded from ownership maths and from the
   * 100% rule.
   */
  isRole: boolean
  role: RoleName | null
  /**
   * Set when the owner holds this parcel as a nominee: the shares are legally
   * theirs and still count towards the entity's 100%, but every ownership
   * calculation treats the nominator as the holder.
   */
  nominatorKey: string | null
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
  | 'role-required'
  | 'entity-kind-conflict'
  | 'nominator-required'
  | 'self-nomination'
  | 'related-party-too-few'
  | 'related-party-unknown'
  | 'related-party-target'

export interface ValidationIssue {
  code: ValidationCode
  message: string
  /** Set when the issue belongs to a single builder row. */
  linkId?: string
  /** Set when the issue belongs to a party rather than a row. */
  nodeKey?: string
  /** Set when the issue belongs to a related-party link. */
  relatedId?: string
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
export type UboStatus =
  | 'UBO'
  | 'Below threshold'
  | 'No owners entered'
  /** A trust, foundation or NPO whose role-holders have been captured instead. */
  | 'Role holders identified'

/**
 * The ways a person can qualify. A person can qualify on more than one, so
 * `UboBasis` is these parts joined with ' + ' in this order — "Ownership",
 * "Ownership + Control", "Role", and so on.
 */
export type UboBasisPart = 'Ownership' | 'Control' | 'Role' | 'Related-party aggregation'
export type UboBasis = string

/** A role held in a non-commercial entity, as captured on a role row. */
export interface RoleClaim {
  entityKey: string
  entityName: string
  entityKind: EntityKind
  role: RoleName
  /** The entity's own effective % of the target — what the gate was applied to. */
  effectivePercent: number
}

/** One route from an ultimate owner down to the target entity. */
export interface OwnershipPath {
  ownerKey: string
  ownerName: string
  ownerType: PartyType
  /**
   * Display names from the ultimate owner through to the target, inclusive. A
   * step held through a nominee is annotated "Husain (via nominee Ali Khan)",
   * so the paths table stays the full audit trail.
   */
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
  /**
   * The Controller box was ticked for this person somewhere. Whether that
   * control actually qualifies them as a UBO of the target is said by `basis`:
   * control of an intermediary only counts when the intermediary itself holds
   * a qualifying stake.
   */
  isController: boolean
  /**
   * The companies whose control qualifies this person, in display spelling —
   * the target itself, and any intermediary at or above the threshold.
   */
  controls: string[]
  /**
   * The roles that qualify this person, gated exactly like control: a role in
   * the Meydan FZ company itself always counts, a role in a non-commercial
   * intermediary only when that intermediary's own stake clears the threshold.
   */
  roles: RoleClaim[]
  /**
   * Ids of the qualifying related-party groups this person belongs to. Set for
   * every individual member of a qualifying group, including those who are
   * already UBOs in their own right — aggregation only ever adds.
   */
  relatedGroupIds: string[]
  pathCount: number
}

/**
 * A set of parties the agent linked together, with their stakes summed. Groups
 * are connected components: linking A–B and B–C yields one group of three.
 */
export interface RelatedPartyGroup {
  /** Stable id derived from the member keys. */
  id: string
  /** The relationship labels from the links that formed this group. */
  label: string
  members: Array<{ key: string; name: string; type: PartyType; effectivePercent: number }>
  /** Sum of the members' effective stakes, rounded once at the end. */
  totalPercent: number
  qualifies: boolean
  /**
   * The group only reaches the threshold because a company member's stake was
   * counted. The natural-person rule still applies, so the company itself is
   * not labelled a UBO — flagged here so a reviewer can see what carried it.
   */
  qualifiedViaCompanyMember: boolean
  /**
   * A company member sits on an individual member's own chain, so their stakes
   * overlap and the sum counts the same shares twice. Reported, not corrected.
   */
  overlaps: boolean
}

/**
 * A role-holder in a non-commercial entity whose role does not reach the target:
 * the trust or foundation they hold a role in sits below the threshold. The
 * mirror of ExcludedController, and shown the same way.
 */
export interface ExcludedRoleHolder {
  key: string
  name: string
  entities: Array<{ name: string; kindLabel: string; role: RoleName; effectivePercent: number }>
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

/**
 * A person flagged as a controller whose control does not reach the target: the
 * companies they control all sit below the threshold, and they hold no
 * qualifying stake of their own. The chart still badges them, so the Summary
 * has to say why they were not counted.
 */
export interface ExcludedController {
  key: string
  name: string
  /** Each company they were flagged as controlling, with its share of the target. */
  companies: Array<{ name: string; effectivePercent: number }>
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
  /** Flagged controllers whose control does not reach the target, and why. */
  excludedControllers: ExcludedController[]
  /** Role-holders whose non-commercial entity sits below the threshold. */
  excludedRoleHolders: ExcludedRoleHolder[]
  /** Every related-party group, qualifying or not, highest total first. */
  relatedGroups: RelatedPartyGroup[]
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
