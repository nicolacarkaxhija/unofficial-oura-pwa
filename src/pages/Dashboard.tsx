import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { ScoreRing, LoadingSkeleton } from '@/components/ui'
import { useLatestSleepDay, useLatestReadinessDay, useLatestActivityDay } from '@/db/hooks'

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
