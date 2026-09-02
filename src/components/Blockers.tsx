/** Why Calculate is disabled, and any non-blocking notes. */
export function Blockers({ reasons, warnings }: { reasons: string[]; warnings: string[] }) {
  if (reasons.length === 0 && warnings.length === 0) return null

  return (
    <div className="space-y-3">
      {reasons.length > 0 ? (
        <div className="rounded-card border border-coral bg-gapTint px-4 py-3">
          <p className="text-body font-semibold text-coral">
            Fix {reasons.length === 1 ? 'this' : `these ${reasons.length} issues`} before
            calculating:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-body text-coral">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="rounded-card border border-steelBlue bg-infoTint px-4 py-3">
          <ul className="list-disc space-y-1 pl-5 text-body text-navy">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
