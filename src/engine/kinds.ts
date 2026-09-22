/**
 * What kind of legal entity a corporate shareholder is.
 *
 * A commercial company has shares, so its owners must total 100%. A trust, a
 * foundation and an NPO have none: the people behind them hold *roles*, and the
 * tool captures those roles instead of percentages.
 */
export type EntityKind = 'company' | 'trust' | 'foundation' | 'npo'

export const ENTITY_KINDS: ReadonlyArray<{ value: EntityKind; label: string }> = [
  { value: 'company', label: 'Company' },
  { value: 'trust', label: 'Trust' },
  { value: 'foundation', label: 'Foundation' },
  { value: 'npo', label: 'NPO' },
]

/** True for the structures that have no shareholdings — trust, foundation, NPO. */
export function isNonCommercial(kind: EntityKind): boolean {
  return kind !== 'company'
}

export function entityKindLabel(kind: EntityKind): string {
  return ENTITY_KINDS.find((entry) => entry.value === kind)?.label ?? 'Company'
}

const TRUST_ROLES = ['Settlor', 'Trustee', 'Beneficiary', 'Protector'] as const
const FOUNDATION_ROLES = ['Founder', 'Council Member', 'Beneficiary', 'Other'] as const

/** Every role the tool recognises, across both families of structure. */
export type RoleName = (typeof TRUST_ROLES)[number] | (typeof FOUNDATION_ROLES)[number]

/**
 * The roles offered for a kind. A foundation and an NPO are governed the same
 * way — a founder, a council and beneficiaries — so they share one list.
 */
export function rolesFor(kind: EntityKind): readonly RoleName[] {
  if (kind === 'trust') return TRUST_ROLES
  if (kind === 'foundation' || kind === 'npo') return FOUNDATION_ROLES
  return []
}

/** Whether `role` is one of the roles `kind` offers. */
export function isRoleValid(kind: EntityKind, role: string | null | undefined): role is RoleName {
  if (!role) return false
  return (rolesFor(kind) as readonly string[]).includes(role)
}
