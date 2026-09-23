import { useMemo } from 'react'
import { isNonCommercial, type CalculationResult } from '../../engine'
import { chart as palette } from '../../theme/tokens'
import {
  badgeBoxes,
  BADGE_FONT_SIZE,
  BADGE_HEIGHT,
  layoutChart,
  LABEL_HEIGHT,
  NAME_FONT_SIZE,
  NAME_LINE_HEIGHT,
  NODE_TEXT_X,
  type ChartEdge,
  type ChartNode,
} from '../../lib/chartLayout'
import { BuildingGlyph, DeedGlyph, PersonGlyph } from './icons'

/**
 * Chart colours are written into the SVG as literal hex, never as CSS
 * variables, so an exported PNG or PDF renders exactly as the screen does.
 */
function paletteFor(node: ChartNode) {
  if (node.isTarget) return palette.target
  if (node.type === 'company') {
    return isNonCommercial(node.entityKind) ? palette.nonCommercial : palette.company
  }
  if (node.isUbo) return palette.individualUbo
  return palette.individual
}

function edgePalette(tone: ChartEdge['tone']) {
  if (tone === 'control') return palette.controlEdge
  if (tone === 'role') return palette.roleEdge
  if (tone === 'nominee') return palette.nomineeEdge
  return palette.ownershipEdge
}

/** Each kind of badge carries its own colour, so the chart reads at a glance. */
function badgePalette(text: string) {
  if (text === 'Control') return palette.controlBadge
  return palette.roleBadge
}

/** The arrowhead colour has to be declared per tone, so each tone gets a marker. */
const MARKERS: Array<{ id: string; tone: ChartEdge['tone'] }> = [
  { id: 'ubo-arrow', tone: 'ownership' },
  { id: 'ubo-arrow-control', tone: 'control' },
  { id: 'ubo-arrow-role', tone: 'role' },
  { id: 'ubo-arrow-nominee', tone: 'nominee' },
]

const MARKER_FOR: Record<ChartEdge['tone'], string> = {
  ownership: 'ubo-arrow',
  control: 'ubo-arrow-control',
  role: 'ubo-arrow-role',
  nominee: 'ubo-arrow-nominee',
}

export function OwnershipChart({ result }: { result: CalculationResult }) {
  const layout = useMemo(() => layoutChart(result), [result])

  const hasRoles = layout.edges.some((edge) => edge.tone === 'role')
  const hasNominees = layout.edges.some((edge) => edge.tone === 'nominee')
  const hasControl = layout.edges.some((edge) => edge.tone === 'control')

  return (
    <div>
      <div data-export-scroll className="overflow-x-auto">
        {/* The drawing is cropped to its own extents, so centring it here is
            what keeps an exported chart from leaning against the left edge of
            the card. Over-constrained margins collapse on the right, so a wide
            chart still starts at x=0 and scrolls rather than losing its left. */}
        <svg
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          style={{ background: palette.surface, display: 'block', marginInline: 'auto' }}
          role="img"
          aria-label={`Ownership structure of ${result.target.name}`}
          shapeRendering="geometricPrecision"
          textRendering="optimizeLegibility"
        >
          <defs>
            {MARKERS.map((marker) => (
              <marker
                key={marker.id}
                id={marker.id}
                viewBox="0 0 8 8"
                refX={7}
                refY={4}
                markerWidth={7}
                markerHeight={7}
                orient="auto-start-reverse"
              >
                <path d="M0 0.5 L7.5 4 L0 7.5 z" fill={edgePalette(marker.tone).stroke} />
              </marker>
            ))}
          </defs>

          {layout.edges.map((edge) => {
            const colours = edgePalette(edge.tone)
            return (
              <g key={edge.id}>
                <path
                  d={edge.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
                  fill="none"
                  stroke={colours.stroke}
                  strokeWidth={1.5}
                  strokeDasharray={edge.dashed ? '5 4' : undefined}
                  markerEnd={`url(#${MARKER_FOR[edge.tone]})`}
                />
                <rect
                  x={edge.labelX - edge.labelWidth / 2}
                  y={edge.labelY - LABEL_HEIGHT / 2}
                  width={edge.labelWidth}
                  height={LABEL_HEIGHT}
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
            const { subLabel, nameLines } = node
            // Centre the name block, plus its sub-label, within the box.
            const blockHeight =
              nameLines.length * NAME_LINE_HEIGHT + (subLabel ? NAME_LINE_HEIGHT : 0)
            const firstBaseline = node.y + (node.height - blockHeight) / 2 + NAME_FONT_SIZE
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
                  ) : isNonCommercial(node.entityKind) ? (
                    <DeedGlyph colour={colours.icon} />
                  ) : (
                    <BuildingGlyph colour={colours.icon} />
                  )}
                </g>
                {nameLines.map((line, index) => (
                  <text
                    key={index}
                    x={node.x + NODE_TEXT_X}
                    y={Math.round(firstBaseline + index * NAME_LINE_HEIGHT)}
                    fontSize={NAME_FONT_SIZE}
                    fontWeight={600}
                    fill={colours.text}
                  >
                    {line}
                  </text>
                ))}
                {subLabel ? (
                  <text
                    x={node.x + NODE_TEXT_X}
                    y={Math.round(firstBaseline + nameLines.length * NAME_LINE_HEIGHT)}
                    fontSize={11}
                    fill={node.isTarget ? '#FFFFFF' : '#6A7C8F'}
                    opacity={node.isTarget ? 0.85 : 1}
                  >
                    {subLabel}
                  </text>
                ) : null}

                {badgeBoxes(node).map((badge) => {
                  const badgeColours = badgePalette(badge.text)
                  return (
                    <g key={badge.text}>
                      <rect
                        x={badge.x}
                        y={badge.y}
                        width={badge.width}
                        height={BADGE_HEIGHT}
                        rx={BADGE_HEIGHT / 2}
                        fill={badgeColours.fill}
                      />
                      <text
                        x={badge.x + badge.width / 2}
                        y={badge.y + 12}
                        textAnchor="middle"
                        fontSize={BADGE_FONT_SIZE}
                        fontWeight={600}
                        fill={badgeColours.text}
                      >
                        {badge.text}
                      </text>
                    </g>
                  )
                })}
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
        {hasRoles ? (
          <span className="inline-flex items-center gap-1.5">
            <svg width={16} height={16} viewBox="0 0 18 18">
              <DeedGlyph colour={palette.nonCommercial.stroke} />
            </svg>
            Trust / foundation / NPO
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border-2 border-mfzGreen bg-uboTint" />
          UBO at {result.threshold}%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-navy" />
          Meydan FZ company
        </span>
        {hasControl ? (
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
        ) : null}
        {hasRoles ? (
          <span className="inline-flex items-center gap-1.5">
            <svg width={22} height={6} viewBox="0 0 22 6">
              <path
                d="M0 3 H22"
                stroke={palette.roleEdge.stroke}
                strokeWidth={1.5}
                strokeDasharray="5 4"
              />
            </svg>
            Role, no shareholding
          </span>
        ) : null}
        {hasNominees ? (
          <span className="inline-flex items-center gap-1.5">
            <svg width={22} height={6} viewBox="0 0 22 6">
              <path
                d="M0 3 H22"
                stroke={palette.nomineeEdge.stroke}
                strokeWidth={1.5}
                strokeDasharray="5 4"
              />
            </svg>
            Held as nominee (the nominator is the UBO)
          </span>
        ) : null}
      </div>
    </div>
  )
}
