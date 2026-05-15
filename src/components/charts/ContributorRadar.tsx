import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

// ─── Why Recharts here, not uPlot ────────────────────────────────────────────
//
// Contributor radar charts have at most ~8 spokes (one per readiness contributor).
// The SVG DOM cost for 8 elements is negligible — uPlot's imperative canvas API
// would be significantly harder to maintain for a static spider chart than
// Recharts' declarative JSX, with no performance benefit at this scale.

interface ContributorRadarProps {
  /**
   * Map of contributor name → score (0–100, or null if unavailable).
   * Null values are excluded so missing contributors don't drag the visual.
   */
  contributors: Record<string, number | null>
}

interface RadarDatum {
  subject: string
  value: number
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

export default function ContributorRadar({ contributors }: ContributorRadarProps) {
  // Filter nulls — a missing contributor score shouldn't appear as zero on the radar
  const radarData: RadarDatum[] = Object.entries(contributors)
    .filter((entry): entry is [string, number] => entry[1] !== null)
    .map(([key, value]) => ({ subject: humanise(key), value }))

  if (radarData.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
        No contributor data
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
        {/* PolarGrid and PolarAngleAxis both pick up text/stroke from the SVG
            cascade, so dark: Tailwind variants on a wrapper <div> are enough —
            no explicit colour props needed here, unlike canvas charts. */}
        <PolarGrid className="stroke-gray-200 dark:stroke-gray-700" />
        <PolarAngleAxis
          dataKey="subject"
          tick={{
            fontSize: 11,
            // Inline style because Recharts renders ticks as SVG <text> elements
            // that Tailwind can't target directly. We rely on CSS currentColor
            // by letting Recharts default to `fill: currentColor`.
          }}
          className="fill-gray-600 dark:fill-gray-300"
        />
        <Radar
          name="Score"
          dataKey="value"
          // Oura's brand colour for readiness
          stroke="#6366f1"
          fill="#6366f1"
          fillOpacity={0.25}
          dot={false}
        />
        <Tooltip
          formatter={(value: number) => [String(value), 'Score']}
          contentStyle={{
            // Tooltip sits outside the SVG so Tailwind dark: doesn't apply;
            // we use inline styles instead.
            backgroundColor: 'var(--color-surface, #fff)',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            fontSize: '12px',
          }}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}
