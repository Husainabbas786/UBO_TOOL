/** Why Calculate is disabled, and any non-blocking notes. */
export function Blockers({ reasons, warnings }: { reasons: string[]; warnings: string[] }) {
  if (reasons.length === 0 && warnings.length === 0) return null

  return (
    <div className="space-y-3">
      {reasons.length > 0 ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="text-sm font-medium text-rose-800">
            Fix {reasons.length === 1 ? 'this' : `these ${reasons.length} issues`} before
            calculating:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-700">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
