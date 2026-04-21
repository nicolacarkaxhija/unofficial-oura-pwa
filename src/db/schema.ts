// ─── Database Schema ──────────────────────────────────────────────────────────
//
// These TypeScript interfaces are the single source of truth for what is stored
// in IndexedDB. They mirror the Oura CSV export fields confirmed from
// EIrno/Cracked-Oura's open-source parsers (sleep.py, readiness.py, activity.py).
//
// Naming convention: camelCase here, snake_case in the raw CSVs.
// The parsers in src/connectors/oura/parsers/ handle the transformation.
//
// All numeric fields are `number | null` rather than `number | undefined`.
// Dexie stores `undefined` as absent, making queries unreliable. `null`
// explicitly signals "Oura provided this field but it had no value".

// ─── Sleep ────────────────────────────────────────────────────────────────────

export interface SleepContributors {
  deep_sleep: number | null
  efficiency: number | null
  latency: number | null
  rem_sleep: number | null
  restfulness: number | null
  timing: number | null
  total_sleep: number | null
}

export interface SleepDay {
  day: string // PK: "YYYY-MM-DD" — Oura's canonical date key for daily records
  id: string
  score: number | null
  contributors: SleepContributors
  optimalBedtime: { start: string; end: string } | null
  status: string | null
  spo2Percentage: number | null
  breathingDisturbanceIndex: number | null
}

export interface SleepSession {
  id: string // PK: Oura session UUID
  day: string // FK index → join with SleepDay for the nightly summary
  bedtimeStart: string // ISO 8601 datetime
  bedtimeEnd: string
  type: string // 'long_sleep' | 'late_nap' | 'rest' | ...
  efficiency: number | null // 0–100 %
  latency: number | null // seconds to fall asleep
  totalSleepDuration: number | null // seconds
  deepSleepDuration: number | null
  remSleepDuration: number | null
  lightSleepDuration: number | null
  awakeTime: number | null
  timeInBed: number | null
  averageHeartRate: number | null
  lowestHeartRate: number | null
  averageHrv: number | null
  averageBreath: number | null
  restlessPeriods: number | null
  // Time series — 5-minute resolution arrays.
  // These are the heart of the hypnogram and HR/HRV charts.
  // Encoded as number arrays so they can be passed directly to uPlot without
  // JSON.parse() on every render.
  sleepPhase5Min: number[] | null // 1=Awake, 2=REM, 3=Light, 4=Deep (per Oura encoding)
  heartRate: number[] | null // BPM per 5-min interval
  hrv: number[] | null // RMSSD ms per 5-min interval
  movement30Sec: number[] | null // 30-second resolution
}

// ─── Readiness ────────────────────────────────────────────────────────────────

export interface ReadinessContributors {
  activity_balance: number | null
  body_temperature: number | null
  hrv_balance: number | null
  previous_day_activity: number | null
  previous_night: number | null
  recovery_index: number | null
  resting_heart_rate: number | null
  sleep_balance: number | null
}

export interface ReadinessDay {
  day: string // PK
  id: string
  score: number | null
  temperatureDeviation: number | null
  temperatureTrendDeviation: number | null
  stressHigh: boolean | null
  recoveryHigh: boolean | null
  daySummary: string | null
  contributors: ReadinessContributors
}

export interface ResilienceDay {
  day: string // PK
  id: string
  level: 'exceptional' | 'strong' | 'solid' | 'adequate' | 'weak' | null
  sleepRecovery: number | null
  daytimeRecovery: number | null
  stress: number | null
}

// ─── Activity ─────────────────────────────────────────────────────────────────

export interface ActivityDay {
  day: string // PK
  id: string
  score: number | null
  steps: number | null
  totalCalories: number | null
  activeCalories: number | null
  equivalentWalkingDistance: number | null // metres
  nonWearTime: number | null // seconds
  restingTime: number | null
  sedentaryTime: number | null
  highActivityTime: number | null
  mediumActivityTime: number | null
  lowActivityTime: number | null
  inactivityAlerts: number | null
  targetCalories: number | null
  targetMeters: number | null
  averageMetMinutes: number | null
  metersToTarget: number | null
  contributors: Record<string, number | null>
  // Time series — 5-minute resolution
  class5Min: number[] | null // activity class per 5-min interval
  met: number[] | null // metabolic equivalent per 5-min interval
}

export interface Workout {
  id: string // PK
  day: string // FK index
  startDatetime: string
  endDatetime: string
  activity: string
  calories: number | null
  distance: number | null
  intensity: string | null
  label: string | null
  source: string | null
}

export interface Meditation {
  id: string // PK
  day: string // FK index
  startDatetime: string
  endDatetime: string
  type: string | null
  mood: string | null
}

export interface StressPoint {
  id?: number // auto-increment PK
  day: string // derived from timestamp; indexed for range queries by day
  timestamp: string // ISO 8601
  stressValue: number | null
  recoveryValue: number | null
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

// The meta table stores singleton values keyed by a string.
// Current keys:
//   'lastImport'  → ISO 8601 datetime string
//   'zipBlob'     → Blob (the original Oura export ZIP, kept for Safari eviction recovery)
//   'importStats' → ImportStats object

export interface MetaEntry {
  key: string
  value: unknown
}

export interface ImportStats {
  sleepNights: number
  readinessDays: number
  activityDays: number
  workouts: number
  meditations: number
  stressPoints: number
  importedAt: string // ISO 8601
}
