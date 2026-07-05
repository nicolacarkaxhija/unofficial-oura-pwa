import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { ScoreHistoryChart, StressTrendChart } from '@/components/charts'
import { STRESS_COLOR, RECOVERY_COLOR } from '@/components/charts/StressTrendChart'
import { ScoreRing, LoadingSkeleton, RangeSelector } from '@/components/ui'
import { useActivityDays, useDailyStressAverages } from '@/db/hooks'

// ─── ActivityList ─────────────────────────────────────────────────────────────
//
// Scrollable list of the last 90 activity days, newest first.
// Each row: date, score ring, steps, active calories.
//
// Steps and calories are formatted with locale number separators (toLocaleString)
// because "10,234" is easier to parse than "10234" at a glance.

const ACTIVITY_COLOR = '#10b981' // emerald-500

// Rows rendered before a \"Show more\" click — comfortably above the 1y
// window so pagination only ever appears for \"All\".
const PAGE_SIZE = 400

function formatDate(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  })
}

export default function ActivityList() {
  const { t } = useTranslation('activity')
  const { t: tCommon } = useTranslation('common')

  // History window (row limit). Display is additionally paginated so "All"
  // on a multi-year export doesn't render thousands of DOM rows at once.
  const [rangeDays, setRangeDays] = useState(90)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const days = useActivityDays(rangeDays)
  // Stress lives under the activity pillar in this app. A fixed 90-day window
  // (independent of the score range selector) keeps this a stable at-a-glance
  // trend instead of a second range-driven chart.
  const dailyStress = useDailyStressAverages(90)

  return (
    <div className="px-4 pt-8 pb-6">
      <h1 className="mb-4 text-2xl font-bold text-slate-900 dark:text-white">{t('title')}</h1>

      <RangeSelector
        value={rangeDays}
        onChange={(d) => {
          setRangeDays(d)
          setVisibleCount(PAGE_SIZE)
        }}
      />

      {days === undefined ? (
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
          {/* 90-day trend chart */}
          <div className="mb-6 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
            <p className="mb-2 text-xs font-semibold text-slate-500 uppercase dark:text-slate-400">
              {t('score')}
            </p>
            <ScoreHistoryChart
              data={days.map((d) => ({ day: d.day, score: d.score }))}
              color={ACTIVITY_COLOR}
            />
          </div>

          {/* Day list */}
          <ul className="space-y-2">
            {days.slice(0, visibleCount).map((day) => (
              <li key={day.day}>
                <Link
                  to="/activity/$date"
                  params={{ date: day.day }}
                  data-testid="activity-day-item"
                  className="flex items-center gap-4 rounded-xl bg-white px-4 py-3 shadow-sm transition-colors hover:bg-slate-50 active:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 dark:active:bg-slate-600"
                >
                  <ScoreRing score={day.score} size={48} color="emerald" />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {formatDate(day.day)}
                    </p>
                    {/* Steps + active calories as quick-glance stats */}
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {day.steps !== null
                        ? `${day.steps.toLocaleString()} ${t('stats.steps').toLowerCase()}`
                        : '—'}
                      {day.activeCalories !== null
                        ? ` · ${day.activeCalories.toLocaleString()} kcal`
                        : ''}
                    </p>
                  </div>

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

          {days.length > visibleCount && (
            <button
              type="button"
              onClick={() => {
                setVisibleCount((c) => c + PAGE_SIZE)
              }}
              className="mt-4 w-full rounded-xl bg-slate-100 py-3 text-sm font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            >
              {tCommon('showMore')}
            </button>
          )}
        </>
      )}

      {/* ── Stress & recovery trend ── rendered outside the score-range branch:
          stress data can exist even when the activity table is empty (partial
          exports). Skipped entirely when there is no stress data on record. */}
      {dailyStress && dailyStress.length > 0 && (
        <div
          className="mt-6 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800"
          data-testid="stress-trend-section"
        >
          <p className="mb-2 text-xs font-semibold text-slate-500 uppercase dark:text-slate-400">
            {t('stressTrend.title')}
          </p>
          <StressTrendChart data={dailyStress} />
          <div className="mt-2 flex gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: STRESS_COLOR }}
                aria-hidden="true"
              />
              {t('stressTrend.stress')}
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: RECOVERY_COLOR }}
                aria-hidden="true"
              />
              {t('stressTrend.recovery')}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
