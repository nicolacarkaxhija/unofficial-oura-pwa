// ─── ScoreRing ────────────────────────────────────────────────────────────────
//
// SVG Math explained:
//   Given a circle of radius r, its circumference = 2πr.
//   We use strokeDasharray = circumference so the entire stroke is "one dash".
//   strokeDashoffset shifts the start of that dash — a full offset (= circumference)
//   hides the stroke entirely; offset 0 shows it fully.
//   Mapping score 0-100 → offset: offset = circumference * (1 - score/100).
//   So score=100 → offset=0 (full ring), score=0 → offset=circumference (empty ring).
//
//   The ring starts at the 12 o'clock position via `transform: rotate(-90deg)` on
//   the <svg>, because SVG's default 0° angle is 3 o'clock (positive x-axis).

import type { ReactElement } from 'react'

// Map a Tailwind color token to the matching stroke colour.
// We use inline style (not a dynamic class) because Tailwind's JIT scanner
// cannot see runtime-interpolated class names — they would be tree-shaken.
const COLOR_MAP: Record<string, string> = {
  sky: '#0ea5e9',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  teal: '#14b8a6',
  cyan: '#06b6d4',
  lime: '#84cc16',
  orange: '#f97316',
  pink: '#ec4899',
  purple: '#a855f7',
  blue: '#3b82f6',
  green: '#22c55e',
  red: '#ef4444',
  yellow: '#eab308',
  slate: '#64748b',
  gray: '#6b7280',
  zinc: '#71717a',
  neutral: '#737373',
  stone: '#78716c',
}

const NEUTRAL_COLOR = '#9ca3af' // gray-400 — used when score is null

interface ScoreRingProps {
  score: number | null
  size?: number
  color: string
}

export function ScoreRing({ score, size = 80, color }: ScoreRingProps): ReactElement {
  const strokeWidth = size * 0.1
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  const clampedScore = score !== null ? Math.max(0, Math.min(100, score)) : null
  const offset = clampedScore !== null ? circumference * (1 - clampedScore / 100) : circumference

  const strokeColor = COLOR_MAP[color] ?? NEUTRAL_COLOR
  const activeStroke = score !== null ? strokeColor : NEUTRAL_COLOR

  const label =
    score !== null
      ? `Score: ${score} out of 100`
      : 'Score unavailable'

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-label={label}
      role="img"
      style={{ transform: 'rotate(-90deg)' }}
    >
      {/* Track ring — always visible as the background */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-gray-200 dark:text-gray-700"
      />
      {/* Progress ring — fills clockwise as score increases */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={activeStroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.6s ease-out' }}
      />
    </svg>
  )
}
