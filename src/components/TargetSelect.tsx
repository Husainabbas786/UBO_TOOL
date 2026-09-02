import type { PartyNode } from '../engine'

interface TargetSelectProps {
  candidates: PartyNode[]
  value: string | null
  onChange: (key: string) => void
}

/**
 * The target is the company that owns nothing. Plain text when there is exactly
 * one, a dropdown when the structure is ambiguous.
 */
export function TargetSelect({ candidates, value, onChange }: TargetSelectProps) {
  if (candidates.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No target entity yet — add a company that is owned but does not own anything else.
      </p>
    )
  }

  if (candidates.length === 1) {
    const only = candidates[0]
    return (
      <div className="max-w-md">
        <p className="mb-1.5 text-sm font-medium text-slate-700">Target entity</p>
        <p className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm font-medium text-slate-900">
          {only?.name}
        </p>
        <p className="mt-1.5 text-xs text-slate-500">Auto-detected — the company that owns nothing.</p>
      </div>
    )
  }

  return (
    <div className="max-w-md">
      <label htmlFor="target" className="mb-1.5 block text-sm font-medium text-slate-700">
        Target entity
      </label>
      <select
        id="target"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
      >
        {candidates.map((candidate) => (
          <option key={candidate.key} value={candidate.key}>
            {candidate.name}
          </option>
        ))}
      </select>
      <p className="mt-1.5 text-xs text-slate-500">
        {candidates.length} companies own nothing — pick the one being analysed.
      </p>
    </div>
  )
}
