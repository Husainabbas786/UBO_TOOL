import { useState } from 'react'
import { DESIGNATIONS, type Designation } from '../engine'
import type { ManagementRowState } from '../lib/rows'
import { isManagementRowDirty } from '../lib/rows'
import { Button, TextInput } from './ui'

interface ManagementProps {
  rows: ManagementRowState[]
  /** The company these officers belong to, named in the prompt. */
  targetName: string | null
  onChange: (row: ManagementRowState) => void
  onRemove: (id: string) => void
  onAdd: () => void
}

/**
 * The directors, managers and authorised persons of the Meydan FZ company.
 *
 * Kept out of the ownership rows on purpose: an office and a shareholding are
 * different claims, and mixing them in one builder is what leads to a director
 * being entered as a 0% owner. Nothing here reaches the calculation — these
 * people are recorded and displayed, and the section says so before it asks
 * for anything.
 */
export function Management({ rows, targetName, onChange, onRemove, onAdd }: ManagementProps) {
  const used = rows.some(isManagementRowDirty)
  const [open, setOpen] = useState(false)
  /*
   * The same rule the related-party section follows: with every row removed —
   * or after Start over — there is nothing to show, so the section folds itself
   * away rather than sitting open and empty.
   */
  const expanded = used || (open && rows.length > 0)

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
          Add management
        </Button>
        <span className="text-small text-muted">
          Directors, managers and authorised persons — recorded on the report, never counted as
          beneficial owners.
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-body text-muted">
        The board and management of {targetName ?? 'the Meydan FZ company'}. Holding one of these
        offices is not in itself beneficial ownership, so nothing entered here changes the UBO
        result or any company&rsquo;s 100% total.
      </p>

      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={row.id} className="rounded-card border border-line bg-white px-3 py-3">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
              <span className="w-5 shrink-0 text-small font-medium tabular-nums text-muted">
                {index + 1}
              </span>

              <div className="min-w-[10rem] flex-1">
                <TextInput
                  aria-label={`Management name, row ${index + 1}`}
                  placeholder="Full name"
                  value={row.name}
                  onChange={(e) => onChange({ ...row, name: e.target.value })}
                />
              </div>

              <div className="w-[12rem] shrink-0">
                <select
                  aria-label={`Designation, row ${index + 1}`}
                  value={row.designation}
                  onChange={(e) =>
                    onChange({ ...row, designation: e.target.value as Designation })
                  }
                  className="w-full cursor-pointer rounded-input border border-fieldBorder bg-field px-2.5 py-2 text-body text-ink focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-deepTeal"
                >
                  {DESIGNATIONS.map((designation) => (
                    <option key={designation} value={designation}>
                      {designation}
                    </option>
                  ))}
                </select>
              </div>

              <Button
                variant="danger"
                aria-label={`Remove management row ${index + 1}`}
                title="Remove this person"
                onClick={() => onRemove(row.id)}
                className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center p-0 text-lg leading-none"
              >
                ×
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={onAdd}>
          Add management
        </Button>
        <span className="text-small text-muted">
          One row per office. Somebody who holds two can be entered twice.
        </span>
      </div>
    </div>
  )
}
