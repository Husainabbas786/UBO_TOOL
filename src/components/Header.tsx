import { gradient, headerWash, pattern } from '../theme/tokens'

/*
 * React 18 does not know the camelCase `fetchPriority` prop and warns about it
 * on every page load; the lowercase DOM attribute is passed straight through
 * without complaint. React 19 accepts the camelCase form natively, so this can
 * go back to a plain prop whenever we move.
 */
const HIGH_PRIORITY: Record<string, string> = { fetchpriority: 'high' }

/*
 * Ring radii, opening out from small to large.
 *
 * The band is 112px tall, so anything wider than a 56px radius can only ever
 * show as an arc. The two innermost rings are deliberately under that: they sit
 * whole inside the band and are what makes the device read as rings at all,
 * with the larger ones opening out behind them and running off the edge.
 */
const RING_RADII = [26, 50, 82, 122, 170, 226, 290, 362]

/** The ring field's box. `cx` sits 56px in, so the small rings clear the edge. */
const FIELD = { width: 800, height: 800, cx: 744, cy: 400 }

/**
 * The brand's ring device, echoing the ring in the logo.
 *
 * Anchored to the right edge of the band and centred in it, with the outer
 * rings running off the edge and clipped by the band — the bleed is what makes
 * it read as a motif rather than as a circle someone left behind. Two strokes
 * alternate so the field has some depth at this low a strength.
 */
function RingMotif() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2"
      // Strength lives in CSS so it can drop on narrow screens; see index.css.
      style={{ opacity: 'var(--ring-strength)' }}
      width={FIELD.width}
      height={FIELD.height}
      viewBox={`0 0 ${FIELD.width} ${FIELD.height}`}
      fill="none"
    >
      {RING_RADII.map((r, index) => (
        <circle
          key={r}
          cx={FIELD.cx}
          cy={FIELD.cy}
          r={r}
          fill="none"
          stroke={index % 2 === 0 ? pattern.ring : pattern.ringAlt}
          strokeWidth={1.5}
        />
      ))}
    </svg>
  )
}

/**
 * Two lines naming what the tool is for, set against the ring field.
 *
 * A soft white glow sits under the text so it stays legible wherever a ring
 * happens to pass behind a letter, without needing a panel or a box.
 */
function BandLabel() {
  return (
    <div className="relative hidden shrink-0 band:block">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-10 -inset-y-6"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.72) 45%, rgba(255,255,255,0) 75%)',
        }}
      />
      <p className="relative text-right text-small font-medium leading-[19px] text-navy">
        Beneficial ownership analysis
        <span className="block">UAE Ministry of Economy compliance</span>
      </p>
    </div>
  )
}

/**
 * The masthead: a wash, a ring motif, the lock-up, and a gradient keyline.
 *
 * The wash, the rings and the keyline all run the full width of the band while
 * the content stays in the page container, so the band reads as a surface the
 * page sits on rather than as a wide box around a narrow row.
 *
 * The logo is served exactly as supplied and sized only by CSS height, so it is
 * only ever scaled down.
 */
export function Header() {
  return (
    <header
      className="relative overflow-hidden"
      style={{
        background: `linear-gradient(to right, ${headerWash.from} 0%, ${headerWash.from} ${headerWash.holdWhiteTo}, ${headerWash.to} 100%)`,
      }}
    >
      <RingMotif />

      <div className="relative mx-auto max-w-page px-6">
        <div className="flex h-header items-center justify-between gap-8">
          <div className="flex items-center gap-7">
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

          <BandLabel />
        </div>
      </div>

      {/* The anchor: full-bleed, and the only place these three run together. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[3px]"
        style={{ background: `linear-gradient(to right, ${gradient.headerKeyline.join(', ')})` }}
      />
    </header>
  )
}
