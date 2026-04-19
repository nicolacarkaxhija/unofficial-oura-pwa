import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { ScoreRing, LoadingSkeleton } from '@/components/ui'
import {
  useLatestSleepDay,
  useLatestReadinessDay,
  useLatestActivityDay,
  useSleepDays,
  useReadinessDays,
  useActivityDays,
} from '@/db/hooks'
import { computeWeeklyInsight, type WeeklyInsight } from '@/lib/aggregates'

// ─── Dashboard ────────────────────────────────────────────────────────────────
//
// Latest three score cards: sleep, readiness, activity.
//
// Why "latest day" rather than "today": the data source is a GDPR export,
// which is always historical — its newest row is at best yesterday. A query
// keyed on today's date would never match anything, so the dashboard shows
// the most recent day each pillar has data for (the pillars can differ by a
// day, e.g. an export taken mid-morning may have last night's sleep but not
// yesterday's finalised activity).
//
// Loading state: any hook returning undefined means IndexedDB hasn't responded
// yet. We show a skeleton grid to avoid layout shift when data arrives.
// null means the table is empty — rendered as "—" cards rather than skeletons.

export default function Dashboard() {
  const { t } = useTranslation('common')
  const { t: tSleep } = useTranslation('sleep')
  const { t: tReadiness } = useTranslation('readiness')
  const { t: tActivity } = useTranslation('activity')
  const navigate = useNavigate()

  const sleepDay = useLatestSleepDay()
  const readinessDay = useLatestReadinessDay()
  const activityDay = useLatestActivityDay()

  // 90 rows cover both 7-day windows and give the personal-best scan the same
  // horizon the list pages show — the insights never disagree with the lists.
  const sleepDays = useSleepDays(90)
  const readinessDays = useReadinessDays(90)
  const activityDays = useActivityDays(90)

  const loading = sleepDay === undefined || readinessDay === undefined || activityDay === undefined

  // The most recent day any pillar has data for — shown under the cards so
  // the user knows how fresh their export is.
  const latestDay = loading
    ? null
    : ([sleepDay?.day, readinessDay?.day, activityDay?.day]
        .filter((d): d is string => d !== undefined)
        .sort()
        .at(-1) ?? null)

  return (
    <div className="px-4 pt-8 pb-6">
      <h1 className="mb-6 text-2xl font-bold text-slate-900 dark:text-white">
        {t('nav.dashboard')}
      </h1>

      {loading ? (
        // Skeleton grid — same 3-column layout as the real cards to prevent layout shift
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <LoadingSkeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Sleep card */}
          <button
            type="button"
            className="text-left"
            onClick={() => void navigate({ to: '/sleep' })}
            aria-label={`${tSleep('title')} — ${tSleep('score')}: ${sleepDay?.score != null ? String(sleepDay.score) : '—'}`}
          >
            <DashboardCard
              title={tSleep('title')}
              score={sleepDay?.score ?? null}
              color="blue"
              subtitle={tSleep('score')}
            />
          </button>

          {/* Readiness card */}
          <button
            type="button"
            className="text-left"
            onClick={() => void navigate({ to: '/readiness' })}
            aria-label={`${tReadiness('title')} — ${tReadiness('score')}: ${readinessDay?.score != null ? String(readinessDay.score) : '—'}`}
          >
            <DashboardCard
              title={tReadiness('title')}
              score={readinessDay?.score ?? null}
              color="indigo"
              subtitle={tReadiness('score')}
            />
          </button>

          {/* Activity card */}
          <button
            type="button"
            className="text-left"
            onClick={() => void navigate({ to: '/activity' })}
            aria-label={`${tActivity('title')} — ${tActivity('score')}: ${activityDay?.score != null ? String(activityDay.score) : '—'}`}
          >
            <DashboardCard
              title={tActivity('title')}
              score={activityDay?.score ?? null}
              color="emerald"
              subtitle={tActivity('score')}
            />
          </button>
        </div>
      )}

      {/* ── Trends ── week-over-week movement per pillar. Only rendered once
          the series have loaded and at least one pillar has an average. */}
      {sleepDays && readinessDays && activityDays && (
        <TrendsSection
          rows={[
            {
              label: tSleep('title'),
              insight: computeWeeklyInsight(sleepDays),
              color: 'text-blue-500',
            },
            {
              label: tReadiness('title'),
              insight: computeWeeklyInsight(readinessDays),
              color: 'text-indigo-500',
            },
            {
              label: tActivity('title'),
              insight: computeWeeklyInsight(activityDays),
              color: 'text-emerald-500',
            },
          ]}
        />
      )}

      {/* Date of the data being shown — tells the user how fresh their export is.
          T00:00:00 suffix keeps the Date in local time (a bare YYYY-MM-DD parses as UTC). */}
      <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
        {(latestDay ? new Date(`${latestDay}T00:00:00`) : new Date()).toLocaleDateString(
          undefined,
          {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          },
        )}
      </p>
    </div>
  )
}

// ─── TrendsSection ────────────────────────────────────────────────────────────
//
// One row per pillar: 7-day average, signed delta vs the previous 7 scored
// days, and the personal best. Deltas are rounded to one decimal — score
// averages move in fractions and showing "+0" for a +0.4 week reads as noise.

interface TrendRow {
  label: string
  insight: WeeklyInsight
  color: string
}

function TrendsSection({ rows }: { rows: TrendRow[] }) {
  const { t } = useTranslation('common')

  const visible = rows.filter((r) => r.insight.avg !== null)
  if (visible.length === 0) return null

  return (
    <div className="mt-6 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
      <h2 className="mb-3 text-xs font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
        {t('trends.title')}
      </h2>
      <ul className="space-y-3" data-testid="trends-list">
        {visible.map(({ label, insight, color }) => (
          <li key={label} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${color}`}>{label}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {t('trends.weeklyAvg')}
                {insight.best && ` · ${t('trends.best')}: ${String(insight.best.score)}`}
              </p>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900 dark:text-white">
                {insight.avg !== null ? Math.round(insight.avg) : '—'}
              </span>
              {insight.delta !== null && <DeltaBadge delta={insight.delta} />}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function DeltaBadge({ delta }: { delta: number }) {
  const rounded = Math.round(delta * 10) / 10
  // ±0.5 is within day-to-day noise for 0–100 scores; call it flat rather
  // than colouring a meaningless movement.
  const flat = Math.abs(rounded) < 0.5
  const cls = flat
    ? 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
    : rounded > 0
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
      : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
  const text = flat ? '·' : `${rounded > 0 ? '▲' : '▼'} ${String(Math.abs(rounded))}`
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{text}</span>
}

// ─── DashboardCard ────────────────────────────────────────────────────────────
//
// Extends the base <ScoreCard> with a <ScoreRing> SVG alongside the number.
// Keeping this as a private sub-component avoids adding ScoreRing to the
// ScoreCard API (which is used elsewhere without a ring).

interface DashboardCardProps {
  title: string
  score: number | null
  color: string
  subtitle: string
}

function DashboardCard({ title, score, color, subtitle }: DashboardCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
      <ScoreRing score={score} size={72} color={color} />
      <div>
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
          {title}
        </p>
        <p className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">
          {score !== null ? score : '—'}
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>
      </div>
    </div>
  )
}
