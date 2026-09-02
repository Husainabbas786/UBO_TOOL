import { useMemo } from 'react'
import type { CalculationResult } from '../../engine'
import { layoutChart, type ChartNode } from '../../lib/chartLayout'
import { BuildingGlyph, PersonGlyph } from './icons'

/** Node colours by role. Explicit values so the export renders identically. */
const PALETTE = {
  target: { fill: '#f1f5f9', stroke: '#334155', text: '#0f172a', icon: '#334155' },
  ubo: { fill: '#ecfdf5', stroke: '#059669', text: '#064e3b', icon: '#059669' },
  plain: { fill: '#ffffff', stroke: '#cbd5e1', text: '#0f172a', icon: '#64748b' },
}

function paletteFor(node: ChartNode) {
  if (node.isTarget) return PALETTE.target
  if (node.isUbo) return PALETTE.ubo
  return PALETTE.plain
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
          style={{ background: '#ffffff' }}
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
              <path d="M0 0.5 L7.5 4 L0 7.5 z" fill="#94a3b8" />
            </marker>
          </defs>

          {layout.edges.map((edge) => (
            <g key={edge.id}>
              <path
                d={edge.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
                fill="none"
                stroke="#94a3b8"
                strokeWidth={1.5}
                strokeDasharray={edge.dashed ? '5 4' : undefined}
                markerEnd="url(#ubo-arrow)"
              />
              <rect
                x={edge.labelX - 29}
                y={edge.labelY - 10}
                width={58}
                height={20}
                rx={5}
                fill="#ffffff"
                stroke={edge.dashed ? '#cbd5e1' : 'none'}
              />
              <text
                x={edge.labelX}
                y={edge.labelY + 4}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={edge.dashed ? '#64748b' : '#334155'}
              >
                {edge.label}
              </text>
            </g>
          ))}

          {layout.nodes.map((node) => {
            const colours = paletteFor(node)
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
                  strokeWidth={node.isTarget || node.isUbo ? 2 : 1.25}
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
                  y={node.y + (node.effectiveLabel || node.isTarget ? 24 : 34)}
                  fontSize={12.5}
                  fontWeight={600}
                  fill={colours.text}
                >
                  {fit(node.name)}
                </text>
                {node.effectiveLabel ? (
                  <text x={node.x + 38} y={node.y + 40} fontSize={11} fill="#64748b">
                    {node.effectiveLabel}
                  </text>
                ) : null}
                {node.isTarget ? (
                  <text x={node.x + 38} y={node.y + 40} fontSize={11} fill="#64748b">
                    Target entity
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
                      fill="#eef2ff"
                      stroke="#6366f1"
                    />
                    <text
                      x={node.x + node.width - 28}
                      y={node.y + 3}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight={600}
                      fill="#4338ca"
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

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-200 pt-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <svg width={16} height={16} viewBox="0 0 18 18">
            <PersonGlyph colour="#64748b" />
          </svg>
          Individual
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width={16} height={16} viewBox="0 0 18 18">
            <BuildingGlyph colour="#64748b" />
          </svg>
          Company
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border-2 border-emerald-600 bg-emerald-50" />
          UBO at {result.threshold}%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border-2 border-slate-600 bg-slate-100" />
          Target entity
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width={22} height={6} viewBox="0 0 22 6">
            <path d="M0 3 H22" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 4" />
          </svg>
          Control, no ownership
        </span>
      </div>
    </div>
  )
}
