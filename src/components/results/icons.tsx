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
