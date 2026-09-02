import { formatPercent, type CalculationResult, type UboSummaryEntry } from '../../engine'

/**
 * How a beneficial owner qualifies, in words. Someone who qualifies purely on
 * control needs to be told which company they control, otherwise the line reads
 * as a 0% owner and means nothing to a reviewer.
 */
function describeBasis(ubo: UboSummaryEntry, targetName: string): string {
  const owned = `${formatPercent(ubo.totalPercent)}% ownership`
  const controlled = ubo.controls.length > 0 ? ubo.controls.join(', ') : targetName

  if (ubo.basis === 'Control') return `: control of ${controlled} (${owned})`
  if (ubo.basis === 'Ownership + Control') {
    return ` holds ${formatPercent(ubo.totalPercent)}% of ${targetName}, and control of ${controlled}`
  }
  return ` holds ${formatPercent(ubo.totalPercent)}% of ${targetName}`
}

export function SummaryBlock({ result }: { result: CalculationResult }) {
  const count = result.ubos.length

  return (
    <div className="space-y-4">
      <p
        className={`rounded-card border px-4 py-3 text-body font-semibold ${
          count > 0
            ? 'border-mfzGreen bg-uboTint text-darkGreen'
            : 'border-fieldBorder bg-field text-navy'
        }`}
      >
        {count} beneficial owner{count === 1 ? '' : '(s)'} identified at the {result.threshold}%
        threshold
      </p>

      {count > 0 ? (
        <ul className="space-y-2 text-body text-ink">
          {result.ubos.map((ubo) => (
            <li key={ubo.key} className="flex flex-wrap items-baseline gap-x-2">
              <span>
                <span className="font-semibold text-navy">{ubo.name}</span>
                {describeBasis(ubo, result.target.name)}
              </span>
              <span
                className={`rounded-pill px-2 py-0.5 text-small font-medium ${
                  ubo.basis === 'Ownership' ? 'bg-uboTint text-darkGreen' : 'bg-purple text-white'
                }`}
              >
                {ubo.basis}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* The chain stops at a company nobody owns on paper: say so plainly. */}
      {result.unidentified.length > 0 ? (
        <div className="rounded-card border border-coral bg-gapTint px-4 py-3">
          <p className="text-body font-semibold text-coral">Beneficial owner unidentified</p>
          <ul className="mt-1.5 space-y-1 text-body text-coral">
            {result.unidentified.map((gap) => (
              <li key={gap.key}>
                {formatPercent(gap.effectivePercent)}% of {result.target.name} traces to {gap.name},
                whose owners have not been entered. Beneficial owner unidentified.
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-small text-muted">
        Considered {result.entityCount} entities and {result.pathCount} ownership paths. Multiple
        paths for the same owner are aggregated.
      </p>
    </div>
  )
}
