/** Guards against float drift when comparing a percentage to a threshold. */
export const EPSILON = 1e-9

/** Rounds to 2 decimals, half away from zero, which is what compliance expects. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON * Math.sign(value)) * 100) / 100
}

/** Always 2 decimals: 37.5 -> "37.50". Used everywhere a % is displayed. */
export function formatPercent(value: number): string {
  return round2(value).toFixed(2)
}

/** Trims pointless zeros: 50 -> "50", 50.5 -> "50.5". Used in error messages. */
export function formatPercentShort(value: number): string {
  return String(round2(value))
}

/** `a >= b` for percentages, tolerant of float drift at the boundary. */
export function atLeast(value: number, threshold: number): boolean {
  return value >= threshold - EPSILON
}
