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

export function IntermediariesTable({ result }: { result: CalculationResult }) {
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle')

  if (result.intermediaries.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No intermediary companies at or above the {result.threshold}% threshold — every owner holds
        the target directly.
      </p>
    )
  }

  const handleCopy = async () => {
    const names = result.intermediaries.map((company) => company.name).join('\n')
    setCopied((await copyText(names)) ? 'done' : 'failed')
    window.setTimeout(() => setCopied('idle'), 2500)
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[24rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-4 font-semibold">Company</th>
              <th className="py-2 text-right font-semibold">Effective % of target</th>
            </tr>
          </thead>
          <tbody>
            {result.intermediaries.map((company) => (
              <tr key={company.key} className="border-b border-slate-100 last:border-0">
                <td className="py-2.5 pr-4 font-medium text-slate-900">{company.name}</td>
                <td className="py-2.5 text-right font-medium tabular-nums text-slate-900">
                  {formatPercent(company.effectivePercent)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleCopy}>Copy names</Button>
        {copied === 'done' ? (
          <span className="text-xs text-emerald-700">
            Copied {result.intermediaries.length} name
            {result.intermediaries.length === 1 ? '' : 's'}, one per line.
          </span>
        ) : null}
        {copied === 'failed' ? (
          <span className="text-xs text-rose-600">Could not copy — select the names manually.</span>
        ) : null}
      </div>
    </div>
  )
}
