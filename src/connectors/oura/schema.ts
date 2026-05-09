import { z } from 'zod'

// ─── Oura CSV Row Schemas ─────────────────────────────────────────────────────
//
// These Zod schemas define the shape of a SINGLE ROW from each Oura CSV file.
// Column names are snake_case to match the Oura export exactly.
// Source: EIrno/Cracked-Oura parsers (sleep.py, readiness.py, activity.py)
//
// Why Zod at the CSV row level (not just TypeScript interfaces):
//   CSV parsing produces `Record<string, string>` — every cell is a string.
//   Zod validates AND transforms: `z.coerce.number()` parses "82" → 82,
//   `z.string().nullable()` accepts "" → null. This prevents garbage strings
//   from reaching IndexedDB or the chart components.
//
// Design principle: parse permissively, store precisely.
//   - Unknown columns are stripped (`.strip()` behaviour from z.object())
//   - Missing optional columns default to null, not undefined
//   - Arrays encoded as JSON strings (e.g. heart_rate) are parsed here

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Oura stores many numeric fields as empty strings when missing.
// `nullableNumber` coerces "82" → 82 and "" or missing → null.
const nullableNumber = z.preprocess(
  (v) => (v === '' || v == null ? null : v),
  z.coerce.number().nullable(),
)

// Oura encodes boolean-ish fields as "true"/"false" strings or "1"/"0".
const nullableBool = z.preprocess((v) => {
  if (v === '' || v == null) return null
  if (v === 'true' || v === '1') return true
  if (v === 'false' || v === '0') return false
  return null
}, z.boolean().nullable())

// JSON arrays embedded in CSV cells (e.g. the heart_rate column is "[72,74,...]").
// Returns null when the cell is empty or unparseable — never throws.
const nullableNumberArray = z.preprocess((v) => {
  if (v === '' || v == null) return null
  // After the null/empty guard, `v` is a non-empty CSV cell — always a string
  // at runtime. Casting to string avoids no-base-to-string (String(unknown) can
  // produce "[object Object]" for non-primitive values).
  const raw = v as string
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}, z.array(z.number()).nullable())

// sleep_phase_5_min is a string of digits, e.g. "1333444432..." (one per 5-min slot).
// We convert it to number[] so uPlot can consume it without re-parsing on every render.
const sleepPhaseString = z.preprocess((v) => {
  if (v === '' || v == null) return null
  // Cast to string — this preprocessor is only called with CSV string cells.
  return (v as string)
    .split('')
    .map(Number)
    .filter((n) => !isNaN(n))
}, z.array(z.number()).nullable())

// Contributors fields come as JSON objects embedded in a CSV cell.
const nullableJsonObject = z.preprocess((v) => {
  if (v === '' || v == null) return null
  // Cast to string — this preprocessor is only called with CSV string cells.
  try {
    return JSON.parse(v as string) as unknown
  } catch {
    return null
  }
}, z.record(z.string(), z.number().nullable()).nullable())

// ─── Sleep ────────────────────────────────────────────────────────────────────

export const SleepDayRowSchema = z.object({
  day: z.string(),
  id: z.string(),
  score: nullableNumber,
  contributors: nullableJsonObject,
  optimal_bedtime: z.string().nullable().optional(),
  recommendation: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  spo2_percentage: nullableNumber,
  breathing_disturbance_index: nullableNumber,
})

export const SleepSessionRowSchema = z.object({
  id: z.string(),
  day: z.string(),
  bedtime_start: z.string(),
  bedtime_end: z.string(),
  type: z.string().default('long_sleep'),
  efficiency: nullableNumber,
  latency: nullableNumber,
  total_sleep_duration: nullableNumber,
  deep_sleep_duration: nullableNumber,
  rem_sleep_duration: nullableNumber,
  light_sleep_duration: nullableNumber,
  awake_time: nullableNumber,
  time_in_bed: nullableNumber,
  average_heart_rate: nullableNumber,
  lowest_heart_rate: nullableNumber,
  average_hrv: nullableNumber,
  average_breath: nullableNumber,
  restless_periods: nullableNumber,
  sleep_phase_5_min: sleepPhaseString,
  heart_rate: nullableNumberArray,
  hrv: nullableNumberArray,
  movement_30_sec: nullableNumberArray,
})

export type SleepDayRow = z.infer<typeof SleepDayRowSchema>
export type SleepSessionRow = z.infer<typeof SleepSessionRowSchema>

// ─── Readiness ────────────────────────────────────────────────────────────────

export const ReadinessDayRowSchema = z.object({
  day: z.string(),
  id: z.string(),
  score: nullableNumber,
  temperature_deviation: nullableNumber,
  temperature_trend_deviation: nullableNumber,
  contributors: nullableJsonObject,
  stress_high: nullableBool,
  recovery_high: nullableBool,
  day_summary: z.string().nullable().optional(),
})

export const ResilienceDayRowSchema = z.object({
  day: z.string(),
  id: z.string(),
  level: z.enum(['exceptional', 'strong', 'solid', 'adequate', 'weak']),
  contributors: nullableJsonObject,
})

export type ReadinessDayRow = z.infer<typeof ReadinessDayRowSchema>
export type ResilienceDayRow = z.infer<typeof ResilienceDayRowSchema>

// ─── Activity ─────────────────────────────────────────────────────────────────

export const ActivityDayRowSchema = z.object({
  day: z.string(),
  id: z.string(),
  score: nullableNumber,
  steps: nullableNumber,
  total_calories: nullableNumber,
  active_calories: nullableNumber,
  equivalent_walking_distance: nullableNumber,
  non_wear_time: nullableNumber,
  resting_time: nullableNumber,
  sedentary_time: nullableNumber,
  high_activity_time: nullableNumber,
  medium_activity_time: nullableNumber,
  low_activity_time: nullableNumber,
  inactivity_alerts: nullableNumber,
  target_calories: nullableNumber,
  target_meters: nullableNumber,
  average_met_minutes: nullableNumber,
  meters_to_target: nullableNumber,
  contributors: nullableJsonObject,
  class_5_min: nullableNumberArray,
  met: nullableNumberArray,
})

export const WorkoutRowSchema = z.object({
  id: z.string(),
  day: z.string(),
  start_datetime: z.string(),
  end_datetime: z.string(),
  activity: z.string(),
  calories: nullableNumber,
  distance: nullableNumber,
  intensity: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
})

export const MeditationRowSchema = z.object({
  id: z.string(),
  day: z.string(),
  start_datetime: z.string(),
  end_datetime: z.string(),
  type: z.string().nullable().optional(),
  mood: z.string().nullable().optional(),
})

export const StressRowSchema = z.object({
  timestamp: z.string(),
  stress_value: nullableNumber,
  recovery_value: nullableNumber,
})

export type ActivityDayRow = z.infer<typeof ActivityDayRowSchema>
export type WorkoutRow = z.infer<typeof WorkoutRowSchema>
export type MeditationRow = z.infer<typeof MeditationRowSchema>
export type StressRow = z.infer<typeof StressRowSchema>
