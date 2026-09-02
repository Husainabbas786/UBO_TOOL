import { formatPercent, type CalculationResult, type UboStatus } from '../../engine'

/**
 * Status pill. The wording is the engine's — never "Exceeds", and never "UBO"
 * for a company, which instead reads "No owners entered".
 */
const STATUS_STYLES: Record<UboStatus, string> = {
  UBO: 'bg-uboTint text-darkGreen border border-mfzGreen',
  'Below threshold': 'bg-field text-muted border border-fieldBorder',
  'No owners entered': 'bg-gapTint text-coral border border-coral',
}

function StatusPill({ status }: { status: UboStatus }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-pill px-2.5 py-1 text-small font-semibold ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  )
}

export function PathsTable({ result }: { result: CalculationResult }) {
  return (
    <div data-export-scroll className="overflow-x-auto">
      <table className="w-full min-w-[42rem] border-collapse text-body">
        <thead>
          <tr className="border-b border-line text-left text-h4 font-medium text-navy">
            <th className="h-row pr-4 align-middle font-medium">Ultimate owner</th>
            <th className="h-row pr-4 align-middle font-medium">Path</th>
            <th className="h-row pr-4 align-middle font-medium">Target entity</th>
            <th className="h-row pr-4 text-right align-middle font-medium">Effective %</th>
            <th className="h-row align-middle font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {result.paths.map((path) => (
            <tr
              key={`${path.ownerKey}-${path.chain.join('>')}`}
              className="border-b border-line last:border-0"
            >
              <td className="h-row pr-4 align-middle font-semibold text-ink">{path.ownerName}</td>
              <td className="h-row pr-4 align-middle text-ink">{path.chain.join(' → ')}</td>
              <td className="h-row pr-4 align-middle text-muted">{result.target.name}</td>
              <td className="h-row pr-4 text-right align-middle font-semibold tabular-nums text-ink">
                {formatPercent(path.effectivePercent)}%
              </td>
              <td className="h-row align-middle">
                <StatusPill status={path.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
