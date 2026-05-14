import {
  SleepDayRowSchema,
  SleepSessionRowSchema,
  ReadinessDayRowSchema,
  ResilienceDayRowSchema,
  ActivityDayRowSchema,
  WorkoutRowSchema,
  MeditationRowSchema,
  StressRowSchema,
} from '../schema'
import type {
  SleepDay,
  SleepSession,
  ReadinessDay,
  ResilienceDay,
  ActivityDay,
  Workout,
  Meditation,
  StressPoint,
  SleepContributors,
  ReadinessContributors,
} from '@/db/schema'

// ─── Parser strategy: skip-and-warn, never throw ──────────────────────────────
//
// Why skip bad rows instead of aborting the entire import?
//   1. Partial data is far more useful than no data. A user importing 3 years
//      of sleep history shouldn't lose everything because one row has a corrupt
//      HRV value from a firmware bug.
//   2. Oura has shipped at least 3 distinct CSV formats across app versions.
//      Columns appear, disappear, and are renamed. Permissive parsing lets us
//      accept exports from older ring firmware without crashing.
//   3. The Zod schemas are the validation gate — if a row passes `.safeParse`
//      it is safe to store. If it doesn't, logging the index lets developers
//      identify systematic issues without interrupting the user's import flow.
//
// Callers (the import orchestrator) aggregate skipped-row counts for the
// ImportStats summary so users can see "3 of 1,095 rows skipped" in the UI.

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse the `optimal_bedtime` CSV string into a structured object.
 *
 * Oura's API returns this as a JSON object {"start": "...", "end": "..."},
 * but the CSV export serialises it differently depending on the app version:
 *   - JSON string: '{"start":"22:30","end":"06:30"}'
 *   - Hyphen-separated: "22:30-06:30"
 *   - Empty string when not set
 *
 * We try JSON first (most structured), then the hyphen fallback.
 * Anything unrecognisable is stored as null — the UI handles null gracefully.
 */
function parseOptimalBedtime(
  raw: string | null | undefined,
): { start: string; end: string } | null {
  if (!raw) return null
  // Attempt 1: JSON object embedded in the cell (newer CSV exports)
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'start' in parsed &&
      'end' in parsed &&
      typeof (parsed as Record<string, unknown>).start === 'string' &&
      typeof (parsed as Record<string, unknown>).end === 'string'
    ) {
      const rec = parsed as Record<string, string>
      // noUncheckedIndexedAccess makes `rec[key]` return `string | undefined`,
      // but the typeof guards above confirm both values are strings. We extract
      // to local variables so the nullish guard narrows them without ! assertion.
      const start = rec['start']
      const end = rec['end']
      if (start !== undefined && end !== undefined) {
        return { start, end }
      }
    }
  } catch {
    // Not JSON — fall through to hyphen split
  }
  // Attempt 2: "HH:MM-HH:MM" format (older CSV exports)
  const parts = raw.split('-')
  // noUncheckedIndexedAccess: extract indices to variables so TS narrows them
  // after the truthiness check inside the if-body.
  const partStart = parts[0]
  const partEnd = parts[1]
  if (parts.length === 2 && partStart?.trim() && partEnd?.trim()) {
    return { start: partStart.trim(), end: partEnd.trim() }
  }
  return null
}

/**
 * Extract the date portion ("YYYY-MM-DD") from an ISO 8601 datetime string.
 *
 * Used to derive `StressPoint.day` from the raw `timestamp` column — Oura
 * stress CSVs have no separate date column, only a full timestamp.
 */
function dateFromTimestamp(timestamp: string): string {
  // ISO strings are always date-first; slicing is safer than Date parsing
  // because it avoids timezone shifts that could roll the date back by one day.
  return timestamp.slice(0, 10)
}

// ─── parseSleepDays ───────────────────────────────────────────────────────────

export function parseSleepDays(rows: unknown[]): SleepDay[] {
  const results: SleepDay[] = []

  for (let i = 0; i < rows.length; i++) {
    const result = SleepDayRowSchema.safeParse(rows[i])
    if (!result.success) {
      console.warn(`[parseSleepDays] Skipping row ${String(i)}: ${result.error.message}`)
      continue
    }
    const r = result.data

    // contributors arrives as a generic Record<string, number|null>; we shape it
    // into the typed SleepContributors interface so chart components get autocomplete.
    const contributors: SleepContributors = {
      deep_sleep: r.contributors?.['deep_sleep'] ?? null,
      efficiency: r.contributors?.['efficiency'] ?? null,
      latency: r.contributors?.['latency'] ?? null,
      rem_sleep: r.contributors?.['rem_sleep'] ?? null,
      restfulness: r.contributors?.['restfulness'] ?? null,
      timing: r.contributors?.['timing'] ?? null,
      total_sleep: r.contributors?.['total_sleep'] ?? null,
    }

    results.push({
      day: r.day,
      id: r.id,
      score: r.score,
      contributors,
      optimalBedtime: parseOptimalBedtime(r.optimal_bedtime),
      status: r.status ?? null,
      spo2Percentage: r.spo2_percentage,
      breathingDisturbanceIndex: r.breathing_disturbance_index,
    })
  }

  return results
}

// ─── parseSleepSessions ───────────────────────────────────────────────────────

export function parseSleepSessions(rows: unknown[]): SleepSession[] {
  const results: SleepSession[] = []

  for (let i = 0; i < rows.length; i++) {
    const result = SleepSessionRowSchema.safeParse(rows[i])
    if (!result.success) {
      console.warn(`[parseSleepSessions] Skipping row ${String(i)}: ${result.error.message}`)
      continue
    }
    const r = result.data

    results.push({
      id: r.id,
      day: r.day,
      // CSV columns use snake_case; DB interface uses camelCase throughout.
      // The mapping is explicit here so a column rename in the CSV is caught
      // immediately as a type error rather than silently storing undefined.
      bedtimeStart: r.bedtime_start,
      bedtimeEnd: r.bedtime_end,
      type: r.type,
      efficiency: r.efficiency,
      latency: r.latency,
      totalSleepDuration: r.total_sleep_duration,
      deepSleepDuration: r.deep_sleep_duration,
      remSleepDuration: r.rem_sleep_duration,
      lightSleepDuration: r.light_sleep_duration,
      awakeTime: r.awake_time,
      timeInBed: r.time_in_bed,
      averageHeartRate: r.average_heart_rate,
      lowestHeartRate: r.lowest_heart_rate,
      averageHrv: r.average_hrv,
      averageBreath: r.average_breath,
      restlessPeriods: r.restless_periods,
      sleepPhase5Min: r.sleep_phase_5_min,
      heartRate: r.heart_rate,
      hrv: r.hrv,
      movement30Sec: r.movement_30_sec,
    })
  }

  return results
}

// ─── parseReadinessDays ───────────────────────────────────────────────────────

export function parseReadinessDays(rows: unknown[]): ReadinessDay[] {
  const results: ReadinessDay[] = []

  for (let i = 0; i < rows.length; i++) {
    const result = ReadinessDayRowSchema.safeParse(rows[i])
    if (!result.success) {
      console.warn(`[parseReadinessDays] Skipping row ${String(i)}: ${result.error.message}`)
      continue
    }
    const r = result.data

    const contributors: ReadinessContributors = {
      activity_balance: r.contributors?.['activity_balance'] ?? null,
      body_temperature: r.contributors?.['body_temperature'] ?? null,
      hrv_balance: r.contributors?.['hrv_balance'] ?? null,
      previous_day_activity: r.contributors?.['previous_day_activity'] ?? null,
      previous_night: r.contributors?.['previous_night'] ?? null,
      recovery_index: r.contributors?.['recovery_index'] ?? null,
      resting_heart_rate: r.contributors?.['resting_heart_rate'] ?? null,
      sleep_balance: r.contributors?.['sleep_balance'] ?? null,
    }

    results.push({
      day: r.day,
      id: r.id,
      score: r.score,
      temperatureDeviation: r.temperature_deviation,
      temperatureTrendDeviation: r.temperature_trend_deviation,
      stressHigh: r.stress_high,
      recoveryHigh: r.recovery_high,
      daySummary: r.day_summary ?? null,
      contributors,
    })
  }

  return results
}

// ─── parseResilienceDays ──────────────────────────────────────────────────────

export function parseResilienceDays(rows: unknown[]): ResilienceDay[] {
  const results: ResilienceDay[] = []

  for (let i = 0; i < rows.length; i++) {
    const result = ResilienceDayRowSchema.safeParse(rows[i])
    if (!result.success) {
      console.warn(`[parseResilienceDays] Skipping row ${String(i)}: ${result.error.message}`)
      continue
    }
    const r = result.data

    // The resilience CSV has no dedicated columns for sleep_recovery,
    // daytime_recovery, and stress. Oura embeds them inside the `contributors`
    // JSON object. We unpack them here so the DB schema can index/query them
    // individually without parsing JSON on every read.
    results.push({
      day: r.day,
      id: r.id,
      level: r.level,
      sleepRecovery: r.contributors?.['sleep_recovery'] ?? null,
      daytimeRecovery: r.contributors?.['daytime_recovery'] ?? null,
      stress: r.contributors?.['stress'] ?? null,
    })
  }

  return results
}

// ─── parseActivityDays ────────────────────────────────────────────────────────

export function parseActivityDays(rows: unknown[]): ActivityDay[] {
  const results: ActivityDay[] = []

  for (let i = 0; i < rows.length; i++) {
    const result = ActivityDayRowSchema.safeParse(rows[i])
    if (!result.success) {
      console.warn(`[parseActivityDays] Skipping row ${String(i)}: ${result.error.message}`)
      continue
    }
    const r = result.data

    results.push({
      day: r.day,
      id: r.id,
      score: r.score,
      steps: r.steps,
      totalCalories: r.total_calories,
      activeCalories: r.active_calories,
      equivalentWalkingDistance: r.equivalent_walking_distance,
      nonWearTime: r.non_wear_time,
      restingTime: r.resting_time,
      sedentaryTime: r.sedentary_time,
      highActivityTime: r.high_activity_time,
      mediumActivityTime: r.medium_activity_time,
      lowActivityTime: r.low_activity_time,
      inactivityAlerts: r.inactivity_alerts,
      targetCalories: r.target_calories,
      targetMeters: r.target_meters,
      averageMetMinutes: r.average_met_minutes,
      metersToTarget: r.meters_to_target,
      // contributors is kept as a generic Record here — ActivityDay's DB
      // interface types it as Record<string, number|null>, which matches
      // exactly what nullableJsonObject produces.
      contributors: r.contributors ?? {},
      class5Min: r.class_5_min,
      met: r.met,
    })
  }

  return results
}

// ─── parseWorkouts ────────────────────────────────────────────────────────────

export function parseWorkouts(rows: unknown[]): Workout[] {
  const results: Workout[] = []

  for (let i = 0; i < rows.length; i++) {
    const result = WorkoutRowSchema.safeParse(rows[i])
    if (!result.success) {
      console.warn(`[parseWorkouts] Skipping row ${String(i)}: ${result.error.message}`)
      continue
    }
    const r = result.data

    results.push({
      id: r.id,
      day: r.day,
      startDatetime: r.start_datetime,
      endDatetime: r.end_datetime,
      activity: r.activity,
      calories: r.calories,
      distance: r.distance,
      intensity: r.intensity ?? null,
      label: r.label ?? null,
      source: r.source ?? null,
    })
  }

  return results
}

// ─── parseMeditations ─────────────────────────────────────────────────────────

export function parseMeditations(rows: unknown[]): Meditation[] {
  const results: Meditation[] = []

  for (let i = 0; i < rows.length; i++) {
    const result = MeditationRowSchema.safeParse(rows[i])
    if (!result.success) {
      console.warn(`[parseMeditations] Skipping row ${String(i)}: ${result.error.message}`)
      continue
    }
    const r = result.data

    results.push({
      id: r.id,
      day: r.day,
      startDatetime: r.start_datetime,
      endDatetime: r.end_datetime,
      type: r.type ?? null,
      mood: r.mood ?? null,
    })
  }

  return results
}

// ─── parseStressPoints ────────────────────────────────────────────────────────

export function parseStressPoints(rows: unknown[]): StressPoint[] {
  const results: StressPoint[] = []

  for (let i = 0; i < rows.length; i++) {
    const result = StressRowSchema.safeParse(rows[i])
    if (!result.success) {
      console.warn(`[parseStressPoints] Skipping row ${String(i)}: ${result.error.message}`)
      continue
    }
    const r = result.data

    results.push({
      // `id` is omitted — Dexie auto-increments it on insert.
      // Stress CSVs can have thousands of rows; letting Dexie manage the PK
      // avoids collision issues when re-importing the same export.
      day: dateFromTimestamp(r.timestamp),
      timestamp: r.timestamp,
      stressValue: r.stress_value,
      recoveryValue: r.recovery_value,
    })
  }

  return results
}
