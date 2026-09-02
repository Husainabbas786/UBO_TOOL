import type { CalculationResult } from '../../engine'
import { Card } from '../ui'
import { IntermediariesTable } from './IntermediariesTable'
import { OwnershipChart } from './OwnershipChart'
import { PathsTable } from './PathsTable'
import { SummaryBlock } from './SummaryBlock'

/**
 * The four result blocks, in spec order. Each is its own Card so that the next
 * milestone can hang a PNG/PDF download off each one individually.
 */
export function ResultsPanel({ result }: { result: CalculationResult }) {
  return (
    <div className="space-y-6">
      <Card
        title="Ownership Chart"
        description={`Structure of ${result.target.name} at the ${result.threshold}% threshold.`}
      >
        <OwnershipChart result={result} />
      </Card>

      <Card
        title="Ownership Paths"
        description="Every route from an ultimate owner down to the target entity."
      >
        <PathsTable result={result} />
      </Card>

      <Card title="Summary">
        <SummaryBlock result={result} />
      </Card>

      <Card
        title="Intermediary Companies (for screening)"
        description="Screen these in the ERP for sanctions, PEP and adverse media."
      >
        <IntermediariesTable result={result} />
      </Card>
    </div>
  )
}
