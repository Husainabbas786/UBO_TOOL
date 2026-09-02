import { useMemo } from 'react'
import type { CalculationResult } from '../../engine'
import { chart as palette } from '../../theme/tokens'
import { layoutChart, type ChartNode } from '../../lib/chartLayout'
import { BuildingGlyph, PersonGlyph } from './icons'

/**
 * Chart colours are written into the SVG as literal hex, never as CSS
 * variables, so an exported PNG or PDF renders exactly as the screen does.
 */
function paletteFor(node: ChartNode) {
  if (node.isTarget) return palette.target
  if (node.type === 'company') return palette.company
  if (node.isUbo) return palette.individualUbo
  return palette.individual
}

/** SVG cannot ellipsize, so long names are trimmed to fit the node box. */
function fit(name: string, max = 18): string {
  return name.length <= max ? name : `${name.slice(0, max - 1)}…`
}

export function OwnershipChart({ result }: { result: CalculationResult }) {
  const layout = useMemo(() => layoutChart(result), [result])

  return (
    <div>
      <div data-export-scroll className="overflow-x-auto">
        <svg
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          role="img"
          aria-label={`Ownership structure of ${result.target.name}`}
          shapeRendering="geometricPrecision"
          textRendering="optimizeLegibility"
          style={{ background: palette.surface }}
        >
          <defs>
            <marker
              id="ubo-arrow"
              viewBox="0 0 8 8"
              refX={7}
              refY={4}
              markerWidth={7}
              markerHeight={7}
              orient="auto-start-reverse"
            >
              <path d="M0 0.5 L7.5 4 L0 7.5 z" fill={palette.ownershipEdge.stroke} />
            </marker>
            <marker
              id="ubo-arrow-control"
              viewBox="0 0 8 8"
              refX={7}
              refY={4}
              markerWidth={7}
              markerHeight={7}
              orient="auto-start-reverse"
            >
              <path d="M0 0.5 L7.5 4 L0 7.5 z" fill={palette.controlEdge.stroke} />
            </marker>
          </defs>

          {layout.edges.map((edge) => {
            const colours = edge.dashed ? palette.controlEdge : palette.ownershipEdge
            return (
              <g key={edge.id}>
                <path
                  d={edge.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
                  fill="none"
                  stroke={colours.stroke}
                  strokeWidth={1.5}
                  strokeDasharray={edge.dashed ? '5 4' : undefined}
                  markerEnd={edge.dashed ? 'url(#ubo-arrow-control)' : 'url(#ubo-arrow)'}
                />
                <rect
                  x={edge.labelX - 29}
                  y={edge.labelY - 10}
                  width={58}
                  height={20}
                  rx={5}
                  fill={colours.chip}
                  stroke={edge.dashed ? colours.stroke : 'none'}
                />
                <text
                  x={edge.labelX}
                  y={edge.labelY + 4}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={600}
                  fill={colours.label}
                >
                  {edge.label}
                </text>
              </g>
            )
          })}

          {layout.nodes.map((node) => {
            const colours = paletteFor(node)
            const subLabel = node.isTarget ? 'Target entity' : node.effectiveLabel
            return (
              <g key={node.key}>
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={node.height}
                  rx={8}
                  fill={colours.fill}
                  stroke={colours.stroke}
                  strokeWidth={node.isTarget || node.isUbo ? 2 : 1.5}
                />
                <g transform={`translate(${node.x + 12}, ${node.y + node.height / 2 - 9})`}>
                  {node.type === 'individual' ? (
                    <PersonGlyph colour={colours.icon} />
                  ) : (
                    <BuildingGlyph colour={colours.icon} />
                  )}
                </g>
                <text
                  x={node.x + 38}
                  y={node.y + (subLabel ? 24 : 34)}
                  fontSize={12.5}
                  fontWeight={600}
                  fill={colours.text}
                >
                  {fit(node.name)}
                </text>
                {subLabel ? (
                  <text
                    x={node.x + 38}
                    y={node.y + 40}
                    fontSize={11}
                    fill={node.isTarget ? '#FFFFFF' : '#6A7C8F'}
                    opacity={node.isTarget ? 0.85 : 1}
                  >
                    {subLabel}
                  </text>
                ) : null}

                {node.isController ? (
                  <g>
                    <rect
                      x={node.x + node.width - 52}
                      y={node.y - 9}
                      width={48}
                      height={18}
                      rx={9}
                      fill={palette.controlBadge.fill}
                    />
                    <text
                      x={node.x + node.width - 28}
                      y={node.y + 3}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight={600}
                      fill={palette.controlBadge.text}
                    >
                      Control
                    </text>
                  </g>
                ) : null}
              </g>
            )
          })}
        </svg>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4 text-small text-muted">
        <span className="inline-flex items-center gap-1.5">
          <svg width={16} height={16} viewBox="0 0 18 18">
            <PersonGlyph colour={palette.individual.stroke} />
          </svg>
          Individual
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width={16} height={16} viewBox="0 0 18 18">
            <BuildingGlyph colour={palette.company.stroke} />
          </svg>
          Company
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border-2 border-mfzGreen bg-uboTint" />
          UBO at {result.threshold}%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-navy" />
          Target entity
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width={22} height={6} viewBox="0 0 22 6">
            <path
              d="M0 3 H22"
              stroke={palette.controlEdge.stroke}
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
          </svg>
          Control, no ownership
        </span>
      </div>
    </div>
  )
}
