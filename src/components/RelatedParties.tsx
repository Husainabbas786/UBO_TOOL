import { useState } from 'react'
import type { ValidationIssue } from '../engine'
import type { RelatedRowState } from '../lib/rows'
import { isRelatedRowDirty } from '../lib/rows'
import { Button, ErrorText, TextInput } from './ui'

interface RelatedPartiesProps {
  rows: RelatedRowState[]
  /** Every party name entered above, for the datalist of suggestions. */
  partyNames: string[]
  issues: ValidationIssue[]
  onChange: (row: RelatedRowState) => void
  onRemove: (id: string) => void
  onAdd: () => void
}

/**
 * Manual aggregation, kept out of the way.
 *
 * Most structures never need this, so the section stays shut until someone opens
 * it and says what it does before asking for anything. Names are suggested from
 * the parties already entered, because a link to a name that is not in the
 * structure counts for nothing and has to be caught.
 */
export function RelatedParties({
  rows,
  partyNames,
  issues,
  onChange,
  onRemove,
  onAdd,
}: RelatedPartiesProps) {
  const used = rows.some(isRelatedRowDirty)
  const [open, setOpen] = useState(false)
  /*
   * Opening the section is a UI state, but having no links at all is not: with
   * every link removed — or after Start over — there is nothing to show, so the
   * section folds itself away again rather than sitting open and empty.
   */
  const expanded = used || (open && rows.length > 0)

  const issuesFor = (id: string) => issues.filter((issue) => issue.relatedId === id)

  if (!expanded) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          onClick={() => {
            setOpen(true)
            if (rows.length === 0) onAdd()
          }}
        >
          Add related-party link
        </Button>
        <span className="text-small text-muted">
          Only needed when shareholders should be assessed together — most structures do not use
          this.
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-body text-muted">
        Link shareholders who should be assessed together (e.g. family members, or parties acting in
        concert). Their ownership is combined for the UBO threshold.
      </p>

      <datalist id="related-party-names">
        {partyNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <div className="space-y-3">
        {rows.map((row, index) => {
          const rowIssues = issuesFor(row.id)
          const invalid = rowIssues.length > 0
          return (
            <div key={row.id} className="rounded-card border border-line bg-white px-3 py-3">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
                <span className="w-5 shrink-0 text-small font-medium tabular-nums text-muted">
                  {index + 1}
                </span>

                {row.memberNames.map((name, memberIndex) => (
                  <div key={memberIndex} className="flex min-w-[9rem] flex-1 items-center gap-2.5">
                    {memberIndex > 0 ? (
                      <span className="shrink-0 text-body text-muted">and</span>
                    ) : null}
                    <TextInput
                      aria-label={`Related party ${memberIndex + 1}, link ${index + 1}`}
                      list="related-party-names"
                      placeholder="Party name"
                      value={name}
                      invalid={invalid && name.trim() !== ''}
                      onChange={(e) => {
                        const memberNames = [...row.memberNames]
                        memberNames[memberIndex] = e.target.value
                        onChange({ ...row, memberNames })
                      }}
                    />
                  </div>
                ))}

                <Button
                  variant="quiet"
                  className="shrink-0 px-2.5 py-1.5 text-small"
                  onClick={() => onChange({ ...row, memberNames: [...row.memberNames, ''] })}
                >
                  + Party
                </Button>

                <div className="w-[12rem] shrink-0">
                  <TextInput
                    aria-label={`Relationship, link ${index + 1}`}
                    placeholder="Relationship (optional)"
                    value={row.label}
                    onChange={(e) => onChange({ ...row, label: e.target.value })}
                  />
                </div>

                <Button
                  variant="danger"
                  aria-label={`Remove related-party link ${index + 1}`}
                  title="Remove this link"
                  onClick={() => onRemove(row.id)}
                  className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center p-0 text-lg leading-none"
                >
                  ×
                </Button>
              </div>

              {rowIssues.length > 0 ? (
                <div className="mt-2 space-y-1 pl-[1.875rem]">
                  {rowIssues.map((issue) => (
                    <ErrorText key={`${issue.code}-${issue.message}`}>{issue.message}</ErrorText>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={onAdd}>
          Add related-party link
        </Button>
        <span className="text-small text-muted">
          Links chain: linking A to B and B to C assesses all three as one group.
        </span>
      </div>
    </div>
  )
}
