import { useEffect, useMemo, useState } from 'react'
import {
  buildGraph,
  calculate,
  companyTotals,
  DEFAULT_THRESHOLD,
  defaultTargetKey,
  TOTAL_TOLERANCE,
  validate,
  toKey,
  type CalculationResult,
  type ValidationIssue,
} from './engine'
import { blankRow, exampleRows, isRowDirty, type LinkRowState } from './lib/rows'
import { Blockers } from './components/Blockers'
import { LinksBuilder } from './components/LinksBuilder'
import { TargetSelect } from './components/TargetSelect'
import { ThresholdSelect } from './components/ThresholdSelect'
import { ResultsPanel } from './components/results/ResultsPanel'
import { Button, Card } from './components/ui'

export default function App() {
  const [rows, setRows] = useState<LinkRowState[]>(() => [blankRow()])
  const [threshold, setThreshold] = useState<number>(DEFAULT_THRESHOLD)
  const [chosenTargetKey, setChosenTargetKey] = useState<string | null>(null)
  const [result, setResult] = useState<CalculationResult | null>(null)
  const [engineError, setEngineError] = useState<string | null>(null)

  const graph = useMemo(() => buildGraph(rows), [rows])
  const validation = useMemo(() => validate(rows, graph), [rows, graph])
  const totals = useMemo(() => companyTotals(graph), [graph])

  // The user's choice holds only while it is still a candidate; an edit that
  // removes it falls back to the auto-detected target.
  const targetKey =
    chosenTargetKey && graph.targetCandidates.some((c) => c.key === chosenTargetKey)
      ? chosenTargetKey
      : defaultTargetKey(graph)

  // A stale result is worse than no result, so any edit clears it.
  useEffect(() => {
    setResult(null)
    setEngineError(null)
  }, [rows, threshold, targetKey])

  const anyRowDirty = rows.some(isRowDirty)
  const incompleteRowIds = new Set(rows.filter((row) => !isRowDirty(row)).map((row) => row.id))

  const issuesByRow = new Map<string, ValidationIssue[]>()
  for (const issue of validation.errors) {
    if (!issue.linkId || incompleteRowIds.has(issue.linkId)) continue
    const existing = issuesByRow.get(issue.linkId)
    if (existing) existing.push(issue)
    else issuesByRow.set(issue.linkId, [issue])
  }

  const partyIssues = validation.errors.filter(
    (issue) => issue.nodeKey !== undefined && issue.code !== 'totals-not-100',
  )

  const totalsWithStatus = totals.map((company) => ({
    ...company,
    ok: Math.abs(company.total - 100) <= TOTAL_TOLERANCE + 1e-9,
  }))

  const reasons = anyRowDirty ? blockingReasons(validation.errors, rows, incompleteRowIds) : []
  const canCalculate = validation.ok && targetKey !== null

  /**
   * Control is a property of a person, not of a row. Toggling the box therefore
   * updates every row where the same individual appears, so the boxes can never
   * disagree with each other or with what the engine concludes.
   */
  const handleChangeRow = (updated: LinkRowState) => {
    setRows((current) => {
      const previous = current.find((row) => row.id === updated.id)
      const next = current.map((row) => (row.id === updated.id ? updated : row))
      const toggledControl =
        previous !== undefined && previous.ownerIsController !== updated.ownerIsController
      const ownerKey = toKey(updated.ownerName)
      if (!toggledControl || updated.ownerType !== 'individual' || ownerKey === '') return next
      return next.map((row) =>
        row.ownerType === 'individual' && toKey(row.ownerName) === ownerKey
          ? { ...row, ownerIsController: updated.ownerIsController }
          : row,
      )
    })
  }

  const handleCalculate = () => {
    if (!targetKey) return
    try {
      setResult(calculate(rows, { targetKey, threshold }))
      setEngineError(null)
    } catch (error) {
      setResult(null)
      setEngineError(error instanceof Error ? error.message : String(error))
    }
  }

  const handleStartOver = () => {
    setRows([blankRow()])
    setThreshold(DEFAULT_THRESHOLD)
    setChosenTargetKey(null)
    setResult(null)
    setEngineError(null)
  }

  const handleLoadExample = () => {
    setRows(exampleRows())
    setThreshold(DEFAULT_THRESHOLD)
    setChosenTargetKey(null)
    setResult(null)
    setEngineError(null)
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-5">
          <h1 className="text-xl font-semibold">UBO Structuring Tool</h1>
          <p className="text-sm text-slate-500">Meydan Free Zone — Compliance</p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <Card
          title="Ownership Links"
          description="One row per shareholding: who owns what percentage of which company."
        >
          <LinksBuilder
            rows={rows}
            issuesByRow={issuesByRow}
            incompleteRowIds={anyRowDirty ? incompleteRowIds : new Set<string>()}
            companyTotals={totalsWithStatus}
            partyIssues={partyIssues}
            onChangeRow={handleChangeRow}
            onRemoveRow={(id) => setRows((current) => current.filter((row) => row.id !== id))}
            onAddRow={() => setRows((current) => [...current, blankRow()])}
          />
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card title="Threshold">
            <ThresholdSelect value={threshold} onChange={setThreshold} />
          </Card>
          <Card title="Target Entity">
            <TargetSelect
              candidates={graph.targetCandidates}
              value={targetKey}
              onChange={setChosenTargetKey}
            />
          </Card>
        </div>

        <Card title="Calculate">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" disabled={!canCalculate} onClick={handleCalculate}>
                Calculate Ownership
              </Button>
              <Button onClick={handleLoadExample}>Load example</Button>
              <Button variant="ghost" onClick={handleStartOver}>
                Start Over
              </Button>
            </div>

            {!anyRowDirty ? (
              <p className="text-sm text-slate-500">
                Enter at least one ownership link, or load the example structure to see how it
                works.
              </p>
            ) : null}

            <Blockers reasons={reasons} warnings={validation.warnings.map((w) => w.message)} />

            {engineError ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {engineError}
              </div>
            ) : null}

          </div>
        </Card>

        {result ? <ResultsPanel result={result} /> : null}
      </main>

      <footer className="mx-auto max-w-5xl px-6 pb-10 text-xs text-slate-500">
        For internal compliance use. Informational only — does not constitute legal advice.
      </footer>
    </div>
  )
}

/**
 * Turns validation errors into the list shown under a disabled Calculate button:
 * row errors get a row number, an untouched row collapses to one neutral line,
 * and duplicate messages are shown once.
 */
function blockingReasons(
  errors: ValidationIssue[],
  rows: LinkRowState[],
  incompleteRowIds: Set<string>,
): string[] {
  const reasons: string[] = []
  const seen = new Set<string>()

  const add = (text: string) => {
    if (seen.has(text)) return
    seen.add(text)
    reasons.push(text)
  }

  for (const issue of errors) {
    if (!issue.linkId) {
      add(issue.message)
      continue
    }
    const index = rows.findIndex((row) => row.id === issue.linkId)
    const label = index >= 0 ? `Row ${index + 1}` : 'A row'
    if (incompleteRowIds.has(issue.linkId)) add(`${label}: complete this row or remove it.`)
    else add(`${label}: ${issue.message}`)
  }

  return reasons
}
