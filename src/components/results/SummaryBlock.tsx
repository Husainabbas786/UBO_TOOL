import { formatPercent, type CalculationResult } from '../../engine'

export function SummaryBlock({ result }: { result: CalculationResult }) {
  const count = result.ubos.length

  return (
    <div className="space-y-4">
      <p
        className={`rounded-md border px-4 py-3 text-sm font-medium ${
          count > 0
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-slate-200 bg-slate-50 text-slate-700'
        }`}
      >
        {count} beneficial owner{count === 1 ? '' : '(s)'} identified at the {result.threshold}%
        threshold
      </p>

      {count > 0 ? (
        <ul className="space-y-1.5 text-sm text-slate-800">
          {result.ubos.map((ubo) => (
            <li key={ubo.key} className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="font-semibold">{ubo.name}</span>
              <span>
                holds {formatPercent(ubo.totalPercent)}% of {result.target.name}
              </span>
              <span className="text-slate-500">({ubo.basis})</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* The chain stops at a company nobody owns on paper: say so plainly. */}
      {result.unidentified.length > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">Beneficial owner unidentified</p>
          <ul className="mt-1.5 space-y-1 text-sm text-amber-800">
            {result.unidentified.map((gap) => (
              <li key={gap.key}>
                {formatPercent(gap.effectivePercent)}% of {result.target.name} traces to {gap.name},
                whose owners have not been entered — beneficial owner unidentified.
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-slate-500">
        Considered {result.entityCount} entities and {result.pathCount} ownership paths. Multiple
        paths for the same owner are aggregated.
      </p>
    </div>
  )
}
