import type { PartyType, ValidationIssue } from '../engine'
import type { LinkRowState } from '../lib/rows'
import { withOwnerType, withPercentText } from '../lib/rows'
import { Button, ErrorText, TextInput } from './ui'

interface LinkRowProps {
  row: LinkRowState
  index: number
  issues: ValidationIssue[]
  /** Neutral note for a row the user has not filled in yet. */
  hint?: string
  canRemove: boolean
  onChange: (row: LinkRowState) => void
  onRemove: () => void
}

const TYPES: Array<{ value: PartyType; label: string }> = [
  { value: 'individual', label: 'Individual' },
  { value: 'company', label: 'Company' },
]

/** Two-state segmented toggle for the owner's party type. */
function TypeToggle({ value, onChange }: { value: PartyType; onChange: (t: PartyType) => void }) {
  return (
    <div className="inline-flex rounded-pill border border-fieldBorder bg-white p-0.5">
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

export function LinkRow({ row, index, issues, hint, canRemove, onChange, onRemove }: LinkRowProps) {
  const has = (code: ValidationIssue['code']) => issues.some((issue) => issue.code === code)

  return (
    <div className="rounded-card border border-line bg-white px-3 py-3">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 wide:flex-nowrap">
        <span className="w-5 shrink-0 text-small font-medium tabular-nums text-muted">{index + 1}</span>

        <div className="min-w-[8rem] flex-1">
          <TextInput
            aria-label={`Owner name, row ${index + 1}`}
            placeholder="Owner name"
            value={row.ownerName}
            invalid={has('empty-owner-name') || has('self-ownership')}
            onChange={(e) => onChange({ ...row, ownerName: e.target.value })}
          />
        </div>

        <div className="shrink-0">
          <TypeToggle value={row.ownerType} onChange={(t) => onChange(withOwnerType(row, t))} />
        </div>

        <span className="shrink-0 text-body text-muted">owns</span>

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

        <span className="shrink-0 text-body text-muted">% of</span>

        <div className="min-w-[8rem] flex-1">
          <TextInput
            aria-label={`Entity name, row ${index + 1}`}
            placeholder="Company name"
            value={row.entityName}
            invalid={has('empty-entity-name') || has('self-ownership')}
            onChange={(e) => onChange({ ...row, entityName: e.target.value })}
          />
        </div>

        <span className="shrink-0 rounded-pill bg-mfzBlue-t10 px-2.5 py-1 text-small font-medium text-mfzBlue">
          Company
        </span>

        {/* Control is a property of a natural person, never of a company. This
            is the control a first-time user has to find on their own, so it is
            given a real label and a plain-language hint. */}
        {row.ownerType === 'individual' ? (
          <label
            className={`flex w-[13.25rem] shrink-0 cursor-pointer items-center gap-2 rounded-input border px-2.5 py-1.5 transition-colors ${
              row.ownerIsController
                ? 'border-purple bg-purple-t10'
                : 'border-fieldBorder bg-white hover:bg-field'
            }`}
          >
            <input
              type="checkbox"
              className="h-[18px] w-[18px] shrink-0 rounded border-fieldBorder accent-purple"
              checked={row.ownerIsController}
              onChange={(e) => onChange({ ...row, ownerIsController: e.target.checked })}
            />
            <span className="leading-tight">
              <span className="block text-small font-medium text-navy">Controller</span>
              <span className="block whitespace-nowrap text-[11px] leading-tight text-muted">
                has control, e.g. voting rights
              </span>
            </span>
          </label>
        ) : (
          <span className="w-[13.25rem] shrink-0" aria-hidden />
        )}

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

      {issues.length > 0 || hint || row.ownerIsController ? (
        <div className="mt-2 space-y-1 pl-[1.875rem]">
          {issues.map((issue) => (
            <ErrorText key={`${issue.code}-${issue.message}`}>{issue.message}</ErrorText>
          ))}
          {row.ownerIsController ? (
            <p className="text-small text-purple">0% is allowed for a controller.</p>
          ) : null}
          {hint ? <p className="text-small text-muted">{hint}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
