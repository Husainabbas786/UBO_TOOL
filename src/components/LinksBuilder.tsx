import { MAX_LINKS, type ValidationIssue } from '../engine'
import type { LinkRowState } from '../lib/rows'
import { CompanyTotals, type CompanyTotal } from './CompanyTotals'
import { LinkRow } from './LinkRow'
import { Button } from './ui'

interface LinksBuilderProps {
  rows: LinkRowState[]
  /** Row-level issues, already filtered to rows the user has touched. */
  issuesByRow: Map<string, ValidationIssue[]>
  /** Row ids the user has not touched yet, shown as a neutral note. */
  incompleteRowIds: Set<string>
  companyTotals: CompanyTotal[]
  /** Issues that belong to a party rather than a row, e.g. type conflicts. */
  partyIssues: ValidationIssue[]
  onChangeRow: (row: LinkRowState) => void
  onRemoveRow: (id: string) => void
  onAddRow: () => void
}

export function LinksBuilder({
  rows,
  issuesByRow,
  incompleteRowIds,
  companyTotals,
  partyIssues,
  onChangeRow,
  onRemoveRow,
  onAddRow,
}: LinksBuilderProps) {
  const atCap = rows.length >= MAX_LINKS

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {rows.map((row, index) => (
          <LinkRow
            key={row.id}
            row={row}
            index={index}
            issues={issuesByRow.get(row.id) ?? []}
            hint={incompleteRowIds.has(row.id) ? 'Complete this row or remove it.' : undefined}
            canRemove={rows.length > 1}
            onChange={onChangeRow}
            onRemove={() => onRemoveRow(row.id)}
          />
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={onAddRow} disabled={atCap}>
          + Add Ownership Link
        </Button>
        <span className="text-xs text-slate-500">
          {rows.length} of {MAX_LINKS} links
          {atCap ? ' — recommended maximum reached' : ''}
        </span>
      </div>

      <div className="border-t border-slate-200 pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Owner totals per company
        </p>
        <CompanyTotals totals={companyTotals} />
        {partyIssues.length > 0 ? (
          <ul className="mt-3 space-y-1">
            {partyIssues.map((issue) => (
              <li key={`${issue.code}-${issue.nodeKey ?? issue.message}`} className="text-xs text-rose-600">
                {issue.message}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
