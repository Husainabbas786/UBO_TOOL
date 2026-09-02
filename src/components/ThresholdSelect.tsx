import { THRESHOLDS } from '../engine'

interface ThresholdSelectProps {
  value: number
  onChange: (value: number) => void
}

/** The two MOE risk thresholds. Labels come from the engine, not from here. */
export function ThresholdSelect({ value, onChange }: ThresholdSelectProps) {
  return (
    <div className="max-w-md">
      <label htmlFor="threshold" className="mb-1.5 block text-sm font-medium text-slate-700">
        UBO threshold
      </label>
      <select
        id="threshold"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
      >
        {THRESHOLDS.map((threshold) => (
          <option key={threshold.value} value={threshold.value}>
            {threshold.label}
          </option>
        ))}
      </select>
      <p className="mt-1.5 text-xs text-slate-500">
        Applies to both beneficial owners and intermediary companies.
      </p>
    </div>
  )
}
