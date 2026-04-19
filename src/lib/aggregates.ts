// ─── Score aggregates ─────────────────────────────────────────────────────────
//
// Pure functions over day-score series — the arithmetic behind the Dashboard's
// Trends section. Kept free of Dexie/React so the exact numbers users see are
// directly unit-testable.
//
// Windows are counted in *rows*, not calendar days: an export with gaps (ring
// not worn) compares the 7 most recent recorded days against the 7 before
// them. Comparing calendar weeks instead would silently average over missing
// days and produce misleading deltas for irregular wearers.

export interface DayScore {
  /** YYYY-MM-DD */
  day: string
  score: number | null
}

export interface WeeklyInsight {
  /** Mean score of the 7 most recent scored days; null if none. */
  avg: number | null
  /**
   * avg minus the mean of the previous 7 scored days; null when there is no
   * previous window to compare against (fewer than 8 scored days on record).
   */
  delta: number | null
  /** Highest score on record and the (most recent) day it was achieved. */
  best: { day: string; score: number } | null
}

const WINDOW = 7

/**
 * @param days newest-first, as returned by the useXxxDays hooks.
 */
export function computeWeeklyInsight(days: DayScore[]): WeeklyInsight {
  const scored = days.filter((d): d is { day: string; score: number } => d.score !== null)

  const current = scored.slice(0, WINDOW)
  const previous = scored.slice(WINDOW, WINDOW * 2)

  const mean = (xs: { score: number }[]): number | null =>
    xs.length === 0 ? null : xs.reduce((sum, x) => sum + x.score, 0) / xs.length

  const avg = mean(current)
  const prevAvg = mean(previous)

  let best: WeeklyInsight['best'] = null
  for (const d of scored) {
    // Strict > keeps the most recent occurrence on ties (scored is newest-first).
    if (best === null || d.score > best.score) best = { day: d.day, score: d.score }
  }

  return {
    avg,
    delta: avg !== null && prevAvg !== null ? avg - prevAvg : null,
    best,
  }
}
