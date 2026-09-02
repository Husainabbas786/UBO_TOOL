import { THRESHOLDS } from '../engine'
import { FieldLabel, Select } from './ui'

interface ThresholdSelectProps {
  value: number
  onChange: (value: number) => void
}

/** The two MOE risk thresholds. Labels come from the engine, not from here. */
export function ThresholdSelect({ value, onChange }: ThresholdSelectProps) {
  return (
    <div className="max-w-md">
      <FieldLabel htmlFor="threshold">UBO threshold</FieldLabel>
      <Select id="threshold" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {THRESHOLDS.map((threshold) => (
          <option key={threshold.value} value={threshold.value}>
            {threshold.label}
          </option>
        ))}
      </Select>
      <p className="mt-1.5 text-small text-muted">
        Applies to both beneficial owners and intermediary companies.
      </p>
    </div>
  )
}
