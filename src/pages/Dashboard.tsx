import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { ScoreRing, LoadingSkeleton } from '@/components/ui'
import { useSleepDay, useReadinessDay, useActivityDay } from '@/db/hooks'

// ─── Dashboard ────────────────────────────────────────────────────────────────
//
// Today's three score cards: sleep, readiness, activity.
//
// Why format(new Date(), 'yyyy-MM-dd') rather than toISOString().slice(0, 10)?
//   toISOString() always returns UTC midnight. On a device at UTC-5, midnight UTC
//   on Jan 2 corresponds to 7pm local time on Jan 1 — the "today" query would
//   return yesterday's data. format() uses the device's local calendar date.
//
// Loading state: any hook returning undefined means IndexedDB hasn't responded
// yet. We show a skeleton grid to avoid layout shift when data arrives.

const SCORE_COLORS = {
  sleep: '#60a5fa', // blue-400 — consistent with hypnogram's light-sleep colour
  readiness: '#6366f1', // indigo-500 — matches ContributorRadar stroke
  activity: '#10b981', // emerald-500 — Oura's activity brand colour
} as const

export default function Dashboard() {
  const { t } = useTranslation('common')
  const { t: tSleep } = useTranslation('sleep')
  const { t: tReadiness } = useTranslation('readiness')
  const { t: tActivity } = useTranslation('activity')
  const navigate = useNavigate()

  // Use local calendar date so queries match the user's timezone
  const today = format(new Date(), 'yyyy-MM-dd')

  const sleepDay = useSleepDay(today)
  const readinessDay = useReadinessDay(today)
  const activityDay = useActivityDay(today)

  const loading = sleepDay === undefined || readinessDay === undefined || activityDay === undefined

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
            aria-label={`${tSleep('title')} — ${tSleep('score')}: ${sleepDay.score !== null ? String(sleepDay.score) : '—'}`}
          >
            <DashboardCard
              title={tSleep('title')}
              score={sleepDay.score}
              color="blue"
              hexColor={SCORE_COLORS.sleep}
              subtitle={tSleep('score')}
            />
          </button>

          {/* Readiness card */}
          <button
            type="button"
            className="text-left"
            onClick={() => void navigate({ to: '/readiness' })}
            aria-label={`${tReadiness('title')} — ${tReadiness('score')}: ${readinessDay.score !== null ? String(readinessDay.score) : '—'}`}
          >
            <DashboardCard
              title={tReadiness('title')}
              score={readinessDay.score}
              color="indigo"
              hexColor={SCORE_COLORS.readiness}
              subtitle={tReadiness('score')}
            />
          </button>

          {/* Activity card */}
          <button
            type="button"
            className="text-left"
            onClick={() => void navigate({ to: '/activity' })}
            aria-label={`${tActivity('title')} — ${tActivity('score')}: ${activityDay.score !== null ? String(activityDay.score) : '—'}`}
          >
            <DashboardCard
              title={tActivity('title')}
              score={activityDay.score}
              color="emerald"
              hexColor={SCORE_COLORS.activity}
              subtitle={tActivity('score')}
            />
          </button>
        </div>
      )}

      {/* Today's date displayed beneath the cards for orientation */}
      <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
        {new Date().toLocaleDateString(undefined, {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      </p>
    </div>
  )
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
  hexColor: string
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
