import { useRef } from 'react'
import type { CalculationResult } from '../../engine'
import { Card } from '../ui'
import { BlockActions } from './BlockActions'
import { IntermediariesTable } from './IntermediariesTable'
import { OwnershipChart } from './OwnershipChart'
import { PathsTable } from './PathsTable'
import { SummaryBlock } from './SummaryBlock'

/**
 * The four result blocks, in spec order. Each holds its own ref so it can be
 * saved as a PNG or a PDF on its own, independently of the others.
 */
export function ResultsPanel({ result }: { result: CalculationResult }) {
  const chartRef = useRef<HTMLElement>(null)
  const pathsRef = useRef<HTMLElement>(null)
  const summaryRef = useRef<HTMLElement>(null)
  const intermediariesRef = useRef<HTMLElement>(null)

  const target = result.target.name

  return (
    <div className="space-y-6">
      <Card
        title="Ownership chart"
        description={`Structure of ${target} at the ${result.threshold}% threshold.`}
        sectionRef={chartRef}
        actions={
          <BlockActions blockRef={chartRef} target={target} block="Chart" orientation="landscape" />
        }
      >
        <OwnershipChart result={result} />
      </Card>

      <Card
        title="Ownership paths"
        description="Every route from an ultimate owner down to the Meydan FZ company."
        sectionRef={pathsRef}
        actions={
          <BlockActions blockRef={pathsRef} target={target} block="Paths" orientation="portrait" />
        }
      >
        <PathsTable result={result} />
      </Card>

      <Card
        title="Summary"
        sectionRef={summaryRef}
        actions={
          <BlockActions
            blockRef={summaryRef}
            target={target}
            block="Summary"
            orientation="portrait"
          />
        }
      >
        <SummaryBlock result={result} />
      </Card>

      <Card
        title="Intermediary companies (for screening)"
        description="Screen these in the ERP for sanctions, PEP and adverse media."
        sectionRef={intermediariesRef}
        actions={
          <BlockActions
            blockRef={intermediariesRef}
            target={target}
            block="Intermediaries"
            orientation="portrait"
          />
        }
      >
        <IntermediariesTable result={result} />
      </Card>
    </div>
  )
}
