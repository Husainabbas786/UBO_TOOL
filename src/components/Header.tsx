import { pattern } from '../theme/tokens'

/**
 * Concentric thin rings, anchored to the right edge of the page container and
 * clipped to the header band. This is the only decoration in the tool.
 */
function RingPattern() {
  const rings = [38, 74, 110, 146, 182, 218, 254]
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2"
      width="460"
      height="460"
      viewBox="0 0 460 460"
      fill="none"
    >
      <g opacity={pattern.opacity} stroke={pattern.ring} strokeWidth="1.5" fill="none">
        {rings.map((r) => (
          <circle key={r} cx="330" cy="230" r={r} />
        ))}
      </g>
    </svg>
  )
}

/**
 * Logo, rule, title: one masthead rather than three stacked items.
 *
 * The logo is served exactly as supplied and sized only by CSS height, so it is
 * only ever scaled down. The rule sits 28px from each neighbour, and the whole
 * lock-up is vertically centred in the band.
 */
/*
 * React 18 does not know the camelCase `fetchPriority` prop and warns about it
 * on every page load; the lowercase DOM attribute is passed straight through
 * without complaint. React 19 accepts the camelCase form natively, so this can
 * go back to a plain prop whenever we move.
 */
const HIGH_PRIORITY: Record<string, string> = { fetchpriority: 'high' }

export function Header() {
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto max-w-page px-6">
        <div className="relative flex h-header items-center overflow-hidden">
          <RingPattern />
          <div className="relative flex items-center gap-7">
            <img
              src="./brand/mfz-logo.png"
              alt="Meydan Free Zone"
              className="h-logo w-auto shrink-0"
              width={892}
              height={324}
              decoding="sync"
              {...HIGH_PRIORITY}
            />
            <span className="h-14 w-px shrink-0 bg-line" aria-hidden />
            <div>
              <h1 className="text-masthead font-semibold text-mfzBlue">UBO Structuring Tool</h1>
              <p className="mt-1 text-mastheadSub font-medium text-navy">Compliance Department</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
