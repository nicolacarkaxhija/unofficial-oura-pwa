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

// ─── Day range ────────────────────────────────────────────────────────────────

/**
 * Min/max of a list of YYYY-MM-DD strings, or null when the list is empty.
 * Lexicographic comparison is safe because the format is fixed-width ISO.
 * Lives here (not inline in the import worker) so the exact coverage range
 * shown in Settings is unit-testable without spinning up the worker.
 */
export function computeDayRange(days: string[]): { first: string; last: string } | null {
  const seed = days[0]
  if (seed === undefined) return null
  let first = seed
  let last = seed
  for (const d of days) {
    if (d < first) first = d
    if (d > last) last = d
  }
  return { first, last }
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

// ─── Streaks ──────────────────────────────────────────────────────────────────
//
// A streak is a run of consecutive *calendar* days with score ≥ threshold.
// Two rules worth spelling out:
//   • Gaps break streaks: a day missing from the series (ring not worn) makes
//     the days around it non-consecutive even if both qualify — enforced by
//     comparing calendar distance, not array adjacency. A recorded day with a
//     null score breaks a streak the same way.
//   • `current` is measured back from the NEWEST DAY ON RECORD, not from
//     today. The data source is a GDPR export, which is always historical —
//     anchoring on today would zero every streak the day after the export was
//     taken, which reads as a bug rather than information.

export interface StreakResult {
  /** Streak length ending at the newest day on record (0 if it doesn't qualify). */
  current: number
  /** Longest qualifying streak anywhere in the series. */
  longest: number
}

/** Calendar-day distance between two YYYY-MM-DD strings (a minus b). */
function dayDiff(a: string, b: string): number {
  // T00:00:00Z pins both to UTC midnight so DST can't yield fractional days.
  const MS_PER_DAY = 86_400_000
  return (new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / MS_PER_DAY
}

/**
 * @param days newest-first, as returned by the useXxxDays hooks.
 * @param threshold inclusive — a score exactly at the threshold counts.
 */
export function computeStreak(days: DayScore[], threshold = 70): StreakResult {
  const qualifies = (d: DayScore): boolean => d.score !== null && d.score >= threshold

  // Current streak: walk from the newest row while every day qualifies and
  // is exactly one calendar day older than the previous one.
  let current = 0
  let prevDay: string | null = null
  for (const d of days) {
    if (!qualifies(d)) break
    if (prevDay !== null && dayDiff(prevDay, d.day) !== 1) break
    current += 1
    prevDay = d.day
  }

  // Longest streak: same contiguity rule, tracked across the whole series.
  let longest = 0
  let run = 0
  prevDay = null
  for (const d of days) {
    const contiguous = prevDay !== null && dayDiff(prevDay, d.day) === 1
    run = qualifies(d) ? (contiguous && run > 0 ? run + 1 : 1) : 0
    if (run > longest) longest = run
    prevDay = d.day
  }

  return { current, longest }
}

// ─── Daily stress averages ────────────────────────────────────────────────────
//
// stressPoints are sub-day samples (several per day). The Activity list's
// trend chart wants one point per day, so we average the non-null samples per
// calendar day. Stress and recovery are averaged independently: a sample can
// carry one value without the other, and dropping the whole sample would bias
// whichever series had the reading.

export interface StressSample {
  /** YYYY-MM-DD */
  day: string
  stressValue: number | null
  recoveryValue: number | null
}

export interface DailyStressAverage {
  /** YYYY-MM-DD */
  day: string
  /** Mean of the day's non-null stress samples; null if none. */
  avgStress: number | null
  /** Mean of the day's non-null recovery samples; null if none. */
  avgRecovery: number | null
}

/**
 * @returns one entry per distinct day, oldest-first (chart order), capped to
 *   the `maxDays` most recent days on record.
 */
export function computeDailyStressAverages(
  points: StressSample[],
  maxDays = 90,
): DailyStressAverage[] {
  const byDay = new Map<string, { stress: number[]; recovery: number[] }>()
  for (const p of points) {
    let bucket = byDay.get(p.day)
    if (!bucket) {
      bucket = { stress: [], recovery: [] }
      byDay.set(p.day, bucket)
    }
    if (p.stressValue !== null) bucket.stress.push(p.stressValue)
    if (p.recoveryValue !== null) bucket.recovery.push(p.recoveryValue)
  }

  const mean = (xs: number[]): number | null =>
    xs.length === 0 ? null : xs.reduce((sum, x) => sum + x, 0) / xs.length

  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-maxDays) // most recent days win when the window overflows
    .map(([day, bucket]) => ({
      day,
      avgStress: mean(bucket.stress),
      avgRecovery: mean(bucket.recovery),
    }))
}
