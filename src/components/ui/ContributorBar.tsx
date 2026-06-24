// ─── ContributorBar ───────────────────────────────────────────────────────────
//
// Renders one row of a contributor breakdown (e.g. Oura's readiness/sleep
// contributor panels). The bar colour distinguishes optimal vs. non-optimal:
//   - optimal = emerald (the Oura convention for "good")
//   - non-optimal = amber (flagging something to work on, not red-alarming)
//
// A null value represents missing/unscored data; we render an empty grey bar
// rather than 0% to avoid misleading the user into thinking the score was 0.

import type { ReactElement } from 'react'

interface ContributorBarProps {
  label: string
  value: number | null
  optimal?: boolean
}

export function ContributorBar({ label, value, optimal = false }: ContributorBarProps): ReactElement {
  const pct = value !== null ? Math.max(0, Math.min(100, value)) : null

  const barColor =
    pct === null
      ? 'bg-gray-300 dark:bg-gray-600'
      : optimal
        ? 'bg-emerald-500 dark:bg-emerald-400'
        : 'bg-amber-400 dark:bg-amber-300'

  return (
    <div className="flex items-center gap-3">
      {/* Label — fixed width so bars all start at the same x position */}
      <span className="w-32 shrink-0 text-sm text-gray-700 dark:text-gray-300">{label}</span>

      {/* Bar track */}
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
        role="progressbar"
        aria-valuenow={pct ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${barColor}`}
          style={{ width: pct !== null ? `${pct}%` : '0%' }}
        />
      </div>

      {/* Numeric score — right-aligned, monospaced so digits don't shift */}
      <span className="w-8 text-right font-mono text-sm font-medium text-gray-700 dark:text-gray-300">
        {pct !== null ? pct : '—'}
      </span>
    </div>
  )
}
