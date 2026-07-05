import { describe, it, expect } from 'vitest'
import {
  computeDailyStressAverages,
  computeDayRange,
  computeStreak,
  computeWeeklyInsight,
  type DayScore,
  type StressSample,
} from '@/lib/aggregates'

// Newest-first, matching the useXxxDays hook contract the Dashboard feeds in.
function series(scores: (number | null)[]): DayScore[] {
  return scores.map((score, i) => ({
    day: `2024-03-${String(31 - i).padStart(2, '0')}`,
    score,
  }))
}

describe('computeWeeklyInsight', () => {
  it('returns all-null insight for an empty series', () => {
    expect(computeWeeklyInsight([])).toEqual({ avg: null, delta: null, best: null })
  })

  it('returns all-null insight when every score is null', () => {
    expect(computeWeeklyInsight(series([null, null, null]))).toEqual({
      avg: null,
      delta: null,
      best: null,
    })
  })

  it('averages the 7 most recent scored days', () => {
    const insight = computeWeeklyInsight(series([80, 80, 80, 80, 80, 80, 80, 10, 10]))
    expect(insight.avg).toBe(80)
  })

  it('averages fewer than 7 days when that is all there is, with null delta', () => {
    // 3 scored days: an average is meaningful, a week-over-week delta is not.
    const insight = computeWeeklyInsight(series([70, 80, 90]))
    expect(insight.avg).toBe(80)
    expect(insight.delta).toBeNull()
  })

  it('computes delta against the previous 7 scored days', () => {
    const insight = computeWeeklyInsight(
      series([80, 80, 80, 80, 80, 80, 80, 70, 70, 70, 70, 70, 70, 70]),
    )
    expect(insight.delta).toBe(10)
  })

  it('skips null scores when building windows (gap tolerance)', () => {
    // Nulls interleaved: windows are built from *scored* rows only, so the
    // current window still averages 80 and the previous one 70.
    const insight = computeWeeklyInsight(
      series([80, null, 80, 80, null, 80, 80, 80, 80, 70, null, 70, 70, 70, 70, 70, 70]),
    )
    expect(insight.avg).toBe(80)
    expect(insight.delta).toBe(10)
  })

  it('reports a negative delta when the recent week is worse', () => {
    const insight = computeWeeklyInsight(
      series([60, 60, 60, 60, 60, 60, 60, 90, 90, 90, 90, 90, 90, 90]),
    )
    expect(insight.delta).toBe(-30)
  })

  it('finds the all-time best across the whole series, not just windows', () => {
    const insight = computeWeeklyInsight(
      series([50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 99]),
    )
    expect(insight.best).toEqual({ day: '2024-03-17', score: 99 })
  })

  it('keeps the most recent day on a tied best score', () => {
    const insight = computeWeeklyInsight(series([85, 85]))
    // Newest-first input: index 0 is the most recent day and must win the tie.
    expect(insight.best?.day).toBe('2024-03-31')
  })
})

describe('computeDayRange', () => {
  it('returns null for an empty list', () => {
    expect(computeDayRange([])).toBeNull()
  })

  it('returns the same day as first and last for a single entry', () => {
    expect(computeDayRange(['2024-06-01'])).toEqual({ first: '2024-06-01', last: '2024-06-01' })
  })

  it('finds min and max regardless of input order', () => {
    // The worker concatenates three pillar arrays, so the input is unsorted.
    expect(computeDayRange(['2024-03-05', '2023-12-31', '2024-06-15', '2024-01-01'])).toEqual({
      first: '2023-12-31',
      last: '2024-06-15',
    })
  })

  it('handles duplicated days across pillars', () => {
    expect(computeDayRange(['2024-02-02', '2024-02-02', '2024-02-01'])).toEqual({
      first: '2024-02-01',
      last: '2024-02-02',
    })
  })
})

// ─── computeStreak ────────────────────────────────────────────────────────────
//
// Input is newest-first with consecutive calendar days unless a test says
// otherwise; `series()` above produces 2024-03-31 backwards.

describe('computeStreak', () => {
  it('returns zeros for an empty series', () => {
    expect(computeStreak([])).toEqual({ current: 0, longest: 0 })
  })

  it('counts a single qualifying day as current=1, longest=1', () => {
    expect(computeStreak(series([75]))).toEqual({ current: 1, longest: 1 })
  })

  it('returns current=0 when the newest day on record does not qualify', () => {
    // Longest run lives in the past; the streak "now" (= newest recorded day) is broken.
    expect(computeStreak(series([60, 80, 85, 90]))).toEqual({ current: 0, longest: 3 })
  })

  it('counts back from the newest day on record, not from today', () => {
    // Every day qualifies and days are consecutive — the whole series is the streak,
    // regardless of how far in the past 2024-03-31 is.
    expect(computeStreak(series([70, 71, 72, 73]))).toEqual({ current: 4, longest: 4 })
  })

  it('treats the threshold as inclusive (score exactly 70 counts)', () => {
    expect(computeStreak(series([70, 70]))).toEqual({ current: 2, longest: 2 })
  })

  it('honours a custom threshold', () => {
    expect(computeStreak(series([80, 80, 79]), 80)).toEqual({ current: 2, longest: 2 })
  })

  it('breaks the streak on a recorded day with a null score', () => {
    expect(computeStreak(series([75, null, 75, 75]))).toEqual({ current: 1, longest: 2 })
  })

  it('breaks the streak on a calendar gap even when both sides qualify', () => {
    // 2024-03-31 and 2024-03-29: the 30th is missing from the series (ring
    // not worn) — array adjacency must not be mistaken for day adjacency.
    const days: DayScore[] = [
      { day: '2024-03-31', score: 80 },
      { day: '2024-03-29', score: 80 },
      { day: '2024-03-28', score: 80 },
    ]
    expect(computeStreak(days)).toEqual({ current: 1, longest: 2 })
  })

  it('finds the longest streak in the middle of the series', () => {
    expect(computeStreak(series([50, 90, 90, 90, 50, 90, 90]))).toEqual({
      current: 0,
      longest: 3,
    })
  })
})

// ─── computeDailyStressAverages ───────────────────────────────────────────────

function sample(day: string, stress: number | null, recovery: number | null): StressSample {
  return { day, stressValue: stress, recoveryValue: recovery }
}

describe('computeDailyStressAverages', () => {
  it('returns an empty array for no samples', () => {
    expect(computeDailyStressAverages([])).toEqual([])
  })

  it('averages multiple samples per day independently for stress and recovery', () => {
    const result = computeDailyStressAverages([
      sample('2024-03-01', 40, 60),
      sample('2024-03-01', 60, null),
    ])
    expect(result).toEqual([{ day: '2024-03-01', avgStress: 50, avgRecovery: 60 }])
  })

  it('returns oldest-first regardless of input order', () => {
    const result = computeDailyStressAverages([
      sample('2024-03-02', 30, 30),
      sample('2024-03-01', 20, 20),
    ])
    expect(result.map((r) => r.day)).toEqual(['2024-03-01', '2024-03-02'])
  })

  it('yields null averages for a day with only null values', () => {
    const result = computeDailyStressAverages([sample('2024-03-01', null, null)])
    expect(result).toEqual([{ day: '2024-03-01', avgStress: null, avgRecovery: null }])
  })

  it('caps the window to the most recent maxDays days', () => {
    const points = ['2024-03-01', '2024-03-02', '2024-03-03'].map((d) => sample(d, 50, 50))
    const result = computeDailyStressAverages(points, 2)
    expect(result.map((r) => r.day)).toEqual(['2024-03-02', '2024-03-03'])
  })
})
