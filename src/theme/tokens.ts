/**
 * Meydan Free Zone design tokens — the single source of truth for colour,
 * type and shape in this tool. Every value comes from BRAND.md; nothing here
 * is invented. Tailwind reads this file (see tailwind.config.ts) and
 * src/index.css mirrors the same values as CSS custom properties.
 *
 * Keep this module pure data with no imports: Tailwind loads it through jiti,
 * outside Vite, so Vite-only syntax (`?url`, `import.meta`) would break the build.
 */

/** Core brand colours. */
export const brand = {
  mfzBlue: '#00518C',
  mfzGreen: '#62A830',
  lightGreen: '#029956',
  darkGreen: '#06603A',
} as const

/** Accents. BRAND.md gives each one job; `lime` and `magenta` are reserved. */
export const accent = {
  navy: '#1F3F76',
  deepTeal: '#0B7A9E',
  teal: '#64BEC7',
  steelBlue: '#6A9DBF',
  paleSky: '#D2F0FC',
  sage: '#75B677',
  purple: '#8B65A4',
  coral: '#D26153',
} as const

/**
 * Neutrals, derived from the cool blue-grey field rather than pure grey.
 * `#0F1F33` is the body text near-navy; pure black is never used.
 */
export const neutral = {
  ink: '#0F1F33',
  muted: '#6A7C8F',
  line: '#E3EBF2',
  field: '#F4F8FB',
  fieldBorder: '#D6E0E8',
  disabled: '#C9D3DC',
  white: '#FFFFFF',
} as const

/** State fills and tints, straight from the states table in BRAND.md. */
export const state = {
  uboTint: '#ECF6E4',
  gapTint: '#FBE9E6',
  infoTint: '#D2F0FC',
} as const

/**
 * Tint ramp. BRAND.md says to mix each primary with white at 80/60/40/20/10%;
 * we read those as the strength of the colour, so `t80` is 80% colour and 20%
 * white and `t10` is the palest step.
 */
const TINT_STEPS = [80, 60, 40, 20, 10] as const

function mixWithWhite(hex: string, strength: number): string {
  const value = hex.replace('#', '')
  const channel = (offset: number) => {
    const raw = Number.parseInt(value.slice(offset, offset + 2), 16)
    return Math.round(raw * strength + 255 * (1 - strength))
  }
  return `#${[0, 2, 4].map((o) => channel(o).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

/** `tints('#00518C')` -> `{ t80, t60, t40, t20, t10 }`, palest last. */
export function tints(hex: string): Record<`t${(typeof TINT_STEPS)[number]}`, string> {
  return Object.fromEntries(
    TINT_STEPS.map((step) => [`t${step}`, mixWithWhite(hex, step / 100)]),
  ) as Record<`t${(typeof TINT_STEPS)[number]}`, string>
}

/** Brand gradients. Buttons use the teal→navy and green pairs. */
export const gradient = {
  hero: [accent.navy, accent.paleSky],
  tealGreen: [accent.deepTeal, brand.darkGreen, brand.mfzGreen],
  green: [brand.darkGreen, brand.mfzGreen],
  buttonPrimary: [accent.deepTeal, accent.navy],
  /**
   * The green CTA runs dark-to-light. BRAND.md lists `#62A830 → #06603A`, but
   * white SemiBold text does not reach AA over the lighter end, so the dark
   * green leads and holds most of the button.
   */
  buttonGreen: [brand.darkGreen, brand.mfzGreen],
  /** The 3px keyline under the masthead: the band's anchor, full bleed. */
  headerKeyline: [accent.deepTeal, brand.mfzBlue, brand.mfzGreen],
} as const

export const font = {
  sans: '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
  weights: { light: 300, regular: 400, medium: 500, semibold: 600, bold: 700 },
} as const

/** Type scale from BRAND.md, with the on-screen legibility adjustments it allows. */
export const typeScale = {
  /** The masthead sits slightly under H1 so the logo leads the composition. */
  masthead: { size: '34px', lineHeight: '38px', weight: 600, tracking: '-0.01em' },
  mastheadSub: { size: '15px', lineHeight: '20px', weight: 500, tracking: '0' },
  /** Card titles, a step up from H3 so sections read at a glance. */
  cardTitle: { size: '20px', lineHeight: '26px', weight: 600, tracking: '0' },
  h1: { size: '36px', lineHeight: '38px', weight: 600, tracking: '-0.01em' },
  h2: { size: '24px', lineHeight: '28px', weight: 600, tracking: '-0.01em' },
  h3: { size: '18px', lineHeight: '21px', weight: 600, tracking: '0' },
  h4: { size: '14px', lineHeight: '18px', weight: 500, tracking: '0' },
  body: { size: '14px', lineHeight: '20px', weight: 400, tracking: '0' },
  small: { size: '13px', lineHeight: '18px', weight: 400, tracking: '0' },
  cta: { size: '14px', lineHeight: '20px', weight: 600, tracking: '0' },
} as const

/** Buttons are pills; everything else is gently rounded. Inputs are 6px. */
export const radius = {
  input: '6px',
  card: '10px',
  pill: '9999px',
} as const

/** Table rows sit at the generous end of the 44–48px range in BRAND.md. */
export const table = {
  rowHeight: '46px',
} as const

/**
 * Page geometry. The input column stays comfortable to read across, while the
 * results run wider so a deep ownership chart has somewhere to go.
 */
export const layout = {
  pageWidth: '1320px',
  resultsWidth: '1440px',
  headerHeight: '112px',
  logoHeight: '64px',
  /** Below this the ownership row is allowed to wrap onto a second line. */
  rowNoWrapFrom: '1100px',
  /**
   * Below this the masthead drops its right-hand label and quietens the rings:
   * at that width the two halves would collide rather than balance.
   */
  bandLabelFrom: '900px',
} as const

/**
 * Chart colours. These are written straight into the SVG as hex so that an
 * exported PNG or PDF renders identically to the screen — never CSS variables.
 */
export const chart = {
  individual: { fill: '#FFFFFF', stroke: '#6A9DBF', text: '#0F1F33', icon: '#6A9DBF' },
  individualUbo: { fill: '#ECF6E4', stroke: '#62A830', text: '#06603A', icon: '#62A830' },
  company: { fill: '#F4F8FB', stroke: '#00518C', text: '#0F1F33', icon: '#00518C' },
  target: { fill: '#1F3F76', stroke: '#1F3F76', text: '#FFFFFF', icon: '#FFFFFF' },
  ownershipEdge: { stroke: '#6A9DBF', label: '#0F1F33', chip: '#FFFFFF' },
  controlEdge: { stroke: '#8B65A4', label: '#8B65A4', chip: '#FFFFFF' },
  controlBadge: { fill: '#8B65A4', text: '#FFFFFF' },
  surface: '#FFFFFF',
} as const

/**
 * The one decorative moment: concentric rings in the header band, echoing the
 * ring in the logo. Anchored to the right edge with the widest ring running off
 * it, so the motif reads as deliberate rather than as a stray watermark — held
 * at a fifth strength, which is enough to see and too little to compete with
 * the masthead. Narrow screens take the quieter setting.
 */
export const pattern = {
  ring: accent.steelBlue,
  ringAlt: accent.deepTeal,
  opacity: 0.2,
  opacityCompact: 0.12,
} as const

/**
 * The masthead wash: clean white under the logo, easing to the palest sky at
 * roughly a third strength on the right. Light enough that navy and MFZ blue
 * hold AA over every part of it.
 */
export const headerWash = {
  from: neutral.white,
  /** paleSky at ~35% strength over white. */
  to: mixWithWhite(accent.paleSky, 0.35),
  /** The logo sits on flat white; the wash starts after it. */
  holdWhiteTo: '38%',
} as const
