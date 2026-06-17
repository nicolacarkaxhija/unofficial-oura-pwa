// ─── CSV Row Factories ────────────────────────────────────────────────────────
//
// Each factory returns a plain `Record<string, string>` — exactly what Papa
// Parse produces from a real Oura CSV export before any Zod coercion. Every
// value is a string because CSV has no native types.
//
// Why plain objects rather than typed Zod outputs?
//   The test subject is the parse pipeline itself. Giving it pre-coerced data
//   would test nothing. These factories produce the raw string records that
//   land on the parsers' doorstep after `Papa.parse(...).data` — the same
//   shape the import worker will hand to `parseSleepDays()` et al.
//
// Overrides let individual tests inject edge-case values (empty strings for
// null coercion, invalid JSON for array fields, etc.) without duplicating the
// full default record in each test file.

export type RawRecord = Record<string, string>

// Aliases so test files can import named types and get autocomplete hinting
// on the field names that matter (they're still plain string maps at runtime).
export type RawSleepDayRow = RawRecord
export type RawSleepSessionRow = RawRecord
export type RawReadinessDayRow = RawRecord
export type RawResilienceDayRow = RawRecord
export type RawActivityDayRow = RawRecord
export type RawWorkoutRow = RawRecord
export type RawMeditationRow = RawRecord
export type RawStressRow = RawRecord

// ─── Sleep Day ────────────────────────────────────────────────────────────────

export function makeSleepDayRow(overrides?: Partial<RawSleepDayRow>): RawSleepDayRow {
  return {
    day: '2024-01-15',
    id: 'sleep-day-abc123',
    score: '78',
    // contributors is a JSON object embedded in a single CSV cell — Oura's
    // export format for contributor breakdowns.
    contributors: JSON.stringify({
      deep_sleep: 7,
      efficiency: 8,
      latency: 9,
      rem_sleep: 6,
      restfulness: 7,
      timing: 8,
      total_sleep: 8,
    }),
    // optimal_bedtime varies by export version; keep both formats parseable.
    optimal_bedtime: '{"start":"22:30","end":"06:30"}',
    recommendation: '',
    status: 'normal',
    spo2_percentage: '96.5',
    breathing_disturbance_index: '3',
    ...overrides,
  }
}

// ─── Sleep Session ────────────────────────────────────────────────────────────

export function makeSleepSessionRow(overrides?: Partial<RawSleepSessionRow>): RawSleepSessionRow {
  return {
    id: 'sleep-session-def456',
    day: '2024-01-15',
    bedtime_start: '2024-01-14T22:45:00+00:00',
    bedtime_end: '2024-01-15T06:30:00+00:00',
    type: 'long_sleep',
    efficiency: '87',
    latency: '420',
    total_sleep_duration: '26280',
    deep_sleep_duration: '5400',
    rem_sleep_duration: '6300',
    light_sleep_duration: '14580',
    awake_time: '1620',
    time_in_bed: '27900',
    average_heart_rate: '54',
    lowest_heart_rate: '48',
    average_hrv: '31',
    average_breath: '14.5',
    restless_periods: '6',
    // sleep_phase_5_min is a string of digits, one per 5-min slot:
    //   1=Awake, 2=REM, 3=Light, 4=Deep (Oura encoding)
    sleep_phase_5_min: '1333444432222333333332211',
    // heart_rate and hrv are JSON arrays — one BPM/RMSSD value per 5-min slot.
    heart_rate: '[52,51,53,54,52,50,49,51,53,55,54,52,51,50,49,48,49,50,52,54,55,54,52,51]',
    hrv: '[28,30,27,32,29,33,35,31,28,26,27,29,31,33,34,35,33,31,29,28,27,29,30,31]',
    // movement_30_sec is 30-second resolution, so roughly double the length.
    movement_30_sec:
      '[0,0,1,0,0,2,0,0,1,0,0,0,0,1,0,0,2,1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]',
    ...overrides,
  }
}

// ─── Readiness Day ────────────────────────────────────────────────────────────

export function makeReadinessDayRow(overrides?: Partial<RawReadinessDayRow>): RawReadinessDayRow {
  return {
    day: '2024-01-15',
    id: 'readiness-day-ghi789',
    score: '74',
    temperature_deviation: '0.1',
    temperature_trend_deviation: '-0.05',
    contributors: JSON.stringify({
      activity_balance: 7,
      body_temperature: 9,
      hrv_balance: 6,
      previous_day_activity: 8,
      previous_night: 7,
      recovery_index: 6,
      resting_heart_rate: 8,
      sleep_balance: 7,
    }),
    // nullableBool fields: Oura uses "true"/"false" strings.
    stress_high: 'false',
    recovery_high: 'false',
    day_summary: 'Pay attention to your sleep tonight to recover properly.',
    ...overrides,
  }
}

// ─── Resilience Day ───────────────────────────────────────────────────────────

export function makeResilienceDayRow(overrides?: Partial<RawResilienceDayRow>): RawResilienceDayRow {
  return {
    day: '2024-01-15',
    id: 'resilience-day-jkl012',
    level: 'solid',
    // sleep_recovery, daytime_recovery, and stress live inside contributors —
    // the resilience CSV has no dedicated columns for them. The parser unpacks
    // them from this JSON blob into top-level DB fields.
    contributors: JSON.stringify({
      sleep_recovery: 0.72,
      daytime_recovery: 0.65,
      stress: 0.41,
    }),
    ...overrides,
  }
}

// ─── Activity Day ─────────────────────────────────────────────────────────────

export function makeActivityDayRow(overrides?: Partial<RawActivityDayRow>): RawActivityDayRow {
  return {
    day: '2024-01-15',
    id: 'activity-day-mno345',
    score: '82',
    steps: '8432',
    total_calories: '2187',
    active_calories: '487',
    equivalent_walking_distance: '6890',
    non_wear_time: '0',
    resting_time: '21600',
    sedentary_time: '18000',
    high_activity_time: '900',
    medium_activity_time: '2700',
    low_activity_time: '5400',
    inactivity_alerts: '2',
    target_calories: '500',
    target_meters: '7000',
    average_met_minutes: '1.4',
    meters_to_target: '110',
    contributors: JSON.stringify({
      meet_daily_targets: 8,
      move_every_hour: 9,
      recovery_time: 7,
      stay_active: 8,
      training_frequency: 7,
      training_volume: 8,
    }),
    // class_5_min and met are JSON arrays, one value per 5-min slot across the day.
    class_5_min: '[4,4,4,3,3,3,4,4,5,5,4,4,3,3,4,4,4,3,3,3]',
    met: '[1.0,1.0,1.0,1.2,1.2,1.3,1.0,1.0,3.5,3.8,1.0,1.0,1.2,1.2,1.0,1.0,1.0,1.2,1.2,1.0]',
    ...overrides,
  }
}

// ─── Workout ──────────────────────────────────────────────────────────────────

export function makeWorkoutRow(overrides?: Partial<RawWorkoutRow>): RawWorkoutRow {
  return {
    id: 'workout-pqr678',
    day: '2024-01-15',
    start_datetime: '2024-01-15T07:30:00+00:00',
    end_datetime: '2024-01-15T08:15:00+00:00',
    activity: 'running',
    calories: '412',
    distance: '6200',
    intensity: 'moderate',
    label: '',
    source: 'manual',
    ...overrides,
  }
}

// ─── Meditation ───────────────────────────────────────────────────────────────

export function makeMeditationRow(overrides?: Partial<RawMeditationRow>): RawMeditationRow {
  return {
    id: 'meditation-stu901',
    day: '2024-01-15',
    start_datetime: '2024-01-15T19:00:00+00:00',
    end_datetime: '2024-01-15T19:20:00+00:00',
    type: 'meditation',
    mood: '',
    ...overrides,
  }
}

// ─── Stress ───────────────────────────────────────────────────────────────────

export function makeStressRow(overrides?: Partial<RawStressRow>): RawStressRow {
  return {
    // Stress CSVs have no separate date column — the parser derives `day` from
    // the timestamp by slicing the first 10 characters.
    timestamp: '2024-01-15T14:30:00+00:00',
    stress_value: '45',
    recovery_value: '62',
    ...overrides,
  }
}
