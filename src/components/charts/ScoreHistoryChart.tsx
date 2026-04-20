// ─── ScoreHistoryChart ────────────────────────────────────────────────────────
//
// Hand-rolled SVG area chart. This and ContributorRadar were the only two
// recharts consumers; at ≤365 static points a viewBox-scaled SVG needs no
// charting library, and dropping recharts removed the largest vendor chunk
// (~100 kB gzip) from the bundle. Interactivity was deliberately not ported:
// these are read-only trend views, and the per-day numbers are in the list
// rows right below the chart.

interface ScoreHistoryDatum {
  /** YYYY-MM-DD */
  day: string
  /** 0–100, or null if the score wasn't recorded for that day */
  score: number | null
}

interface ScoreHistoryChartProps {
  data: ScoreHistoryDatum[]
  /**
   * Hex colour for the area fill and stroke.
   * Each score type (sleep, readiness, activity) has its own brand colour.
   */
  color: string
}

// Chart geometry in viewBox units. Rendered width scales with the container;
// the aspect ratio stays fixed, matching the previous 180px-tall recharts look.
const W = 360
const H = 180
const PAD_LEFT = 30 // room for y labels
const PAD_RIGHT = 8
const PAD_TOP = 8
const PAD_BOTTOM = 18 // room for x labels

function formatDay(day: string): string {
  const d = new Date(`${day}T00:00:00`)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function ScoreHistoryChart({ data, color }: ScoreHistoryChartProps) {
  // Filter out null-score days: rendering them as gaps needs path splitting
  // for no informational gain — the list below shows exactly which days lack data.
  const filtered = data.filter((d): d is { day: string; score: number } => d.score !== null)

  if (filtered.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
        No score data
      </div>
    )
  }

  // Chronological left→right; callers pass newest-first.
  const points = [...filtered].reverse()

  const innerW = W - PAD_LEFT - PAD_RIGHT
  const innerH = H - PAD_TOP - PAD_BOTTOM
  const x = (i: number) =>
    PAD_LEFT + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
  const y = (score: number) => PAD_TOP + (1 - score / 100) * innerH

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`)
    .join(' ')
  const baseline = (PAD_TOP + innerH).toFixed(1)
  const areaPath = `${linePath} L${x(points.length - 1).toFixed(1)},${baseline} L${x(0).toFixed(1)},${baseline} Z`

  // ~6 x labels; y gridlines at fixed quartiles of the 0–100 domain.
  const tickEvery = Math.max(1, Math.floor(points.length / 6))
  const xTicks = points.map((p, i) => ({ p, i })).filter(({ i }) => i % tickEvery === 0)
  const yTicks = [0, 25, 50, 75, 100]

  const gradId = `scoreGrad-${color.replace('#', '')}`
  const first = points[0]
  const last = points[points.length - 1]

  return (
    <svg
      viewBox={`0 0 ${String(W)} ${String(H)}`}
      className="h-auto w-full"
      role="img"
      aria-label={
        first && last
          ? `Score trend from ${formatDay(first.day)} (${String(first.score)}) to ${formatDay(last.day)} (${String(last.score)})`
          : 'Score trend'
      }
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={color} stopOpacity={0.35} />
          <stop offset="95%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>

      {yTicks.map((t) => (
        <g key={t}>
          <line
            x1={PAD_LEFT}
            x2={W - PAD_RIGHT}
            y1={y(t)}
            y2={y(t)}
            strokeDasharray="3 3"
            className="stroke-gray-200 dark:stroke-gray-700"
          />
          <text
            x={PAD_LEFT - 4}
            y={y(t) + 3}
            textAnchor="end"
            fontSize="10"
            className="fill-gray-500 dark:fill-gray-400"
          >
            {t}
          </text>
        </g>
      ))}

      {xTicks.map(({ p, i }) => (
        <text
          key={p.day}
          x={x(i)}
          y={H - 4}
          textAnchor="middle"
          fontSize="10"
          className="fill-gray-500 dark:fill-gray-400"
        >
          {formatDay(p.day)}
        </text>
      ))}

      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}
