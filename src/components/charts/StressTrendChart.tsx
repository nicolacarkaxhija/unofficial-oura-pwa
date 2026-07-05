import { useTranslation } from 'react-i18next'
import type { DailyStressAverage } from '@/lib/aggregates'

// ─── StressTrendChart ─────────────────────────────────────────────────────────
//
// Hand-rolled SVG line chart following ScoreHistoryChart's visual language
// (same viewBox geometry, gridlines and label styling) — see that file for
// why we don't use a charting library for ≤365 static points.
//
// Two lines instead of one: stress and recovery are complementary series on
// the same 0–100 scale, and seeing them cross is the whole story ("recovery
// caught up after the stressful week"). Days where one series has no samples
// are simply skipped for that line (path split), not zeroed.

const W = 360
const H = 180
const PAD_LEFT = 30
const PAD_RIGHT = 8
const PAD_TOP = 8
const PAD_BOTTOM = 18

const STRESS_COLOR = '#f43f5e' // rose-500
const RECOVERY_COLOR = '#10b981' // emerald-500

function formatDay(day: string): string {
  const d = new Date(`${day}T00:00:00`)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface StressTrendChartProps {
  /** Oldest-first, as returned by computeDailyStressAverages. */
  data: DailyStressAverage[]
}

export default function StressTrendChart({ data }: StressTrendChartProps) {
  const { t } = useTranslation('activity')

  const innerW = W - PAD_LEFT - PAD_RIGHT
  const innerH = H - PAD_TOP - PAD_BOTTOM
  const x = (i: number) =>
    PAD_LEFT + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW)
  // Oura stress/recovery values live on a 0–100 scale like the pillar scores;
  // a fixed domain keeps the two lines comparable across ranges and matches
  // ScoreHistoryChart's y-axis so the page reads as one visual system.
  const y = (v: number) => PAD_TOP + (1 - v / 100) * innerH

  // Build a path that starts a new segment (M) after any null gap so missing
  // days don't get interpolated across.
  const linePath = (pick: (d: DailyStressAverage) => number | null): string => {
    let path = ''
    let penDown = false
    data.forEach((d, i) => {
      const v = pick(d)
      if (v === null) {
        penDown = false
        return
      }
      path += `${penDown ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `
      penDown = true
    })
    return path.trim()
  }

  const stressPath = linePath((d) => d.avgStress)
  const recoveryPath = linePath((d) => d.avgRecovery)

  const tickEvery = Math.max(1, Math.floor(data.length / 6))
  const xTicks = data.map((d, i) => ({ d, i })).filter(({ i }) => i % tickEvery === 0)
  const yTicks = [0, 25, 50, 75, 100]

  const first = data[0]
  const last = data[data.length - 1]

  return (
    <svg
      viewBox={`0 0 ${String(W)} ${String(H)}`}
      className="h-auto w-full"
      role="img"
      data-testid="stress-trend-chart"
      aria-label={
        first && last
          ? t('stressTrend.chartLabel', {
              start: formatDay(first.day),
              end: formatDay(last.day),
            })
          : t('stressTrend.title')
      }
    >
      {yTicks.map((tick) => (
        <g key={tick}>
          <line
            x1={PAD_LEFT}
            x2={W - PAD_RIGHT}
            y1={y(tick)}
            y2={y(tick)}
            strokeDasharray="3 3"
            className="stroke-gray-200 dark:stroke-gray-700"
          />
          <text
            x={PAD_LEFT - 4}
            y={y(tick) + 3}
            textAnchor="end"
            fontSize="10"
            className="fill-gray-500 dark:fill-gray-400"
          >
            {tick}
          </text>
        </g>
      ))}

      {xTicks.map(({ d, i }) => (
        <text
          key={d.day}
          x={x(i)}
          y={H - 4}
          textAnchor="middle"
          fontSize="10"
          className="fill-gray-500 dark:fill-gray-400"
        >
          {formatDay(d.day)}
        </text>
      ))}

      <path
        d={stressPath}
        fill="none"
        stroke={STRESS_COLOR}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d={recoveryPath}
        fill="none"
        stroke={RECOVERY_COLOR}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Legend colours are exported so the list page's legend dots stay in sync
// with the strokes above without duplicating hex values.
export { STRESS_COLOR, RECOVERY_COLOR }
