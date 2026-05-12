import { format, parseISO } from 'date-fns'
import { useParams, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { HypnogramChart, TimeSeriesChart } from '@/components/charts'
import { ContributorBar, ScoreRing, LoadingSkeleton } from '@/components/ui'
import { useSleepDay, useSleepSession } from '@/db/hooks'

// ─── SleepDetail ──────────────────────────────────────────────────────────────
//
// Detailed view for one sleep night.
//
// Data model: SleepDay holds the summary (score, contributors, SpO₂),
// SleepSession holds the time-series arrays (hypnogram, HR, HRV) and the
// precise bedtime start/end. We load both in parallel via useLiveQuery hooks.
//
// HR / HRV data prep for TimeSeriesChart:
//   The session stores heartRate and hrv as number arrays at 5-min resolution.
//   TimeSeriesChart expects Array<{ timestamp: number; value: number }> where
//   timestamp is Unix milliseconds. We reconstruct timestamps from bedtimeStart
//   + interval index * 5 minutes.

function buildTimeSeries(
  values: number[] | null,
  startTime: string,
  intervalMinutes = 5,
): Array<{ timestamp: number; value: number }> {
  if (!values || values.length === 0) return []
  const startMs = new Date(startTime).getTime()
  const intervalMs = intervalMinutes * 60 * 1000
  return values.map((value, i) => ({
    timestamp: startMs + i * intervalMs,
    value,
  }))
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—'
  const totalMinutes = Math.round(seconds / 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h.toString()}h ${m.toString().padStart(2, '0')}m`
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return format(parseISO(iso), 'HH:mm')
  } catch {
    return '—'
  }
}

export default function SleepDetail() {
  const { t } = useTranslation('sleep')

  // TanStack Router already validated this param via parseDateParam in router.tsx
  const { date } = useParams({ from: '/sleep/$date' })

  const day = useSleepDay(date)
  const session = useSleepSession(date)

  // useLiveQuery returns undefined while in-flight and the resolved value after.
  // For day: undefined → loading or not-found; SleepDay → found.
  // For session: undefined → loading or not-found; SleepSession → found.
  // We show a skeleton while either hook is still loading.
  if (!day) {
    return (
      <div className="space-y-4 px-4 pt-8 pb-6">
        <LoadingSkeleton className="h-8 w-48 rounded-lg" />
        <LoadingSkeleton className="h-48 w-full rounded-2xl" />
        <LoadingSkeleton className="h-48 w-full rounded-2xl" />
        <LoadingSkeleton className="h-48 w-full rounded-2xl" />
      </div>
    )
  }

  // day is SleepDay; session is SleepSession | undefined (may not exist for this date)
  const hrData = session ? buildTimeSeries(session.heartRate, session.bedtimeStart) : []
  const hrvData = session ? buildTimeSeries(session.hrv, session.bedtimeStart) : []

  const contributors = day.contributors

  return (
    <div className="space-y-6 px-4 pt-8 pb-6">
      {/* Back navigation */}
      <BackLink />

      {/* Header: date + score */}
      <div className="flex items-center gap-4">
        <ScoreRing score={day.score} size={72} color="blue" />
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

      {/* Stats grid: bedtime, wake, total sleep, efficiency, SpO₂, HRV, resting HR */}
      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <StatItem label={t('detail.bedtime')} value={formatTime(session?.bedtimeStart ?? null)} />
          <StatItem label={t('detail.wakeTime')} value={formatTime(session?.bedtimeEnd ?? null)} />
          <StatItem
            label={t('detail.totalSleep')}
            value={formatDuration(session?.totalSleepDuration ?? null)}
          />
          <StatItem
            label={t('detail.efficiency')}
            value={session?.efficiency != null ? `${session.efficiency.toString()}%` : '—'}
          />
          <StatItem
            label={t('detail.spo2')}
            value={day.spo2Percentage !== null ? `${day.spo2Percentage.toString()}%` : '—'}
          />
          <StatItem
            label={t('detail.averageHrv')}
            value={session?.averageHrv != null ? `${session.averageHrv.toString()} ms` : '—'}
          />
          <StatItem
            label={t('detail.averageHr')}
            value={
              session?.averageHeartRate != null ? `${session.averageHeartRate.toString()} bpm` : '—'
            }
          />
          <StatItem
            label={t('detail.lowestHr')}
            value={
              session?.lowestHeartRate != null ? `${session.lowestHeartRate.toString()} bpm` : '—'
            }
          />
          <StatItem
            label={t('detail.averageBreath')}
            value={
              session?.averageBreath != null ? `${session.averageBreath.toString()} brpm` : '—'
            }
          />
        </dl>
      </section>

      {/* Hypnogram — shown only when session phase data is available */}
      {session?.sleepPhase5Min && session.sleepPhase5Min.length > 0 && (
        <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
            {t('stages.title')}
          </h2>
          <HypnogramChart
            phases={session.sleepPhase5Min}
            startTime={session.bedtimeStart}
            intervalMinutes={5}
          />
        </section>
      )}

      {/* Heart Rate curve */}
      {hrData.length > 0 && (
        <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
          <TimeSeriesChart
            data={hrData}
            label={t('detail.averageHr')}
            unit="bpm"
            color="#f43f5e" // rose-500 — HR is conventionally red
          />
        </section>
      )}

      {/* HRV curve */}
      {hrvData.length > 0 && (
        <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
          <TimeSeriesChart
            data={hrvData}
            label={t('detail.averageHrv')}
            unit="ms"
            color="#10b981" // emerald-500 — HRV up = recovery, green feels right
          />
        </section>
      )}

      {/* Sleep contributors */}
      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
        <h2 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
          {t('contributors.title')}
        </h2>
        <div className="space-y-3">
          <ContributorBar
            label={t('contributors.deepSleep')}
            value={contributors.deep_sleep}
            optimal={(contributors.deep_sleep ?? 0) >= 70}
          />
          <ContributorBar
            label={t('contributors.efficiency')}
            value={contributors.efficiency}
            optimal={(contributors.efficiency ?? 0) >= 70}
          />
          <ContributorBar
            label={t('contributors.latency')}
            value={contributors.latency}
            optimal={(contributors.latency ?? 0) >= 70}
          />
          <ContributorBar
            label={t('contributors.remSleep')}
            value={contributors.rem_sleep}
            optimal={(contributors.rem_sleep ?? 0) >= 70}
          />
          <ContributorBar
            label={t('contributors.restfulness')}
            value={contributors.restfulness}
            optimal={(contributors.restfulness ?? 0) >= 70}
          />
          <ContributorBar
            label={t('contributors.timing')}
            value={contributors.timing}
            optimal={(contributors.timing ?? 0) >= 70}
          />
          <ContributorBar
            label={t('contributors.totalSleep')}
            value={contributors.total_sleep}
            optimal={(contributors.total_sleep ?? 0) >= 70}
          />
        </div>
      </section>
    </div>
  )
}

// ─── Helper sub-components ────────────────────────────────────────────────────

function BackLink() {
  const { t } = useTranslation('common')
  return (
    <Link
      to="/sleep"
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
