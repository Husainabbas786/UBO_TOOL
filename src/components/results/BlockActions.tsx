import { useState, type RefObject } from 'react'
import {
  downloadPdf,
  downloadPng,
  type BlockName,
  type PageOrientation,
} from '../../lib/exportBlock'
import { Button } from '../ui'

interface BlockActionsProps {
  blockRef: RefObject<HTMLElement | null>
  target: string
  block: BlockName
  /** The chart goes on a landscape page; the tables on portrait. */
  orientation: PageOrientation
}

/**
 * Download buttons for one result block. They carry `data-export-hide`, so the
 * capture filter strips them out and they never appear in the saved image.
 */
export function BlockActions({ blockRef, target, block, orientation }: BlockActionsProps) {
  const [busy, setBusy] = useState<'png' | 'pdf' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (kind: 'png' | 'pdf') => {
    const node = blockRef.current
    if (!node || busy) return
    setBusy(kind)
    setError(null)
    try {
      if (kind === 'png') await downloadPng(node, target, block)
      else await downloadPdf(node, target, block, orientation)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Export failed.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div data-export-hide className="flex flex-wrap items-center gap-2">
      {error ? <span className="max-w-[18rem] text-small text-coral">{error}</span> : null}
      <Button variant="secondary" disabled={busy !== null} onClick={() => void run('png')}>
        {busy === 'png' ? 'Saving…' : 'Download PNG'}
      </Button>
      <Button variant="secondary" disabled={busy !== null} onClick={() => void run('pdf')}>
        {busy === 'pdf' ? 'Saving…' : 'Download PDF'}
      </Button>
    </div>
  )
}
