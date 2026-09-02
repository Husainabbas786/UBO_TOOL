import { formatPercentShort } from '../engine'

export interface CompanyTotal {
  key: string
  name: string
  total: number
  /** Green only when the engine raises no totals error for this company. */
  ok: boolean
}

/**
 * Live per-company totals. Whether a chip is green is decided by the engine's
 * validation, not by a fresh `=== 100` check here — otherwise a company inside
 * the ±0.01 tolerance could show red while Calculate was enabled.
 */
export function CompanyTotals({ totals }: { totals: CompanyTotal[] }) {
  if (totals.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Owner totals appear here as you enter links. Every company must total 100%.
      </p>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {totals.map((company) => (
        <span
          key={company.key}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
            company.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          <span className="font-semibold">{company.name}</span>
          <span>{formatPercentShort(company.total)}%</span>
        </span>
      ))}
    </div>
  )
}
