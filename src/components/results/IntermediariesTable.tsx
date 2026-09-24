import { useState } from 'react'
import { formatPercent, type CalculationResult } from '../../engine'
import { Button } from '../ui'

/**
 * Copies text without assuming a secure context: the Clipboard API is only
 * available on https/localhost, and this tool may end up on a plain-http
 * internal URL, so fall back to a hidden textarea.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the legacy path below.
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(area)
    return copied
  } catch {
    return false
  }
}

/**
 * Every party in the structure, for ERP screening.
 *
 * Screening scope is a wider question than beneficial ownership: sanctions and
 * adverse-media checks run against everyone named, whatever they hold, so no
 * threshold is applied here and individuals are listed alongside companies.
 */
export function IntermediariesTable({ result }: { result: CalculationResult }) {
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle')

  if (result.screening.length === 0) {
    return (
      <p className="text-body text-muted">
        No other parties in this structure — the Meydan FZ company stands alone.
      </p>
    )
  }

  const handleCopy = async () => {
    const names = result.screening.map((party) => party.name).join('\n')
    setCopied((await copyText(names)) ? 'done' : 'failed')
    window.setTimeout(() => setCopied('idle'), 2500)
  }

  return (
    <div className="space-y-3">
      <div data-export-scroll className="overflow-x-auto">
        <table className="w-full min-w-[24rem] border-collapse text-body">
          <thead>
            <tr className="border-b border-line text-left text-h4 font-medium text-navy">
              <th className="h-row pr-4 align-middle font-medium">Party</th>
              <th className="h-row pr-4 align-middle font-medium">Type</th>
              <th className="h-row text-right align-middle font-medium">Effective % of the Meydan FZ company</th>
            </tr>
          </thead>
          <tbody>
            {result.screening.map((party) => (
              <tr key={party.key} className="border-b border-line last:border-0">
                <td className="h-row pr-4 align-middle font-semibold text-ink">{party.name}</td>
                <td className="h-row pr-4 align-middle text-muted">
                  {party.type === 'company' ? 'Company' : 'Individual'}
                </td>
                <td className="h-row text-right align-middle font-semibold tabular-nums text-ink">
                  {formatPercent(party.effectivePercent)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div data-export-hide className="flex items-center gap-3">
        <Button variant="secondary" onClick={handleCopy}>
          Copy names
        </Button>
        {copied === 'done' ? (
          <span className="text-small text-darkGreen">
            Copied {result.screening.length} name
            {result.screening.length === 1 ? '' : 's'}, one per line.
          </span>
        ) : null}
        {copied === 'failed' ? (
          <span className="text-small text-coral">Could not copy. Select the names manually.</span>
        ) : null}
      </div>
    </div>
  )
}
