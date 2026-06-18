import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

// ─── Why Recharts here, not uPlot ────────────────────────────────────────────
//
// Score history charts show at most 365 points (one per day). At that scale
// SVG DOM cost is negligible and Recharts' declarative JSX is significantly
// more maintainable than uPlot's imperative canvas API. There is no
// pinch-zoom interaction requirement — the chart is read-only.
//
// If we ever add daily-granularity views spanning multiple years (365+ points
// with pan/zoom), switch this component to uPlot.

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

// Format "2024-06-15" → "Jun 15" for the x-axis tick.
// We avoid date-fns here because the format is trivial and we want to keep
// this chart component dependency-free beyond Recharts itself.
function formatDay(day: string): string {
  const [, month, date] = day.split('-')
  if (!month || !date) return day
  const d = new Date(`${day}T00:00:00`)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function ScoreHistoryChart({ data, color }: ScoreHistoryChartProps) {
  // Filter out days where score is null — Recharts renders null as a gap
  // in the line by default, but filtering keeps the domain clean and avoids
  // confusing "cliff" artefacts at the edges of missing ranges.
  const filtered = data.filter((d): d is { day: string; score: number } => d.score !== null)

  if (filtered.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
        No score data
      </div>
    )
  }

  // Sparse scores: only show every Nth x-axis label so they don't overlap.
  // Rule of thumb: one label per ~60px; at 360px width that's ~6 labels.
  const tickInterval = Math.max(1, Math.floor(filtered.length / 6))

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={filtered} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
        <defs>
          {/* Gradient fill: opaque at the line, transparent at the baseline.
              Gives the "area chart" look without dominating the background. */}
          <linearGradient id={`scoreGrad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.35} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          className="stroke-gray-200 dark:stroke-gray-700"
          vertical={false}
        />
        <XAxis
          dataKey="day"
          tickFormatter={formatDay}
          interval={tickInterval}
          tick={{ fontSize: 11 }}
          className="fill-gray-500 dark:fill-gray-400"
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tickCount={5}
          tick={{ fontSize: 11 }}
          className="fill-gray-500 dark:fill-gray-400"
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip
          formatter={(value: number) => [`${value}`, 'Score']}
          labelFormatter={(label: string) => formatDay(label)}
          contentStyle={{
            // Tooltip lives outside the SVG so Tailwind dark: doesn't apply.
            // We use CSS custom properties set on <html> by ThemeContext.
            // Fallback values cover the case where the properties aren't set yet.
            backgroundColor: 'var(--color-surface, #ffffff)',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            fontSize: '12px',
          }}
        />
        <Area
          type="monotone"
          dataKey="score"
          stroke={color}
          strokeWidth={2}
          fill={`url(#scoreGrad-${color.replace('#', '')})`}
          dot={false}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
          // Animation disabled: charts render inside useLiveQuery callbacks that
          // can fire rapidly during import. Animated re-mounts on each write
          // would produce a distracting flicker. Animation adds no UX value for
          // historical data that never changes after the import completes.
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
