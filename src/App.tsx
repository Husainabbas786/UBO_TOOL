import { useEffect, useMemo, useState } from 'react'
import {
  buildGraph,
  calculate,
  companyTotals,
  DEFAULT_THRESHOLD,
  defaultTargetKey,
  resolveOwnerKinds,
  TOTAL_TOLERANCE,
  validate,
  toKey,
  type CalculationResult,
  type EntityKind,
  type ValidationIssue,
} from './engine'
import {
  blankRelatedRow,
  blankRow,
  exampleRows,
  hasNamedCompany,
  isRelatedRowDirty,
  isRowDirty,
  nextCompanyToComplete,
  withOwnerKind,
  type LinkRowState,
  type RelatedRowState,
} from './lib/rows'
import { Blockers } from './components/Blockers'
import { LinksBuilder } from './components/LinksBuilder'
import { RelatedParties } from './components/RelatedParties'
import { TargetSelect } from './components/TargetSelect'
import { ThresholdSelect } from './components/ThresholdSelect'
import { Header } from './components/Header'
import { ResultsPanel } from './components/results/ResultsPanel'
import { Button, Card } from './components/ui'

export default function App() {
  const [rows, setRows] = useState<LinkRowState[]>(() => [blankRow()])
  const [relatedRows, setRelatedRows] = useState<RelatedRowState[]>([])
  const [threshold, setThreshold] = useState<number>(DEFAULT_THRESHOLD)
  const [chosenTargetKey, setChosenTargetKey] = useState<string | null>(null)
  const [result, setResult] = useState<CalculationResult | null>(null)
  const [engineError, setEngineError] = useState<string | null>(null)

  const graph = useMemo(() => buildGraph(rows), [rows])
  /** Only the links the agent has actually started; a blank one is ignored. */
  const relatedParties = useMemo(() => relatedRows.filter(isRelatedRowDirty), [relatedRows])
  const totals = useMemo(() => companyTotals(graph), [graph])

  /*
   * What each row's shareholder is, resolved across every row that names it.
   *
   * The legal type belongs to the shareholder, not to the row: marking "Smith
   * Family Trust" a trust once has to show it as a trust wherever else it holds
   * shares, including on rows typed before the type was set.
   */
  const ownerKinds = useMemo(() => {
    const kinds = resolveOwnerKinds(rows)
    return new Map<string, EntityKind>(
      rows.map((row) => {
        const key = toKey(row.ownerName)
        return [row.id, key === '' ? row.ownerKind : (kinds.get(key) ?? 'company')]
      }),
    )
  }, [rows])

  // The user's choice holds only while it is still a candidate; an edit that
  // removes it falls back to the auto-detected target.
  const targetKey =
    chosenTargetKey && graph.targetCandidates.some((c) => c.key === chosenTargetKey)
      ? chosenTargetKey
      : defaultTargetKey(graph)

  // Validation needs the target: the company being analysed holds 100% of
  // itself, so it can never be a member of a related-party group.
  const validation = useMemo(
    () => validate(rows, graph, relatedParties, targetKey),
    [rows, graph, relatedParties, targetKey],
  )

  /*
   * A stale result is worse than no result, so any edit clears it.
   *
   * The guard keeps the effect from scheduling a render on every keystroke to
   * set state that is already null — there is only ever one result to clear.
   * `result` and `engineError` are read but deliberately not dependencies: the
   * effect should run on edits, not when it clears the state it is reading.
   */
  useEffect(() => {
    if (result === null && engineError === null) return
    setResult(null)
    setEngineError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, relatedRows, threshold, targetKey])

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

  const relatedIssues = validation.errors.filter((issue) => issue.relatedId !== undefined)

  const totalsWithStatus = totals.map((company) => ({
    ...company,
    ok: Math.abs(company.total - 100) <= TOTAL_TOLERANCE + 1e-9,
  }))

  const reasons = anyRowDirty ? blockingReasons(validation.errors, rows, incompleteRowIds) : []
  const canCalculate = validation.ok && targetKey !== null

  /*
   * Guide the agent through one company at a time.
   *
   * The mistake this prevents is real and expensive: with an empty company box
   * on every row, shareholders of an intermediary get typed against the Meydan
   * FZ company, whose owners then total 200% and whose structure is simply
   * wrong. A new row therefore arrives already pointed at the company still
   * short of 100% — the Meydan FZ company first, then each intermediary in
   * turn — and the name stays editable, because it is a suggestion and not a
   * rule.
   */
  const handleAddRow = () =>
    setRows((current) => [...current, blankRow(nextCompanyToComplete(current, targetKey) ?? '')])

  const entityPlaceholder = hasNamedCompany(rows) ? 'Company name' : 'Meydan FZ company name'

  /**
   * Control is a property of a person, not of a row. Toggling the box therefore
   * updates every row where the same individual appears, so the boxes can never
   * disagree with each other or with what the engine concludes.
   *
   * A nominee row is left alone. Shares held on paper for somebody else are the
   * opposite claim to holding control of them, and a row carrying both flags
   * would show neither box — leaving it stuck with no way to untick either.
   */
  const handleChangeRow = (updated: LinkRowState) => {
    setRows((current) => {
      const previous = current.find((row) => row.id === updated.id)
      const next = current.map((row) => (row.id === updated.id ? updated : row))
      const ownerKey = toKey(updated.ownerName)
      if (ownerKey === '') return next

      /*
       * The people behind a trust belong to the trust, not to one of its rows.
       * A structure holding stakes in two companies has two rows, and its
       * people have to read the same on both — so an edit to the list is
       * copied to every row naming it, the same way the kind is.
       */
      if (previous !== undefined && previous.roleHolders !== updated.roleHolders) {
        return next.map((row) =>
          row.id !== updated.id && row.ownerType === 'company' && toKey(row.ownerName) === ownerKey
            ? { ...row, roleHolders: updated.roleHolders }
            : row,
        )
      }

      const toggledControl =
        previous !== undefined && previous.ownerIsController !== updated.ownerIsController
      if (!toggledControl || updated.ownerType !== 'individual') return next
      return next.map((row) =>
        row.ownerType === 'individual' && !row.ownerIsNominee && toKey(row.ownerName) === ownerKey
          ? { ...row, ownerIsController: updated.ownerIsController }
          : row,
      )
    })
  }

  /**
   * What a shareholder is belongs to the shareholder, not to the row, so
   * picking a legal type sets it on every row naming that shareholder. Without
   * this, marking a trust on its second row would leave the first still
   * showing it as an ordinary company.
   */
  const handleChangeOwnerKind = (row: LinkRowState, kind: EntityKind) => {
    const ownerKey = toKey(row.ownerName)
    setRows((current) => {
      const next = current.map((candidate) => {
        if (ownerKey === '') {
          return candidate.id === row.id ? withOwnerKind(candidate, kind) : candidate
        }
        return candidate.ownerType === 'company' && toKey(candidate.ownerName) === ownerKey
          ? withOwnerKind(candidate, kind)
          : candidate
      })
      // Every row for this structure shows one list, so they all take the one
      // the edited row now holds — including the blank line a new trust gets.
      const source = next.find((candidate) => candidate.id === row.id)
      if (ownerKey === '' || source === undefined) return next
      return next.map((candidate) =>
        candidate.ownerType === 'company' && toKey(candidate.ownerName) === ownerKey
          ? { ...candidate, roleHolders: source.roleHolders }
          : candidate,
      )
    })
  }

  const handleChangeRelatedRow = (updated: RelatedRowState) =>
    setRelatedRows((current) => current.map((row) => (row.id === updated.id ? updated : row)))

  const handleCalculate = () => {
    if (!targetKey) return
    try {
      setResult(calculate(rows, { targetKey, threshold, relatedParties }))
      setEngineError(null)
    } catch (error) {
      setResult(null)
      setEngineError(error instanceof Error ? error.message : String(error))
    }
  }

  const handleStartOver = () => {
    setRows([blankRow()])
    setRelatedRows([])
    setThreshold(DEFAULT_THRESHOLD)
    setChosenTargetKey(null)
    setResult(null)
    setEngineError(null)
  }

  const handleLoadExample = () => {
    setRows(exampleRows())
    setRelatedRows([])
    setThreshold(DEFAULT_THRESHOLD)
    setChosenTargetKey(null)
    setResult(null)
    setEngineError(null)
  }

  return (
    <div className="min-h-screen bg-white text-ink">
      <Header />

      <main className="py-8">
        <div className="mx-auto max-w-page space-y-8 px-6">
        <Card
          title="Ownership links"
          description="One row per shareholding: who owns what percentage of which company."
        >
          <LinksBuilder
            rows={rows}
            issuesByRow={issuesByRow}
            incompleteRowIds={anyRowDirty ? incompleteRowIds : new Set<string>()}
            companyTotals={totalsWithStatus}
            partyIssues={partyIssues}
            entityPlaceholder={entityPlaceholder}
            ownerKinds={ownerKinds}
            onChangeRow={handleChangeRow}
            onChangeOwnerKind={handleChangeOwnerKind}
            onRemoveRow={(id) => setRows((current) => current.filter((row) => row.id !== id))}
            onAddRow={handleAddRow}
          />
        </Card>

        <Card
          title="Related-party links (aggregation)"
          description="Optional. Shareholders assessed together against the threshold."
        >
          <RelatedParties
            rows={relatedRows}
            partyNames={graph.nodes
              .filter((node) => node.key !== targetKey)
              .map((node) => node.name)}
            issues={relatedIssues}
            onChange={handleChangeRelatedRow}
            onRemove={(id) => setRelatedRows((current) => current.filter((row) => row.id !== id))}
            onAdd={() => setRelatedRows((current) => [...current, blankRelatedRow()])}
          />
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card title="Threshold">
            <ThresholdSelect value={threshold} onChange={setThreshold} />
          </Card>
          <Card title="Meydan FZ company">
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
              <Button variant="green" disabled={!canCalculate} onClick={handleCalculate}>
                Calculate ownership
              </Button>
              <Button variant="secondary" onClick={handleLoadExample}>
                Load example
              </Button>
              <Button variant="quiet" onClick={handleStartOver}>
                Start over
              </Button>
            </div>

            {!anyRowDirty ? (
              <p className="text-body text-muted">
                Enter at least one ownership link, or load the example structure to see how it
                works.
              </p>
            ) : null}

            <Blockers reasons={reasons} warnings={validation.warnings.map((w) => w.message)} />

            {engineError ? (
              <div className="rounded-card border border-coral bg-gapTint px-4 py-3 text-body text-coral">
                {engineError}
              </div>
            ) : null}

          </div>
        </Card>
        </div>

        {/* The results run wider than the input column so a deep chart fits. */}
        {result ? (
          <div className="mx-auto mt-8 max-w-results px-6">
            <ResultsPanel result={result} />
          </div>
        ) : null}
      </main>

      <footer className="mt-4 border-t border-line">
        <div className="mx-auto max-w-page px-6 py-7 text-small text-muted">
          For internal compliance use only. This tool is informational and does not constitute legal
          advice.
        </div>
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
