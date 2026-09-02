import { formatPercent, type CalculationResult, type UboStatus } from '../../engine'

/**
 * Status pill. The wording is the engine's — never "Exceeds", and never "UBO"
 * for a company, which instead reads "No owners entered".
 */
const STATUS_STYLES: Record<UboStatus, string> = {
  UBO: 'bg-emerald-50 text-emerald-700',
  'Below threshold': 'bg-slate-100 text-slate-600',
  'No owners entered': 'bg-amber-50 text-amber-800',
}

function StatusPill({ status }: { status: UboStatus }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  )
}

export function PathsTable({ result }: { result: CalculationResult }) {
  return (
    <div data-export-scroll className="overflow-x-auto">
      <table className="w-full min-w-[42rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-4 font-semibold">Ultimate Owner</th>
            <th className="py-2 pr-4 font-semibold">Path</th>
            <th className="py-2 pr-4 font-semibold">Target Entity</th>
            <th className="py-2 pr-4 text-right font-semibold">Effective %</th>
            <th className="py-2 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {result.paths.map((path) => (
            <tr
              key={`${path.ownerKey}-${path.chain.join('>')}`}
              className="border-b border-slate-100 last:border-0"
            >
              <td className="py-2.5 pr-4 font-medium text-slate-900">{path.ownerName}</td>
              <td className="py-2.5 pr-4 text-slate-600">{path.chain.join(' → ')}</td>
              <td className="py-2.5 pr-4 text-slate-600">{result.target.name}</td>
              <td className="py-2.5 pr-4 text-right font-medium tabular-nums text-slate-900">
                {formatPercent(path.effectivePercent)}%
              </td>
              <td className="py-2.5">
                <StatusPill status={path.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
