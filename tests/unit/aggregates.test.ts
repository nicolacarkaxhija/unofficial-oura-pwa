import { describe, it, expect } from 'vitest'
import { computeWeeklyInsight, type DayScore } from '@/lib/aggregates'

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
