import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  parseSleepDays,
  parseSleepSessions,
  parseReadinessDays,
  parseResilienceDays,
  parseActivityDays,
  parseWorkouts,
  parseMeditations,
  parseStressPoints,
} from '@/connectors/oura/parsers'

// ─── Test helpers ─────────────────────────────────────────────────────────────
//
// `noUncheckedIndexedAccess` in tsconfig makes arr[n] return T | undefined.
// `at()` is the preferred way to get a typed narrow without a non-null assertion
// in production code, but in tests we want to fail loudly if the index is absent.
// `mustGet` throws a descriptive error rather than silently accessing undefined.
function mustGet<T>(arr: T[], index: number): T {
  const val = arr[index]
  if (val === undefined)
    throw new Error(
      `Expected element at index ${String(index)}, array has ${String(arr.length)} elements`,
    )
  return val
}

// Deeply-nested index access (e.g. spy.mock.calls[0]![0]) — two levels.
function mustGetNested<T>(arr: (T[] | undefined)[], outer: number, inner: number): T {
  const outer_arr = arr[outer]
  if (outer_arr === undefined) throw new Error(`Expected outer element at index ${String(outer)}`)
  const inner_val = outer_arr[inner]
  if (inner_val === undefined) throw new Error(`Expected inner element at index ${String(inner)}`)
  return inner_val
}

// ─── Shared fixtures ──────────────────────────────────────────────────────────
//
// Each fixture is the minimal valid shape for its CSV row type — only the
// required fields. Optional fields that default to null are omitted so the
// tests document what is truly mandatory for a row to be accepted.

const VALID_SLEEP_DAY_ROW = {
  day: '2024-03-15',
  id: 'sleep-day-uuid-1',
  score: '82',
  contributors:
    '{"deep_sleep":85,"efficiency":90,"latency":70,"rem_sleep":80,"restfulness":75,"timing":88,"total_sleep":83}',
  spo2_percentage: '98.5',
  breathing_disturbance_index: '2',
}

const VALID_SLEEP_SESSION_ROW = {
  id: 'sleep-session-uuid-1',
  day: '2024-03-15',
  bedtime_start: '2024-03-14T23:00:00+00:00',
  bedtime_end: '2024-03-15T07:00:00+00:00',
  type: 'long_sleep',
  efficiency: '87',
  latency: '420',
  total_sleep_duration: '27600',
  deep_sleep_duration: '5400',
  rem_sleep_duration: '7200',
  light_sleep_duration: '15000',
  awake_time: '1200',
  time_in_bed: '28800',
  average_heart_rate: '58',
  lowest_heart_rate: '52',
  average_hrv: '45',
  average_breath: '14.5',
  restless_periods: '3',
  sleep_phase_5_min: '1334444433332222444',
  heart_rate: '[58,57,56,55]',
  hrv: '[45,47,43,48]',
  movement_30_sec: '',
}

const VALID_READINESS_ROW = {
  day: '2024-03-15',
  id: 'readiness-uuid-1',
  score: '78',
  temperature_deviation: '0.1',
  temperature_trend_deviation: '-0.05',
  contributors:
    '{"activity_balance":80,"body_temperature":90,"hrv_balance":75,"previous_day_activity":70,"previous_night":85,"recovery_index":72,"resting_heart_rate":88,"sleep_balance":79}',
  stress_high: 'false',
  recovery_high: 'true',
}

const VALID_RESILIENCE_ROW = {
  day: '2024-03-15',
  id: 'resilience-uuid-1',
  level: 'solid',
  contributors: '{"sleep_recovery":72,"daytime_recovery":65,"stress":80}',
}

const VALID_ACTIVITY_ROW = {
  day: '2024-03-15',
  id: 'activity-uuid-1',
  score: '88',
  steps: '9876',
  total_calories: '2450',
  active_calories: '620',
  equivalent_walking_distance: '7100',
  non_wear_time: '3600',
  resting_time: '28800',
  sedentary_time: '14400',
  high_activity_time: '1800',
  medium_activity_time: '3600',
  low_activity_time: '7200',
  inactivity_alerts: '2',
  target_calories: '600',
  target_meters: '8000',
  average_met_minutes: '1.8',
  meters_to_target: '900',
  contributors: '{}',
  class_5_min: '',
  met: '',
}

const VALID_WORKOUT_ROW = {
  id: 'workout-uuid-1',
  day: '2024-03-15',
  start_datetime: '2024-03-15T07:30:00+00:00',
  end_datetime: '2024-03-15T08:15:00+00:00',
  activity: 'running',
  calories: '480',
  distance: '5200',
}

const VALID_MEDITATION_ROW = {
  id: 'meditation-uuid-1',
  day: '2024-03-15',
  start_datetime: '2024-03-15T06:30:00+00:00',
  end_datetime: '2024-03-15T06:50:00+00:00',
}

const VALID_STRESS_ROW = {
  timestamp: '2024-03-15T10:00:00+00:00',
  stress_value: '55',
  recovery_value: '70',
}

// ─── console.warn spy ─────────────────────────────────────────────────────────

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  warnSpy.mockRestore()
})

// ─── parseSleepDays ───────────────────────────────────────────────────────────

describe('parseSleepDays', () => {
  it('maps a valid CSV row to the SleepDay DB shape', () => {
    const result = parseSleepDays([VALID_SLEEP_DAY_ROW])

    expect(result).toHaveLength(1)
    const record = mustGet(result, 0)
    expect(record.day).toBe('2024-03-15')
    expect(record.id).toBe('sleep-day-uuid-1')
    // Zod coerces "82" → 82; the DB interface stores number, not string
    expect(record.score).toBe(82)
    expect(record.spo2Percentage).toBe(98.5)
    expect(record.breathingDisturbanceIndex).toBe(2)
    // contributors object is shaped into typed interface
    expect(record.contributors.deep_sleep).toBe(85)
    expect(record.contributors.efficiency).toBe(90)
    // absent optional fields default to null
    expect(record.optimalBedtime).toBeNull()
    expect(record.status).toBeNull()
  })

  it('skips a row missing the required `day` field and warns', () => {
    const bad = { id: 'x', score: '80', spo2_percentage: '', breathing_disturbance_index: '' }
    const result = parseSleepDays([bad])

    expect(result).toHaveLength(0)
    expect(warnSpy).toHaveBeenCalledOnce()
    expect(mustGetNested(warnSpy.mock.calls, 0, 0)).toMatch(/parseSleepDays.*Skipping row 0/)
  })

  it('returns only valid records when mixed with invalid rows', () => {
    const bad = { score: '80' } // missing day and id
    const result = parseSleepDays([bad, VALID_SLEEP_DAY_ROW, bad])

    // Only the one valid row in the middle should come through
    expect(result).toHaveLength(1)
    expect(mustGet(result, 0).day).toBe('2024-03-15')
    // Two bad rows means two warnings
    expect(warnSpy).toHaveBeenCalledTimes(2)
  })

  it('parses optional optimal_bedtime JSON string into {start, end}', () => {
    const row = {
      ...VALID_SLEEP_DAY_ROW,
      optimal_bedtime: '{"start":"22:30","end":"06:30"}',
    }
    const record = mustGet(parseSleepDays([row]), 0)
    expect(record.optimalBedtime).toEqual({ start: '22:30', end: '06:30' })
  })

  it('parses optional optimal_bedtime hyphen format into {start, end}', () => {
    const row = { ...VALID_SLEEP_DAY_ROW, optimal_bedtime: '22:30-06:30' }
    const record = mustGet(parseSleepDays([row]), 0)
    expect(record.optimalBedtime).toEqual({ start: '22:30', end: '06:30' })
  })

  it('stores null for unparseable optimal_bedtime', () => {
    const row = { ...VALID_SLEEP_DAY_ROW, optimal_bedtime: 'garbage' }
    const record = mustGet(parseSleepDays([row]), 0)
    expect(record.optimalBedtime).toBeNull()
  })

  it('returns empty array for empty input', () => {
    expect(parseSleepDays([])).toEqual([])
  })
})

// ─── parseSleepSessions ───────────────────────────────────────────────────────

describe('parseSleepSessions', () => {
  it('maps a valid CSV row to the SleepSession DB shape', () => {
    const record = mustGet(parseSleepSessions([VALID_SLEEP_SESSION_ROW]), 0)

    expect(record.id).toBe('sleep-session-uuid-1')
    expect(record.day).toBe('2024-03-15')
    // snake_case → camelCase field mapping
    expect(record.bedtimeStart).toBe('2024-03-14T23:00:00+00:00')
    expect(record.bedtimeEnd).toBe('2024-03-15T07:00:00+00:00')
    expect(record.totalSleepDuration).toBe(27600)
    expect(record.averageHeartRate).toBe(58)
    expect(record.averageHrv).toBe(45)
    // sleep_phase_5_min is converted to number[] by the Zod preprocessor
    expect(Array.isArray(record.sleepPhase5Min)).toBe(true)
    expect(mustGet(record.sleepPhase5Min ?? [], 0)).toBe(1)
    // heart_rate JSON array is parsed
    expect(record.heartRate).toEqual([58, 57, 56, 55])
    // empty string movement_30_sec becomes null
    expect(record.movement30Sec).toBeNull()
  })

  it('skips a row missing required bedtime fields and warns', () => {
    const bad = { id: 'x', day: '2024-03-15' } // missing bedtime_start, bedtime_end
    const result = parseSleepSessions([bad])

    expect(result).toHaveLength(0)
    expect(warnSpy).toHaveBeenCalledOnce()
  })

  it('returns only valid records when mixed with invalid rows', () => {
    const bad = { id: 'broken' } // missing mandatory fields
    const result = parseSleepSessions([bad, VALID_SLEEP_SESSION_ROW, bad])

    expect(result).toHaveLength(1)
    expect(mustGet(result, 0).id).toBe('sleep-session-uuid-1')
    expect(warnSpy).toHaveBeenCalledTimes(2)
  })
})

// ─── parseReadinessDays ───────────────────────────────────────────────────────

describe('parseReadinessDays', () => {
  it('maps a valid CSV row to the ReadinessDay DB shape', () => {
    const record = mustGet(parseReadinessDays([VALID_READINESS_ROW]), 0)

    expect(record.day).toBe('2024-03-15')
    expect(record.score).toBe(78)
    expect(record.temperatureDeviation).toBe(0.1)
    // "false" string → false boolean
    expect(record.stressHigh).toBe(false)
    // "true" string → true boolean
    expect(record.recoveryHigh).toBe(true)
    expect(record.contributors.hrv_balance).toBe(75)
    expect(record.daySummary).toBeNull()
  })

  it('skips a row missing required `id` field and warns', () => {
    const bad = { day: '2024-03-15', score: '80' }
    expect(parseReadinessDays([bad])).toHaveLength(0)
    expect(warnSpy).toHaveBeenCalledOnce()
  })

  it('returns only valid records when mixed with invalid rows', () => {
    const bad = { score: '80' }
    const result = parseReadinessDays([VALID_READINESS_ROW, bad])
    expect(result).toHaveLength(1)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })
})

// ─── parseResilienceDays ──────────────────────────────────────────────────────

describe('parseResilienceDays', () => {
  it('maps a valid CSV row and unpacks contributors into top-level fields', () => {
    const record = mustGet(parseResilienceDays([VALID_RESILIENCE_ROW]), 0)

    expect(record.day).toBe('2024-03-15')
    expect(record.level).toBe('solid')
    // contributors JSON is unpacked into dedicated DB fields
    expect(record.sleepRecovery).toBe(72)
    expect(record.daytimeRecovery).toBe(65)
    expect(record.stress).toBe(80)
  })

  it('keeps a row missing `level`, downgraded to null', () => {
    // level is tolerant (.nullable().catch(null)): a blank or unknown tier
    // must not drop the row.
    const bad = { day: '2024-03-15', id: 'x', contributors: '{}' }
    const result = parseResilienceDays([bad])
    expect(result).toHaveLength(1)
    expect(result[0]?.level).toBeNull()
  })

  it('returns only valid records when mixed with invalid rows', () => {
    const bad = { id: 'x' } // no day, no level
    const result = parseResilienceDays([bad, VALID_RESILIENCE_ROW])
    expect(result).toHaveLength(1)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('stores null when contributors JSON is missing resilience sub-keys', () => {
    const row = { ...VALID_RESILIENCE_ROW, contributors: '{}' }
    const record = mustGet(parseResilienceDays([row]), 0)
    expect(record.sleepRecovery).toBeNull()
    expect(record.daytimeRecovery).toBeNull()
    expect(record.stress).toBeNull()
  })
})

// ─── parseActivityDays ────────────────────────────────────────────────────────

describe('parseActivityDays', () => {
  it('maps a valid CSV row to the ActivityDay DB shape', () => {
    const record = mustGet(parseActivityDays([VALID_ACTIVITY_ROW]), 0)

    expect(record.day).toBe('2024-03-15')
    expect(record.steps).toBe(9876)
    expect(record.totalCalories).toBe(2450)
    expect(record.equivalentWalkingDistance).toBe(7100)
    expect(record.averageMetMinutes).toBe(1.8)
    expect(record.class5Min).toBeNull()
    expect(record.met).toBeNull()
  })

  it('skips an invalid row and warns', () => {
    const bad = { steps: '1000' } // missing day and id
    expect(parseActivityDays([bad])).toHaveLength(0)
    expect(warnSpy).toHaveBeenCalledOnce()
  })

  it('returns only valid records when mixed with invalid rows', () => {
    const bad = {}
    const result = parseActivityDays([bad, VALID_ACTIVITY_ROW, bad])
    expect(result).toHaveLength(1)
    expect(warnSpy).toHaveBeenCalledTimes(2)
  })
})

// ─── parseWorkouts ────────────────────────────────────────────────────────────

describe('parseWorkouts', () => {
  it('maps a valid CSV row to the Workout DB shape', () => {
    const record = mustGet(parseWorkouts([VALID_WORKOUT_ROW]), 0)

    expect(record.id).toBe('workout-uuid-1')
    expect(record.startDatetime).toBe('2024-03-15T07:30:00+00:00')
    expect(record.activity).toBe('running')
    expect(record.calories).toBe(480)
    expect(record.distance).toBe(5200)
    expect(record.intensity).toBeNull()
    expect(record.label).toBeNull()
    expect(record.source).toBeNull()
  })

  it('skips a row missing required `activity` field and warns', () => {
    const bad = { id: 'x', day: '2024-03-15', start_datetime: 'ts', end_datetime: 'ts' }
    expect(parseWorkouts([bad])).toHaveLength(0)
    expect(warnSpy).toHaveBeenCalledOnce()
  })

  it('returns only valid records when mixed with invalid rows', () => {
    const bad = { id: 'x' }
    const result = parseWorkouts([bad, VALID_WORKOUT_ROW])
    expect(result).toHaveLength(1)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })
})

// ─── parseMeditations ─────────────────────────────────────────────────────────

describe('parseMeditations', () => {
  it('maps a valid CSV row to the Meditation DB shape', () => {
    const record = mustGet(parseMeditations([VALID_MEDITATION_ROW]), 0)

    expect(record.id).toBe('meditation-uuid-1')
    expect(record.day).toBe('2024-03-15')
    expect(record.startDatetime).toBe('2024-03-15T06:30:00+00:00')
    expect(record.type).toBeNull()
    expect(record.mood).toBeNull()
  })

  it('skips a row missing required `id` field and warns', () => {
    const bad = { day: '2024-03-15', start_datetime: 'ts', end_datetime: 'ts' }
    expect(parseMeditations([bad])).toHaveLength(0)
    expect(warnSpy).toHaveBeenCalledOnce()
  })

  it('returns only valid records when mixed with invalid rows', () => {
    const bad = {}
    const result = parseMeditations([bad, VALID_MEDITATION_ROW, bad])
    expect(result).toHaveLength(1)
    expect(warnSpy).toHaveBeenCalledTimes(2)
  })

  it('maps optional type and mood when present', () => {
    const row = { ...VALID_MEDITATION_ROW, type: 'body', mood: 'good' }
    const record = mustGet(parseMeditations([row]), 0)
    expect(record.type).toBe('body')
    expect(record.mood).toBe('good')
  })
})

// ─── parseStressPoints ────────────────────────────────────────────────────────

describe('parseStressPoints', () => {
  it('maps a valid CSV row to the StressPoint DB shape', () => {
    const record = mustGet(parseStressPoints([VALID_STRESS_ROW]), 0)

    expect(record.timestamp).toBe('2024-03-15T10:00:00+00:00')
    // day is derived from the timestamp, not a separate CSV column
    expect(record.day).toBe('2024-03-15')
    expect(record.stressValue).toBe(55)
    expect(record.recoveryValue).toBe(70)
    // id is absent — Dexie assigns it on insert
    expect(record.id).toBeUndefined()
  })

  it('skips a row missing required `timestamp` field and warns', () => {
    const bad = { stress_value: '50', recovery_value: '60' }
    expect(parseStressPoints([bad])).toHaveLength(0)
    expect(warnSpy).toHaveBeenCalledOnce()
  })

  it('returns only valid records when mixed with invalid rows', () => {
    const bad = { stress_value: '50' } // missing timestamp
    const result = parseStressPoints([bad, VALID_STRESS_ROW, bad])
    expect(result).toHaveLength(1)
    expect(mustGet(result, 0).day).toBe('2024-03-15')
    expect(warnSpy).toHaveBeenCalledTimes(2)
  })

  it('stores null for empty stress_value and recovery_value cells', () => {
    const row = { ...VALID_STRESS_ROW, stress_value: '', recovery_value: '' }
    const record = mustGet(parseStressPoints([row]), 0)
    expect(record.stressValue).toBeNull()
    expect(record.recoveryValue).toBeNull()
  })
})
