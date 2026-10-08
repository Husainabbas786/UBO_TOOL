import type { RiskRating } from '../risk/countryRisk'
import { chart } from '../theme/tokens'

/**
 * A country risk pill. Low gets nothing — most parties are Low, and a chip on
 * every one of them would drown the ones that matter.
 *
 * Coloured with inline hex rather than Tailwind classes, from the same values
 * the chart uses, so the chip is identical on screen, in the chart and in an
 * exported PNG or PDF.
 */
export function RiskChip({ rating }: { rating: RiskRating | null | undefined }) {
  if (!rating || rating === 'Low') return null
  const colours = chart.riskChip[rating]
  return (
    <span
      className="inline-block whitespace-nowrap rounded-pill border px-2 py-px text-[11px] font-semibold leading-4"
      style={{ background: colours.fill, borderColor: colours.stroke, color: colours.text }}
    >
      {rating}
    </span>
  )
}
