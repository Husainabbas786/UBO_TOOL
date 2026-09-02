import type { OwnershipLinkInput, PartyType } from '../engine'
import { SAMPLE_LINKS } from '../engine/sample'

/**
 * A builder row. It satisfies OwnershipLinkInput so it can be handed straight to
 * the engine, plus the raw text the user is typing into the percentage box —
 * a half-typed "3." must survive until they finish, so the draft is kept
 * alongside the parsed number rather than being re-derived from it.
 */
export interface LinkRowState extends OwnershipLinkInput {
  percentText: string
}

let counter = 0

function nextId(): string {
  counter += 1
  return `row-${counter}`
}

export function blankRow(): LinkRowState {
  return {
    id: nextId(),
    ownerName: '',
    ownerType: 'individual',
    ownerIsController: false,
    percent: Number.NaN,
    percentText: '',
    entityName: '',
  }
}

/** Parses the percentage box; blank or nonsense becomes NaN, which validation rejects. */
export function parsePercent(text: string): number {
  return text.trim() === '' ? Number.NaN : Number(text)
}

export function withPercentText(row: LinkRowState, percentText: string): LinkRowState {
  return { ...row, percentText, percent: parsePercent(percentText) }
}

/** Switching an owner to a company drops the controller flag, which is person-only. */
export function withOwnerType(row: LinkRowState, ownerType: PartyType): LinkRowState {
  return {
    ...row,
    ownerType,
    ownerIsController: ownerType === 'individual' ? row.ownerIsController : false,
  }
}

/** A row nobody has touched yet — we hold back its inline errors until they do. */
export function isRowDirty(row: LinkRowState): boolean {
  return (
    row.ownerName.trim() !== '' || row.entityName.trim() !== '' || row.percentText.trim() !== ''
  )
}

/** The CLAUDE.md sample structure, with fresh row ids. */
export function exampleRows(): LinkRowState[] {
  return SAMPLE_LINKS.map((link) => ({
    ...link,
    id: nextId(),
    percentText: String(link.percent),
  }))
}
