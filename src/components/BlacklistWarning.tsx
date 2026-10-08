import type { PartyType } from '../engine'
import { blacklistWarning } from '../risk/countryRisk'
import { risk } from '../theme/tokens'

/**
 * The crimson "cannot onboard" line under a country field, shown the moment a
 * blacklisted combination is picked. Nothing for anybody who may be onboarded —
 * an Iranian national is High, not blacklisted, and gets no warning.
 *
 * A warning, never a block: Calculate stays available so the structure can
 * still be charted to document a rejection.
 */
export function BlacklistWarning({
  country,
  partyType,
  className = '',
}: {
  country: string | null | undefined
  partyType: PartyType
  className?: string
}) {
  const message = blacklistWarning(country, partyType)
  if (message === null) return null
  return (
    <p
      role="alert"
      className={`text-small font-semibold ${className}`}
      style={{ color: risk.riskBlacklisted }}
    >
      {message}
    </p>
  )
}
