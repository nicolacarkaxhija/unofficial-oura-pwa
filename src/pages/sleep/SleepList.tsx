import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { ScoreHistoryChart } from '@/components/charts'
import { ScoreRing, LoadingSkeleton } from '@/components/ui'
import { useSleepDays } from '@/db/hooks'

// ─── SleepList ────────────────────────────────────────────────────────────────
//
// Scrollable list of the last 90 sleep days, newest first.
// Each row shows: date, ScoreRing, and total sleep time formatted as H:MM.
//
// Why format total sleep as H:MM rather than minutes?
//   Oura stores sleep durations in seconds. "7h 32m" is instantly legible;
//   "452 minutes" requires mental arithmetic. We avoid importing date-fns'
//   intervalToDuration here because the conversion is trivial.

function formatSleepDuration(seconds: number | null): string {
  if (seconds === null) return '—'
  const totalMinutes = Math.round(seconds / 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h}h ${m.toString().padStart(2, '0')}m`
}

// Format "2024-06-15" → locale-appropriate short date for list rows
function formatDate(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  })
}

// Brand colour for sleep charts — matches HypnogramChart's light-sleep blue
const SLEEP_COLOR = '#60a5fa'

export default function SleepList() {
  const { t } = useTranslation('sleep')
  const { t: tCommon } = useTranslation('common')

  // Returns undefined while IndexedDB is being queried (first render)
  const days = useSleepDays(90)

  return (
    <div className="px-4 pt-8 pb-6">
      <h1 className="mb-4 text-2xl font-bold text-slate-900 dark:text-white">
        {t('title')}
      </h1>

      {days === undefined ? (
        // Loading state — skeleton chart + list rows
        <div className="space-y-3">
          <LoadingSkeleton className="h-48 w-full rounded-2xl" />
          {Array.from({ length: 6 }).map((_, i) => (
            <LoadingSkeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : days.length === 0 ? (
        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          {tCommon('noData')}
        </p>
      ) : (
        <>
          {/* 90-day trend chart at the top — gives context before diving into rows */}
          <div className="mb-6 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
            <p className="mb-2 text-xs font-semibold text-slate-500 uppercase dark:text-slate-400">
              {t('score')} — 90 days
            </p>
            <ScoreHistoryChart
              data={days.map((d) => ({ day: d.day, score: d.score }))}
              color={SLEEP_COLOR}
            />
          </div>

          {/* Day list */}
          <ul className="space-y-2">
            {days.map((day) => (
              <li key={day.day}>
                <Link
                  to="/sleep/$date"
                  params={{ date: day.day }}
                  className="flex items-center gap-4 rounded-xl bg-white px-4 py-3 shadow-sm transition-colors hover:bg-slate-50 active:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 dark:active:bg-slate-600"
                >
                  {/* Score ring — compact size for list density */}
                  <ScoreRing score={day.score} size={48} color="blue" />

                  {/* Date and sleep duration */}
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {formatDate(day.day)}
                    </p>
                    {/* Total sleep from contributors table if session not loaded */}
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {/* We don't have the session duration in SleepDay — show score only */}
                      {t('score')}: {day.score !== null ? day.score : '—'}
                    </p>
                  </div>

                  {/* Chevron affordance */}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    className="shrink-0 text-slate-300 dark:text-slate-600"
                    aria-hidden="true"
                  >
                    <path
                      d="M6 4l4 4-4 4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

// Expose formatSleepDuration for SleepDetail to avoid duplication
export { formatSleepDuration }
