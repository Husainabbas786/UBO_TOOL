import { describe, expect, it } from 'vitest'
import { blankRow, hasNamedCompany, isRowDirty, nextCompanyToComplete, withEntityName } from './rows'
import type { LinkRowState } from './rows'

/** A completed builder row, the way the UI would hold it. */
function row(
  ownerName: string,
  percent: number,
  entityName: string,
  extra: Partial<LinkRowState> = {},
): LinkRowState {
  return {
    ...blankRow(),
    ownerName,
    percent,
    percentText: String(percent),
    entityName,
    ...extra,
  }
}

describe('the company a new row should point at', () => {
  it('asks for nothing when no company has been named yet', () => {
    expect(nextCompanyToComplete([blankRow()], null)).toBeNull()
    expect(hasNamedCompany([blankRow()])).toBe(false)
  })

  it('points at the Meydan FZ company while its shareholders are short of 100%', () => {
    const rows = [row('Masood', 25, 'ABC LTD')]
    expect(nextCompanyToComplete(rows, 'abc ltd')).toBe('ABC LTD')
    expect(hasNamedCompany(rows)).toBe(true)
  })

  it('moves on to the first unfinished intermediary once the target reaches 100%', () => {
    const rows = [
      row('Masood', 25, 'ABC LTD'),
      row('XYZ Ltd', 75, 'ABC LTD', { ownerType: 'company' }),
    ]
    expect(nextCompanyToComplete(rows, 'abc ltd')).toBe('XYZ Ltd')
  })

  it('takes the intermediaries first-come-first', () => {
    const rows = [
      row('First Holdings', 60, 'ABC LTD', { ownerType: 'company' }),
      row('Second Holdings', 40, 'ABC LTD', { ownerType: 'company' }),
      row('Husain', 100, 'First Holdings'),
    ]
    expect(nextCompanyToComplete(rows, 'abc ltd')).toBe('Second Holdings')
  })

  it('puts the Meydan FZ company first even when it was entered last', () => {
    const rows = [
      row('Husain', 100, 'XYZ Ltd'),
      row('XYZ Ltd', 40, 'ABC LTD', { ownerType: 'company' }),
    ]
    // XYZ Ltd is already complete; ABC LTD, the target, is the one to finish.
    expect(nextCompanyToComplete(rows, 'abc ltd')).toBe('ABC LTD')
  })

  it('suggests nothing once every company totals 100%', () => {
    const rows = [
      row('Masood', 25, 'ABC LTD'),
      row('XYZ Ltd', 75, 'ABC LTD', { ownerType: 'company' }),
      row('Husain', 50, 'XYZ Ltd'),
      row('Dinesh', 50, 'XYZ Ltd'),
    ]
    expect(nextCompanyToComplete(rows, 'abc ltd')).toBeNull()
  })

  it('does not count a 0% control row towards completing a company', () => {
    const rows = [
      row('Masood', 100, 'ABC LTD'),
      row('Nadia', 0, 'XYZ Ltd', { ownerIsController: true, percentText: '' }),
    ]
    expect(nextCompanyToComplete(rows, 'abc ltd')).toBe('XYZ Ltd')
  })
})

describe('a prefilled company name', () => {
  it('leaves the row counting as untouched, so its errors stay quiet', () => {
    expect(isRowDirty(blankRow('ABC LTD'))).toBe(false)
    expect(isRowDirty(blankRow())).toBe(false)
  })

  it('becomes the user’s own the moment they edit the field', () => {
    const edited = withEntityName(blankRow('ABC LTD'), 'ABC LTD Holdings')
    expect(edited.entityPrefilled).toBe(false)
    expect(isRowDirty(edited)).toBe(true)
  })

  it('creates no ghost company, because a row with no owner is not a link', () => {
    expect(hasNamedCompany([blankRow('ABC LTD')])).toBe(false)
  })
})
