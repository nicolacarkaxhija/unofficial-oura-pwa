// ─── ContributorRadar ─────────────────────────────────────────────────────────
//
// Hand-rolled SVG spider chart (≤8 spokes, static). Replaced recharts — see
// ScoreHistoryChart for the bundle rationale. Values are also listed as
// ContributorBars below this chart on the detail page, so the radar is a
// shape-at-a-glance visual, not the primary data surface.

interface ContributorRadarProps {
  /**
   * Map of contributor name → score (0–100, or null if unavailable).
   * Null values are excluded so missing contributors don't drag the visual.
   */
  contributors: Record<string, number | null>
}

// Human-readable labels for known Oura contributor keys.
// Unknown keys are title-cased as a fallback.
const CONTRIBUTOR_LABELS: Record<string, string> = {
  activity_balance: 'Activity',
  body_temperature: 'Temperature',
  hrv_balance: 'HRV',
  previous_day_activity: 'Prev. Activity',
  previous_night: 'Prev. Night',
  recovery_index: 'Recovery',
  resting_heart_rate: 'Resting HR',
  sleep_balance: 'Sleep',
  // Sleep contributors
  deep_sleep: 'Deep Sleep',
  efficiency: 'Efficiency',
  latency: 'Latency',
  rem_sleep: 'REM',
  restfulness: 'Restfulness',
  timing: 'Timing',
  total_sleep: 'Total Sleep',
}

function humanise(key: string): string {
  return CONTRIBUTOR_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const SIZE = 280
const CX = SIZE / 2
const CY = SIZE / 2
// Radius leaves room for labels outside the outer ring.
const R = SIZE * 0.34
const RINGS = [0.25, 0.5, 0.75, 1]
const STROKE = '#6366f1' // indigo-500 — Oura's readiness accent

// Angle for spoke i of n, starting at 12 o'clock and going clockwise.
function angle(i: number, n: number): number {
  return -Math.PI / 2 + (i / n) * 2 * Math.PI
}

function polar(a: number, r: number): [number, number] {
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
}

function polygonPoints(values: number[], scale = 1): string {
  return values
    .map((v, i) => {
      const [px, py] = polar(angle(i, values.length), R * scale * (v / 100))
      return `${px.toFixed(1)},${py.toFixed(1)}`
    })
    .join(' ')
}

export default function ContributorRadar({ contributors }: ContributorRadarProps) {
  // Filter nulls — a missing contributor score shouldn't appear as zero on the radar
  const entries = Object.entries(contributors).filter(
    (entry): entry is [string, number] => entry[1] !== null,
  )

  if (entries.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
        No contributor data
      </div>
    )
  }

  const n = entries.length
  const values = entries.map(([, v]) => v)
  const summary = entries.map(([k, v]) => `${humanise(k)} ${String(v)}`).join(', ')

  return (
    <svg
      viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}
      className="mx-auto h-auto w-full max-w-xs"
      role="img"
      aria-label={`Contributors: ${summary}`}
    >
      {/* Concentric grid rings (regular polygons matching the spoke count) */}
      {RINGS.map((ring) => (
        <polygon
          key={ring}
          points={polygonPoints(
            values.map(() => 100),
            ring,
          )}
          fill="none"
          className="stroke-gray-200 dark:stroke-gray-700"
        />
      ))}

      {/* Spokes + labels */}
      {entries.map(([key], i) => {
        const a = angle(i, n)
        const [sx, sy] = polar(a, R)
        const [lx, ly] = polar(a, R + 16)
        // Anchor labels away from the centre so they don't overlap the chart.
        const anchor = Math.abs(Math.cos(a)) < 0.3 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end'
        return (
          <g key={key}>
            <line
              x1={CX}
              y1={CY}
              x2={sx}
              y2={sy}
              className="stroke-gray-200 dark:stroke-gray-700"
            />
            <text
              x={lx}
              y={ly + 3}
              textAnchor={anchor}
              fontSize="10"
              className="fill-gray-600 dark:fill-gray-300"
            >
              {humanise(key)}
            </text>
          </g>
        )
      })}

      {/* Value polygon */}
      <polygon
        points={polygonPoints(values)}
        fill={STROKE}
        fillOpacity="0.25"
        stroke={STROKE}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  )
}
