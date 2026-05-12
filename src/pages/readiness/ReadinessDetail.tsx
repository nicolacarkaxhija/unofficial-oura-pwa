import { useParams, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ContributorRadar } from '@/components/charts'
import { ContributorBar, ScoreRing, LoadingSkeleton } from '@/components/ui'
import { useReadinessDay, useResilienceDay } from '@/db/hooks'
import type { ResilienceDay } from '@/db/schema'

// ─── ReadinessDetail ──────────────────────────────────────────────────────────
//
// Detailed view for one readiness day.
//
// Resilience level badge:
//   Oura's resilience metric has 5 levels: exceptional / strong / solid /
//   adequate / weak. We map them to colour + label using the i18n keys.
//   Exceptional/Strong → emerald (positive), Adequate/Weak → amber/rose (flag).
//
// Temperature deviation indicator:
//   We show ±°C with a colour that matches the semantic: positive = warmer than
//   baseline (potential stress/illness), negative = cooler (potential recovery).

type ResilienceLevel = ResilienceDay['level']

const RESILIENCE_COLORS: Record<ResilienceLevel, string> = {
  exceptional: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  strong: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  solid: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  adequate: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  weak: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
}

export default function ReadinessDetail() {
  const { t } = useTranslation('readiness')

  const { date } = useParams({ from: '/readiness/$date' })

  const day = useReadinessDay(date)
  const resilience = useResilienceDay(date)

  // day is ReadinessDay | undefined.
  // useLiveQuery returns undefined while loading AND when the record is not found.
  // We treat both states the same: show a skeleton until we know it's not just
  // "in-flight", then fall through to render the day data.
  if (!day) {
    return (
      <div className="space-y-4 px-4 pt-8 pb-6">
        <LoadingSkeleton className="h-8 w-48 rounded-lg" />
        <LoadingSkeleton className="h-64 w-full rounded-2xl" />
        <LoadingSkeleton className="h-48 w-full rounded-2xl" />
      </div>
    )
  }

  const contributors = day.contributors
  // Build a plain object for ContributorRadar (which accepts Record<string, number | null>)
  const contributorRecord: Record<string, number | null> = {
    activity_balance: contributors.activity_balance,
    body_temperature: contributors.body_temperature,
    hrv_balance: contributors.hrv_balance,
    previous_day_activity: contributors.previous_day_activity,
    previous_night: contributors.previous_night,
    recovery_index: contributors.recovery_index,
    resting_heart_rate: contributors.resting_heart_rate,
    sleep_balance: contributors.sleep_balance,
  }

  // noUncheckedIndexedAccess makes Record indexing return `string | undefined`;
  // resolve to a guaranteed string before use in a template literal.
  const resilienceLevelClass = (level: string): string =>
    RESILIENCE_COLORS[level] ?? RESILIENCE_COLORS.solid

  const tempDev = day.temperatureDeviation
  const tempSign = tempDev !== null && tempDev >= 0 ? '+' : ''
  const tempIsHigh = tempDev !== null && tempDev > 0.5
  const tempIsLow = tempDev !== null && tempDev < -0.5

  return (
    <div className="space-y-6 px-4 pt-8 pb-6">
      <BackLink />

      {/* Header: date + score ring */}
      <div className="flex items-center gap-4">
        <ScoreRing score={day.score} size={72} color="indigo" />
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

      {/* Status badges: stress high, recovery high */}
      {(day.stressHigh || day.recoveryHigh) && (
        <div className="flex flex-wrap gap-2">
          {day.stressHigh && (
            <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
              {t('stressHigh')}
            </span>
          )}
          {day.recoveryHigh && (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
              {t('recoveryHigh')}
            </span>
          )}
        </div>
      )}

      {/* Temperature deviation */}
      {tempDev !== null && (
        <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
          <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">
            {t('temperatureDeviation')}
          </p>
          <p
            className={`text-2xl font-bold ${
              tempIsHigh
                ? 'text-rose-500 dark:text-rose-400'
                : tempIsLow
                  ? 'text-sky-500 dark:text-sky-400'
                  : 'text-slate-900 dark:text-white'
            }`}
          >
            {tempSign}
            {tempDev.toFixed(2)}°C
          </p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            {/* Trend deviation gives a multi-day perspective */}
            {day.temperatureTrendDeviation !== null &&
              `Trend: ${day.temperatureTrendDeviation >= 0 ? '+' : ''}${day.temperatureTrendDeviation.toFixed(2)}°C`}
          </p>
        </div>
      )}

      {/* Resilience level badge */}
      {resilience && (
        <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
          <p className="mb-2 text-xs font-semibold text-slate-500 uppercase dark:text-slate-400">
            {t('resilience.title')}
          </p>
          <span
            className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${resilienceLevelClass(resilience.level)}`}
          >
            {t(`resilience.${resilience.level}`)}
          </span>
          {/* Sub-scores if available */}
          {(resilience.sleepRecovery !== null || resilience.daytimeRecovery !== null) && (
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <dt className="text-slate-400 dark:text-slate-500">Sleep recovery</dt>
                <dd className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200">
                  {resilience.sleepRecovery ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400 dark:text-slate-500">Daytime recovery</dt>
                <dd className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200">
                  {resilience.daytimeRecovery ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400 dark:text-slate-500">Stress</dt>
                <dd className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200">
                  {resilience.stress ?? '—'}
                </dd>
              </div>
            </dl>
          )}
        </div>
      )}

      {/* Contributor radar chart */}
      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
          {t('contributors.title')}
        </h2>
        <ContributorRadar contributors={contributorRecord} />
      </section>

      {/* Contributor bars for exact values */}
      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
        <h2 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
          {t('contributors.title')}
        </h2>
        <div className="space-y-3">
          {(
            [
              [t('contributors.activityBalance'), contributors.activity_balance],
              [t('contributors.bodyTemperature'), contributors.body_temperature],
              [t('contributors.hrvBalance'), contributors.hrv_balance],
              [t('contributors.previousDayActivity'), contributors.previous_day_activity],
              [t('contributors.previousNight'), contributors.previous_night],
              [t('contributors.recoveryIndex'), contributors.recovery_index],
              [t('contributors.restingHeartRate'), contributors.resting_heart_rate],
              [t('contributors.sleepBalance'), contributors.sleep_balance],
            ] as [string, number | null][]
          ).map(([label, value]) => (
            <div key={label} data-testid="contributor-item">
              <ContributorBar label={label} value={value} optimal={(value ?? 0) >= 70} />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function BackLink() {
  const { t } = useTranslation('common')
  return (
    <Link
      to="/readiness"
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
