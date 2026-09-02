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
    <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
      {TYPES.map((type) => (
        <button
          key={type.value}
          type="button"
          aria-pressed={value === type.value}
          onClick={() => onChange(type.value)}
          className={`rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
            value === type.value
              ? 'bg-slate-800 text-white'
              : 'text-slate-600 hover:bg-slate-100'
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
    <div className="rounded-md border border-slate-200 bg-slate-50/60 px-3 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="w-6 shrink-0 text-xs font-medium text-slate-400">{index + 1}</span>

        <div className="min-w-[10rem] flex-1">
          <TextInput
            aria-label={`Owner name, row ${index + 1}`}
            placeholder="Owner name"
            value={row.ownerName}
            invalid={has('empty-owner-name') || has('self-ownership')}
            onChange={(e) => onChange({ ...row, ownerName: e.target.value })}
          />
        </div>

        <TypeToggle value={row.ownerType} onChange={(t) => onChange(withOwnerType(row, t))} />

        <span className="text-sm text-slate-500">owns</span>

        <div className="w-20">
          <TextInput
            aria-label={`Percentage, row ${index + 1}`}
            inputMode="decimal"
            placeholder="0.00"
            className="text-right"
            value={row.percentText}
            invalid={has('invalid-percent') || has('percent-precision')}
            onChange={(e) => onChange(withPercentText(row, e.target.value))}
          />
        </div>

        <span className="text-sm text-slate-500">% of</span>

        <div className="min-w-[10rem] flex-1">
          <TextInput
            aria-label={`Entity name, row ${index + 1}`}
            placeholder="Company name"
            value={row.entityName}
            invalid={has('empty-entity-name') || has('self-ownership')}
            onChange={(e) => onChange({ ...row, entityName: e.target.value })}
          />
        </div>

        <span className="rounded bg-slate-200 px-2 py-1 text-xs font-medium text-slate-600">
          Company
        </span>

        {/* Control is a property of a natural person, never of a company. */}
        {row.ownerType === 'individual' ? (
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={row.ownerIsController}
              onChange={(e) => onChange({ ...row, ownerIsController: e.target.checked })}
            />
            Controller
          </label>
        ) : (
          <span className="w-[5.5rem]" aria-hidden />
        )}

        <Button
          variant="danger"
          aria-label={`Remove row ${index + 1}`}
          title="Remove this link"
          disabled={!canRemove}
          onClick={onRemove}
          className="px-2 py-1 text-base leading-none"
        >
          ×
        </Button>
      </div>

      {issues.length > 0 || hint ? (
        <div className="mt-2 space-y-1 pl-9">
          {issues.map((issue) => (
            <ErrorText key={`${issue.code}-${issue.message}`}>{issue.message}</ErrorText>
          ))}
          {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
