import type { ReactNode } from 'react'
import {
  ENTITY_KINDS,
  entityKindLabel,
  isNonCommercial,
  rolesFor,
  type EntityKind,
  type PartyType,
  type RoleName,
  type ValidationIssue,
} from '../engine'
import type { LinkRowState } from '../lib/rows'
import { withEntityName, withNominee, withOwnerType, withPercentText } from '../lib/rows'
import { Button, ErrorText, TextInput } from './ui'

interface LinkRowProps {
  row: LinkRowState
  index: number
  issues: ValidationIssue[]
  /** Neutral note for a row the user has not filled in yet. */
  hint?: string
  /** What the empty company field should ask for, given what is entered so far. */
  entityPlaceholder: string
  /**
   * What the entity on this row is, resolved across every row naming it — so a
   * row typed before the kind was set still shows, and behaves as, a role row.
   */
  entityKind: EntityKind
  canRemove: boolean
  onChange: (row: LinkRowState) => void
  onChangeEntityKind: (kind: EntityKind) => void
  onRemove: () => void
}

const TYPES: Array<{ value: PartyType; label: string }> = [
  { value: 'individual', label: 'Individual' },
  { value: 'company', label: 'Company' },
]

/** Two-state segmented toggle for the owner's party type. */
function TypeToggle({
  value,
  onChange,
  label,
}: {
  value: PartyType
  onChange: (t: PartyType) => void
  label?: string
}) {
  return (
    <div className="inline-flex rounded-pill border border-fieldBorder bg-white p-0.5" aria-label={label}>
      {TYPES.map((type) => (
        <button
          key={type.value}
          type="button"
          aria-pressed={value === type.value}
          onClick={() => onChange(type.value)}
          className={`rounded-pill px-3 py-1.5 text-small font-medium transition-colors ${
            value === type.value ? 'bg-mfzBlue text-white' : 'text-navy hover:bg-field'
          }`}
        >
          {type.label}
        </button>
      ))}
    </div>
  )
}

/**
 * A manual compliance flag on a row: a real label, a plain-language hint and a
 * tinted border when it is on. Controller and Nominee share the pattern, so
 * there is only one thing for a first-time user to learn.
 */
function FlagBox({
  checked,
  onChange,
  title,
  hint,
  width,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  title: string
  hint: string
  width: string
}) {
  return (
    <label
      className={`flex ${width} shrink-0 cursor-pointer items-center gap-2 rounded-input border px-2.5 py-1.5 transition-colors ${
        checked ? 'border-purple bg-purple-t10' : 'border-fieldBorder bg-white hover:bg-field'
      }`}
    >
      <input
        type="checkbox"
        className="h-[18px] w-[18px] shrink-0 rounded border-fieldBorder accent-purple"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="leading-tight">
        <span className="block text-small font-medium text-navy">{title}</span>
        <span className="block whitespace-nowrap text-[11px] leading-tight text-muted">{hint}</span>
      </span>
    </label>
  )
}

/** The word between the owner and the entity: "owns" shares, or "is" a role. */
function Connector({ children }: { children: ReactNode }) {
  return <span className="shrink-0 text-body text-muted">{children}</span>
}

export function LinkRow({
  row,
  index,
  issues,
  hint,
  entityPlaceholder,
  entityKind,
  canRemove,
  onChange,
  onChangeEntityKind,
  onRemove,
}: LinkRowProps) {
  const has = (code: ValidationIssue['code']) => issues.some((issue) => issue.code === code)
  /*
   * A trust, foundation or NPO has no shares, so this row states a position in
   * it rather than a percentage: the percentage box becomes a role, and the
   * shareholding flags — controller, nominee — do not apply.
   */
  const isRoleRow = isNonCommercial(entityKind)

  return (
    <div className="rounded-card border border-line bg-white px-3 py-3">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 wide:flex-nowrap">
        <span className="w-5 shrink-0 text-small font-medium tabular-nums text-muted">{index + 1}</span>

        <div className="min-w-[8rem] flex-1">
          <TextInput
            aria-label={`Owner name, row ${index + 1}`}
            placeholder={isRoleRow ? 'Name' : 'Shareholder'}
            value={row.ownerName}
            invalid={has('empty-owner-name') || has('self-ownership')}
            onChange={(e) => onChange({ ...row, ownerName: e.target.value })}
          />
        </div>

        <div className="shrink-0">
          <TypeToggle
            value={row.ownerType}
            onChange={(t) => onChange(withOwnerType(row, t))}
            label={`Owner type, row ${index + 1}`}
          />
        </div>

        {isRoleRow ? (
          <>
            <Connector>is</Connector>
            <div className="w-[11rem] shrink-0">
              <select
                aria-label={`Role, row ${index + 1}`}
                value={row.role ?? ''}
                onChange={(e) =>
                  onChange({ ...row, role: (e.target.value || null) as RoleName | null })
                }
                className={`w-full rounded-input border px-2.5 py-2 text-body focus:outline-none focus-visible:outline-none focus-visible:ring-2 ${
                  has('role-required')
                    ? 'border-coral bg-gapTint text-ink focus-visible:ring-coral'
                    : 'border-fieldBorder bg-field text-ink focus-visible:ring-deepTeal'
                }`}
              >
                <option value="">Select role…</option>
                {rolesFor(entityKind).map((roleName) => (
                  <option key={roleName} value={roleName}>
                    {roleName}
                  </option>
                ))}
              </select>
            </div>
            <Connector>of</Connector>
          </>
        ) : (
          <>
            <Connector>owns</Connector>
            <div className="w-[4.5rem] shrink-0">
              <TextInput
                aria-label={`Percentage, row ${index + 1}`}
                inputMode="decimal"
                placeholder={row.ownerIsController ? '0' : '0.00'}
                className="text-right"
                value={row.percentText}
                invalid={has('invalid-percent') || has('percent-precision')}
                onChange={(e) => onChange(withPercentText(row, e.target.value))}
              />
            </div>
            <Connector>% of</Connector>
          </>
        )}

        <div className="min-w-[8rem] flex-1">
          <TextInput
            aria-label={`Entity name, row ${index + 1}`}
            placeholder={entityPlaceholder}
            value={row.entityName}
            invalid={has('empty-entity-name') || has('self-ownership')}
            onChange={(e) => onChange(withEntityName(row, e.target.value))}
          />
        </div>

        {/* What the entity is. A trust, foundation or NPO has no shares, so
            picking one here turns every row naming it into a role row. */}
        <select
          aria-label={`Entity type, row ${index + 1}`}
          value={entityKind}
          onChange={(e) => onChangeEntityKind(e.target.value as EntityKind)}
          className="shrink-0 cursor-pointer rounded-pill border-0 bg-mfzBlue-t10 py-1 pl-2.5 pr-1.5 text-small font-medium text-mfzBlue focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-deepTeal"
        >
          {ENTITY_KINDS.map((kind) => (
            <option key={kind.value} value={kind.value}>
              {kind.label}
            </option>
          ))}
        </select>

        {/* Control is a property of a natural person, never of a company. This
            is the control a first-time user has to find on their own, so it is
            given a real label and a plain-language hint. */}
        {!isRoleRow && row.ownerType === 'individual' && !row.ownerIsNominee ? (
          <FlagBox
            checked={row.ownerIsController}
            onChange={(checked) => onChange({ ...row, ownerIsController: checked })}
            title="Controller"
            hint="has control, e.g. voting rights"
            width="w-[13.25rem]"
          />
        ) : null}

        {/* A nominee holds the shares on paper for someone else. Available to a
            company owner too: a corporate nominee is the common arrangement. */}
        {!isRoleRow && !row.ownerIsController ? (
          <FlagBox
            checked={row.ownerIsNominee}
            onChange={(checked) => onChange(withNominee(row, checked))}
            title="Nominee"
            hint="holds shares for someone else"
            width="w-[12.5rem]"
          />
        ) : null}

        <Button
          variant="danger"
          aria-label={`Remove row ${index + 1}`}
          title="Remove this link"
          disabled={!canRemove}
          onClick={onRemove}
          className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center p-0 text-lg leading-none"
        >
          ×
        </Button>
      </div>

      {/* The one conditional field on the row: who the shares are really held
          for. Without it the flag would move the ownership nowhere. */}
      {!isRoleRow && row.ownerIsNominee ? (
        <div className="mt-2.5 rounded-input border border-purple bg-purple-t10 px-3 py-2.5 sm:ml-[1.875rem]">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
            <span className="shrink-0 text-small font-medium text-navy">
              Nominator (actual shareholder)
            </span>
            <div className="min-w-[10rem] flex-1">
              <TextInput
                aria-label={`Nominator name, row ${index + 1}`}
                placeholder="Who the shares are held for"
                value={row.nominatorName}
                invalid={has('nominator-required') || has('self-nomination')}
                onChange={(e) => onChange({ ...row, nominatorName: e.target.value })}
              />
            </div>
            <TypeToggle
              value={row.nominatorType}
              onChange={(t) => onChange({ ...row, nominatorType: t })}
              label={`Nominator type, row ${index + 1}`}
            />
          </div>
          <p className="mt-1.5 text-[11px] leading-tight text-navy">
            These shares still count towards{' '}
            {row.entityName.trim() === '' ? 'the company' : row.entityName}&rsquo;s 100% total, but
            the nominator is assessed as the beneficial owner — the nominee never is.
          </p>
        </div>
      ) : null}

      {issues.length > 0 || hint || (row.ownerIsController && !isRoleRow) || (isRoleRow && row.role) ? (
        <div className="mt-2 space-y-1 pl-[1.875rem]">
          {issues.map((issue) => (
            <ErrorText key={`${issue.code}-${issue.message}`}>{issue.message}</ErrorText>
          ))}
          {row.ownerIsController && !isRoleRow ? (
            <p className="text-small text-purple">0% is allowed for a controller.</p>
          ) : null}
          {isRoleRow && row.role ? (
            <p className="text-small text-purple">
              {row.role} of a {entityKindLabel(entityKind).toLowerCase()} — captured as a beneficial
              owner, with no percentage.
            </p>
          ) : null}
          {hint ? <p className="text-small text-muted">{hint}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
