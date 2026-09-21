/**
 * Chart glyphs, drawn as SVG paths in an 18x18 box so they can be dropped
 * straight into the chart with a translate. A person is never drawn for a
 * company, and vice versa — the engine decides the type, not the renderer.
 */
export function PersonGlyph({ colour }: { colour: string }) {
  return (
    <g fill="none" stroke={colour} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={9} cy={6} r={3.4} />
      <path d="M2.8 16.2c0-3.4 2.8-5.6 6.2-5.6s6.2 2.2 6.2 5.6" />
    </g>
  )
}

export function BuildingGlyph({ colour }: { colour: string }) {
  return (
    <g fill="none" stroke={colour} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.2 16.4V3.4h11.6v13" />
      <path d="M1.6 16.4h14.8" />
      <path d="M6.2 6.4h1.6M10.2 6.4h1.6M6.2 9.4h1.6M10.2 9.4h1.6" />
      <path d="M7.6 16.4v-3.4h2.8v3.4" />
    </g>
  )
}

/**
 * A trust, foundation or NPO: a sealed deed rather than a building. A trust is
 * not a company, and drawing it as one is exactly the confusion to avoid.
 */
export function DeedGlyph({ colour }: { colour: string }) {
  return (
    <g fill="none" stroke={colour} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2.2h7.2l3 3v8.4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3.2a1 1 0 0 1 1-1z" />
      <path d="M10.8 2.4v3.2h3.2" />
      <path d="M5.6 8.2h5M5.6 10.6h3.4" />
      <circle cx={12.4} cy={13.4} r={2.4} />
      <path d="M11.2 15.4v2.2l1.2-.8 1.2.8v-2.2" />
    </g>
  )
}
