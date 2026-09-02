import { pattern } from '../theme/tokens'

/**
 * Concentric thin rings in steel blue at 15% opacity — the one decorative
 * moment in the tool, sitting behind the title band and nowhere else.
 */
function RingPattern() {
  const rings = [40, 78, 116, 154, 192, 230, 268]
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute -right-24 top-1/2 h-[300px] -translate-y-1/2"
      width="520"
      height="320"
      viewBox="0 0 520 320"
      fill="none"
    >
      <g opacity={pattern.opacity} stroke={pattern.ring} strokeWidth="1.5" fill="none">
        {rings.map((r) => (
          <circle key={r} cx="400" cy="160" r={r} />
        ))}
      </g>
    </svg>
  )
}

export function Header() {
  return (
    <header className="border-b border-line bg-white">
      <div className="relative mx-auto max-w-5xl overflow-hidden px-6 py-9">
        <RingPattern />
        <div className="relative">
          <h1 className="text-h1 font-semibold text-mfzBlue">UBO structuring tool</h1>
          <p className="mt-1.5 text-body font-medium text-navy">Meydan Free Zone — Compliance</p>
        </div>
      </div>
    </header>
  )
}
