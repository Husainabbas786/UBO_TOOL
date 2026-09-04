import type { PartyNode } from '../engine'
import { FieldLabel, Select } from './ui'

interface TargetSelectProps {
  candidates: PartyNode[]
  value: string | null
  onChange: (key: string) => void
}

/**
 * The Meydan FZ company being analysed is the company that owns nothing. Plain
 * text when there is exactly one, a dropdown when the structure is ambiguous.
 */
export function TargetSelect({ candidates, value, onChange }: TargetSelectProps) {
  if (candidates.length === 0) {
    return (
      <p className="text-body text-muted">
        No Meydan FZ company yet. Add a company that is owned but does not own anything else.
      </p>
    )
  }

  if (candidates.length === 1) {
    const only = candidates[0]
    return (
      <div className="max-w-md">
        <FieldLabel>Meydan FZ company</FieldLabel>
        <p className="rounded-input border border-fieldBorder bg-field px-2.5 py-2 text-body font-semibold text-navy">
          {only?.name}
        </p>
        <p className="mt-1.5 text-small text-muted">
          The Meydan FZ company being analysed, auto-detected as the company that is owned but does
          not own anything else.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-md">
      <FieldLabel htmlFor="target">Meydan FZ company</FieldLabel>
      <Select id="target" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {candidates.map((candidate) => (
          <option key={candidate.key} value={candidate.key}>
            {candidate.name}
          </option>
        ))}
      </Select>
      <p className="mt-1.5 text-small text-muted">
        {candidates.length} companies are owned but own nothing themselves. Pick the Meydan FZ
        company being analysed.
      </p>
    </div>
  )
}
