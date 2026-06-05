import { useParams, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { TimeSeriesChart } from '@/components/charts'
import { ScoreRing, LoadingSkeleton } from '@/components/ui'
import { useActivityDay, useWorkoutsForDay, useStressForDay } from '@/db/hooks'
import type { Workout } from '@/db/schema'

// ─── ActivityDetail ───────────────────────────────────────────────────────────
//
// Detailed view for one activity day.
//
// MET curve:
//   `met` is a number[] at 5-minute resolution stored on ActivityDay.
//   TimeSeriesChart expects { timestamp, value }[]. We reconstruct timestamps
//   from midnight of the given date + interval index * 5 minutes.
//   MET starts at midnight local time since it covers the whole calendar day.
//
// Stress timeline:
//   StressPoint rows have an ISO 8601 `timestamp` string. We parse it to ms
//   for TimeSeriesChart. StressPoints and recovery values are both stored but
//   we display only the stress values here (the recovery values have a
//   different scale and would need a dual-axis chart).

function buildMETSeries(
  met: number[] | null,
  day: string,
): Array<{ timestamp: number; value: number }> {
  if (!met || met.length === 0) return []
  // Day starts at midnight local time; construct as local date to avoid UTC offset
  const startMs = new Date(`${day}T00:00:00`).getTime()
  const intervalMs = 5 * 60 * 1000
  return met.map((value, i) => ({ timestamp: startMs + i * intervalMs, value }))
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—'
  const totalMinutes = Math.round(seconds / 60)
  if (totalMinutes < 60) return `${totalMinutes}m`
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

export default function ActivityDetail() {
  const { t } = useTranslation('activity')
  const { t: tCommon } = useTranslation('common')

  const { date } = useParams({ from: '/activity/$date' })

  const day = useActivityDay(date)
  const workouts = useWorkoutsForDay(date)
  const stressPoints = useStressForDay(date)

  const loading = day === undefined || workouts === undefined || stressPoints === undefined

  if (loading) {
    return (
      <div className="px-4 pt-8 pb-6 space-y-4">
        <LoadingSkeleton className="h-8 w-48 rounded-lg" />
        <LoadingSkeleton className="h-48 w-full rounded-2xl" />
        <LoadingSkeleton className="h-48 w-full rounded-2xl" />
        <LoadingSkeleton className="h-32 w-full rounded-2xl" />
      </div>
    )
  }

  if (!day) {
    return (
      <div className="px-4 pt-8 pb-6">
        <BackLink />
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{tCommon('noData')}</p>
      </div>
    )
  }

  const metData = buildMETSeries(day.met, date)

  const stressData = (stressPoints ?? []).map((sp) => ({
    timestamp: new Date(sp.timestamp).getTime(),
    value: sp.stressValue ?? 0,
  }))

  return (
    <div className="px-4 pt-8 pb-6 space-y-6">
      <BackLink />

      {/* Header: date + score ring */}
      <div className="flex items-center gap-4">
        <ScoreRing score={day.score} size={72} color="emerald" />
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            {new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('score')}: {day.score !== null ? day.score : '—'}
          </p>
        </div>
      </div>

      {/* Key stats grid */}
      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <StatItem
            label={t('stats.steps')}
            value={day.steps !== null ? day.steps.toLocaleString() : '—'}
          />
          <StatItem
            label={t('stats.activeCalories')}
            value={day.activeCalories !== null ? `${day.activeCalories.toLocaleString()} kcal` : '—'}
          />
          <StatItem
            label={t('stats.totalCalories')}
            value={day.totalCalories !== null ? `${day.totalCalories.toLocaleString()} kcal` : '—'}
          />
          <StatItem
            label={t('stats.distance')}
            value={day.equivalentWalkingDistance !== null
              ? `${(day.equivalentWalkingDistance / 1000).toFixed(1)} km`
              : '—'}
          />
          <StatItem
            label={t('inactivityAlerts')}
            value={day.inactivityAlerts !== null ? String(day.inactivityAlerts) : '—'}
          />
          <StatItem
            label={t('stats.nonWearTime')}
            value={formatDuration(day.nonWearTime)}
          />
        </dl>
      </section>

      {/* Activity intensity breakdown */}
      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
          {t('intensity.title')}
        </h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          <StatItem label={t('intensity.high')} value={formatDuration(day.highActivityTime)} />
          <StatItem label={t('intensity.medium')} value={formatDuration(day.mediumActivityTime)} />
          <StatItem label={t('intensity.low')} value={formatDuration(day.lowActivityTime)} />
          <StatItem label={t('intensity.sedentary')} value={formatDuration(day.sedentaryTime)} />
          <StatItem label={t('intensity.resting')} value={formatDuration(day.restingTime)} />
        </dl>
      </section>

      {/* MET curve */}
      {metData.length > 0 && (
        <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
          <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">MET</h2>
          {/* Wrapper div carries the testid; TimeSeriesChart renders inside it */}
          <div data-testid="met-chart-canvas">
            <TimeSeriesChart
              data={metData}
              label="MET"
              color="#10b981" // emerald-500
            />
          </div>
        </section>
      )}

      {/* Workouts list */}
      {workouts && workouts.length > 0 && (
        <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
            {t('workouts')}
          </h2>
          <ul className="space-y-3">
            {workouts.map((w: Workout) => (
              <li key={w.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-slate-700">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 capitalize dark:text-white">
                      {w.label ?? w.activity.replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatTime(w.startDatetime)} – {formatTime(w.endDatetime)}
                      {w.intensity ? ` · ${w.intensity}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    {w.calories !== null && (
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {w.calories.toLocaleString()} kcal
                      </p>
                    )}
                    {w.distance !== null && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {(w.distance / 1000).toFixed(2)} km
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Stress timeline */}
      {stressData.length > 0 && (
        <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
          <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
            {t('stress')}
          </h2>
          <TimeSeriesChart
            data={stressData}
            label={t('stress')}
            color="#f97316" // orange-500 — stress conventionally mapped to warm colours
          />
        </section>
      )}
    </div>
  )
}

function BackLink() {
  const { t } = useTranslation('common')
  return (
    <Link
      to="/activity"
      className="inline-flex items-center gap-1 text-sm text-sky-600 dark:text-sky-400"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M10 4l-4 4 4 4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {t('back')}
    </Link>
  )
}

interface StatItemProps {
  label: string
  value: string
}

function StatItem({ label, value }: StatItemProps) {
  return (
    <div>
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold text-slate-900 dark:text-white">{value}</dd>
    </div>
  )
}
