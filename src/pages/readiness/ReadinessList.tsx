import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { ScoreHistoryChart } from '@/components/charts'
import { ScoreRing, LoadingSkeleton, RangeSelector } from '@/components/ui'
import { useReadinessDays } from '@/db/hooks'

// ─── ReadinessList ────────────────────────────────────────────────────────────
//
// Scrollable list of the last 90 readiness days, newest first.
// Each row: date, score ring, temperature deviation badge.
//
// Temperature deviation badge:
//   A positive deviation (body temp above baseline) often signals illness or
//   stress; negative can mean recovery. We colour the badge amber for unusual
//   values (|dev| > 0.5°C) and neutral-grey for normal range.
//   Threshold 0.5°C matches Oura's own "flagging" logic from their published
//   whitepaper on body temperature and illness detection.

const READINESS_COLOR = '#6366f1' // indigo-500 — matches ContributorRadar

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

function TempBadge({ dev }: { dev: number | null }) {
  if (dev === null) return null
  const unusual = Math.abs(dev) > 0.5
  const sign = dev >= 0 ? '+' : ''
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
        unusual
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
      }`}
    >
      {sign}
      {dev.toFixed(1)}°C
    </span>
  )
}

export default function ReadinessList() {
  const { t } = useTranslation('readiness')
  const { t: tCommon } = useTranslation('common')

  // History window (row limit). Display is additionally paginated so "All"
  // on a multi-year export doesn't render thousands of DOM rows at once.
  const [rangeDays, setRangeDays] = useState(90)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const days = useReadinessDays(rangeDays)

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
              color={READINESS_COLOR}
            />
          </div>

          {/* Day list */}
          <ul className="space-y-2">
            {days.slice(0, visibleCount).map((day) => (
              <li key={day.day}>
                <Link
                  to="/readiness/$date"
                  params={{ date: day.day }}
                  data-testid="readiness-day-item"
                  className="flex items-center gap-4 rounded-xl bg-white px-4 py-3 shadow-sm transition-colors hover:bg-slate-50 active:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 dark:active:bg-slate-600"
                >
                  <ScoreRing score={day.score} size={48} color="indigo" />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {formatDate(day.day)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t('score')}: {day.score !== null ? day.score : '—'}
                    </p>
                  </div>

                  {/* Temperature deviation badge — surface unusual values without entering detail */}
                  <TempBadge dev={day.temperatureDeviation} />

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
    </div>
  )
}
