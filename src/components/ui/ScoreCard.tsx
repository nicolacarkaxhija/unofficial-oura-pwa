// ─── ScoreCard ────────────────────────────────────────────────────────────────
//
// Displays a labelled metric value with an optional delta indicator.
// Delta > 0 = improvement (green, arrow up); delta < 0 = decline (red, arrow down).
// Delta = 0 is treated as neutral (no arrow rendered) since a zero change carries
// no directional meaning.

import type { ReactElement } from 'react'

interface ScoreCardProps {
  title: string
  value: string | number | null
  subtitle?: string
  delta?: number
}

function DeltaIndicator({ delta }: { delta: number }): ReactElement | null {
  if (delta === 0) return null

  const isPositive = delta > 0

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-sm font-medium ${
        isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
      }`}
      aria-label={`${isPositive ? 'up' : 'down'} ${Math.abs(delta)}`}
    >
      {/* Inline SVG arrows — no icon library dependency */}
      {isPositive ? (
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path d="M6 2L10 8H2L6 2Z" fill="currentColor" />
        </svg>
      ) : (
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path d="M6 10L2 4H10L6 10Z" fill="currentColor" />
        </svg>
      )}
      {Math.abs(delta)}
    </span>
  )
}

export function ScoreCard({ title, value, subtitle, delta }: ScoreCardProps): ReactElement {
  const displayValue = value !== null && value !== undefined ? value : '—'

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-gray-800">
      <p className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
        {title}
      </p>

      <div className="mt-1 flex items-end gap-2">
        <span className="text-3xl font-bold text-gray-900 dark:text-white">
          {displayValue}
        </span>
        {delta !== undefined && <DeltaIndicator delta={delta} />}
      </div>

      {subtitle !== undefined && (
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{subtitle}</p>
      )}
    </div>
  )
}
