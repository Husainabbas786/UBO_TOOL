import { describe, expect, it } from 'vitest'
import type { NomineeArrangement } from '../../engine'
import { describeNominee } from './SummaryBlock'

/**
 * The nominee line in the Summary.
 *
 * Wording is the whole substance here: the same facts stated in the wrong
 * order say that the nominee holds a stake of their own, which is what the
 * arrangement exists to deny. So the sentence itself is pinned.
 */
describe('the nominee line', () => {
  const arrangement: NomineeArrangement = {
    nomineeKey: 'dinesh',
    nomineeName: 'Dinesh',
    entityKey: 'abc ltd',
    entityName: 'ABC LTD',
    nominatorKey: 'stephan',
    nominatorName: 'Stephan',
    percent: 40,
  }

  /** The list renders the nominator's name in bold, then this clause. */
  const line = (entry: NomineeArrangement) => `${entry.nominatorName}${describeNominee(entry)}`

  it('names the owner first and the nominee only as the holder', () => {
    expect(line(arrangement)).toBe(
      'Stephan is the beneficial owner of the 40.00% shareholding in ABC LTD held in the name of nominee Dinesh.',
    )
  })

  it('never says the nominee holds the shareholding', () => {
    const sentence = line(arrangement)
    expect(sentence.indexOf('Stephan')).toBeLessThan(sentence.indexOf('Dinesh'))
    expect(sentence).not.toContain('Dinesh holds')
    expect(sentence).not.toContain('as nominee for')
  })

  it('gives the percentage to two decimals, on the shareholding itself', () => {
    expect(describeNominee({ ...arrangement, percent: 21.5 })).toContain(
      'the 21.50% shareholding in ABC LTD',
    )
  })
})
