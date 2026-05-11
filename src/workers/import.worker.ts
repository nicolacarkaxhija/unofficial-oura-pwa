// ─── ZIP Import Worker ────────────────────────────────────────────────────────
//
// Why a Worker instead of running this on the main thread?
//   JSZip decompression + Papa Parse CSV parsing is CPU-bound and can block
//   the main thread for seconds on a 50 MB+ Oura GDPR export. Offloading to a
//   Worker keeps the UI responsive — the user sees live progress updates
//   instead of a frozen browser tab.
//
// This is a native Vite module Worker — Vite bundles it as a separate chunk
// (no extra config needed) when the main thread instantiates it with:
//   new Worker(new URL('./workers/import.worker.ts', import.meta.url), { type: 'module' })

import JSZip from 'jszip'
import Papa from 'papaparse'
import { db } from '../db/client'
import type { ImportStats } from '../db/schema'
import type {
  SleepDay,
  SleepSession,
  ReadinessDay,
  ResilienceDay,
  ActivityDay,
  Workout,
  Meditation,
  StressPoint,
} from '../db/schema'
import {
  SleepDayRowSchema,
  SleepSessionRowSchema,
  ReadinessDayRowSchema,
  ResilienceDayRowSchema,
  ActivityDayRowSchema,
  WorkoutRowSchema,
  MeditationRowSchema,
  StressRowSchema,
} from '../connectors/oura/schema'

// ─── Message Protocol ─────────────────────────────────────────────────────────
//
// Exported so the main thread (OnboardingPage import trigger) can import them
// for type-safe `worker.postMessage(...)` and `worker.onmessage` handlers.

export type WorkerInMessage = { type: 'start'; payload: { blob: Blob } }

export type WorkerOutMessage =
  | { type: 'progress'; payload: { phase: string; pct: number } }
  | { type: 'done'; payload: { stats: ImportStats } }
  | { type: 'error'; payload: { message: string } }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function post(msg: WorkerOutMessage) {
  self.postMessage(msg)
}

/** Parse CSV text into an array of raw row objects via Papa Parse.
 *
 * Why `worker: false`?
 *   Papa Parse can spawn its own worker for large CSVs, but we're already
 *   inside a Worker. Nesting workers (spawning a worker from a worker) is not
 *   supported in all browsers and would silently produce no output in Safari.
 *   Sync parsing inside a Worker is the right approach here — we own the
 *   thread, so blocking it is acceptable.
 */
function parseCsv(text: string): Record<string, string>[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    worker: false, // must be false — cannot nest workers inside a Worker
    skipEmptyLines: true,
  })
  return result.data
}

/** Try both the bare filename and the Oura_ prefixed variant.
 *
 * Why two lookups?
 *   Oura's GDPR export has changed naming conventions across app versions.
 *   Older exports used plain names (`sleep.csv`); newer exports prefix with
 *   `Oura_` (`Oura_sleep.csv`). We try both to support all export vintages.
 */
async function extractCsv(zip: JSZip, baseName: string): Promise<string | null> {
  const candidates = [baseName, `Oura_${baseName}`]
  for (const name of candidates) {
    // JSZip stores files by their full path inside the archive; search all
    // files for a match on the filename part (in case they're inside a folder).
    const entry = Object.values(zip.files).find(
      (f) => !f.dir && (f.name === name || f.name.endsWith(`/${name}`)),
    )
    if (entry) return entry.async('string')
  }
  return null
}

// ─── Per-file parsers → DB record transformers ───────────────────────────────
//
// Each transformer validates rows with Zod safeParse (never throws on bad data)
// then maps the snake_case CSV fields to camelCase DB interfaces.
// Invalid rows are silently dropped — Oura CSVs can include header-only files
// with no data rows, which is not an error.

function transformSleepDays(rows: Record<string, string>[]): SleepDay[] {
  return rows.flatMap((row) => {
    const result = SleepDayRowSchema.safeParse(row)
    if (!result.success) return []
    const r = result.data

    // optimal_bedtime is a JSON-encoded object in the CSV; parse defensively.
    let optimalBedtime: SleepDay['optimalBedtime'] = null
    if (r.optimal_bedtime) {
      try {
        const parsed: unknown = JSON.parse(r.optimal_bedtime)
        if (parsed && typeof parsed === 'object' && 'start' in parsed && 'end' in parsed) {
          optimalBedtime = parsed as { start: string; end: string }
        }
      } catch {
        // malformed JSON — leave null
      }
    }

    return [
      {
        day: r.day,
        id: r.id,
        score: r.score,
        // Zod parses contributors as Record<string,number|null>|null; cast to the
        // typed interface. The null-coalesce happens before the cast so it is
        // visible to the type checker (casting first hides the nullability).
        contributors: (r.contributors ?? {
          deep_sleep: null,
          efficiency: null,
          latency: null,
          rem_sleep: null,
          restfulness: null,
          timing: null,
          total_sleep: null,
        }) as unknown as SleepDay['contributors'],
        optimalBedtime,
        status: r.status ?? null,
        spo2Percentage: r.spo2_percentage,
        breathingDisturbanceIndex: r.breathing_disturbance_index,
      },
    ]
  })
}

function transformSleepSessions(rows: Record<string, string>[]): SleepSession[] {
  return rows.flatMap((row) => {
    const result = SleepSessionRowSchema.safeParse(row)
    if (!result.success) return []
    const r = result.data
    return [
      {
        id: r.id,
        day: r.day,
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
      },
    ]
  })
}

function transformReadinessDays(rows: Record<string, string>[]): ReadinessDay[] {
  return rows.flatMap((row) => {
    const result = ReadinessDayRowSchema.safeParse(row)
    if (!result.success) return []
    const r = result.data
    return [
      {
        day: r.day,
        id: r.id,
        score: r.score,
        temperatureDeviation: r.temperature_deviation,
        temperatureTrendDeviation: r.temperature_trend_deviation,
        stressHigh: r.stress_high,
        recoveryHigh: r.recovery_high,
        daySummary: r.day_summary ?? null,
        // Zod parses contributors as Record<string,number|null>|null; null-coalesce
        // before casting so the fallback is type-checker-visible.
        contributors: (r.contributors ?? {
          activity_balance: null,
          body_temperature: null,
          hrv_balance: null,
          previous_day_activity: null,
          previous_night: null,
          recovery_index: null,
          resting_heart_rate: null,
          sleep_balance: null,
        }) as unknown as ReadinessDay['contributors'],
      },
    ]
  })
}

function transformResilienceDays(rows: Record<string, string>[]): ResilienceDay[] {
  // ResilienceDayRowSchema has `contributors` as a JSON object containing
  // { sleep_recovery, daytime_recovery, stress } — we destructure those out
  // and map to the typed ResilienceDay fields.
  return rows.flatMap((row) => {
    const result = ResilienceDayRowSchema.safeParse(row)
    if (!result.success) return []
    const r = result.data
    // r.contributors is already Record<string, number | null> | null from the schema
    const c = r.contributors
    return [
      {
        day: r.day,
        id: r.id,
        level: r.level,
        sleepRecovery: c?.['sleep_recovery'] ?? null,
        daytimeRecovery: c?.['daytime_recovery'] ?? null,
        stress: c?.['stress'] ?? null,
      },
    ]
  })
}

function transformActivityDays(rows: Record<string, string>[]): ActivityDay[] {
  return rows.flatMap((row) => {
    const result = ActivityDayRowSchema.safeParse(row)
    if (!result.success) return []
    const r = result.data
    return [
      {
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
        // r.contributors is Record<string, number | null> | null; default to {}
        // when null (ActivityDay expects Record<string, number | null>).
        contributors: r.contributors ?? {},
        class5Min: r.class_5_min,
        met: r.met,
      },
    ]
  })
}

function transformWorkouts(rows: Record<string, string>[]): Workout[] {
  return rows.flatMap((row) => {
    const result = WorkoutRowSchema.safeParse(row)
    if (!result.success) return []
    const r = result.data
    return [
      {
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
      },
    ]
  })
}

function transformMeditations(rows: Record<string, string>[]): Meditation[] {
  return rows.flatMap((row) => {
    const result = MeditationRowSchema.safeParse(row)
    if (!result.success) return []
    const r = result.data
    return [
      {
        id: r.id,
        day: r.day,
        startDatetime: r.start_datetime,
        endDatetime: r.end_datetime,
        type: r.type ?? null,
        mood: r.mood ?? null,
      },
    ]
  })
}

function transformStressPoints(rows: Record<string, string>[]): Omit<StressPoint, 'id'>[] {
  return rows.flatMap((row) => {
    const result = StressRowSchema.safeParse(row)
    if (!result.success) return []
    const r = result.data
    // `day` is derived from the timestamp (YYYY-MM-DD prefix) — the stress CSV
    // has no explicit day column, only an ISO 8601 timestamp.
    const day = r.timestamp.slice(0, 10)
    return [
      {
        day,
        timestamp: r.timestamp,
        stressValue: r.stress_value,
        recoveryValue: r.recovery_value,
      },
    ]
  })
}

// ─── Main import logic ────────────────────────────────────────────────────────

async function runImport(blob: Blob): Promise<void> {
  // Step 1: Open the ZIP archive
  post({ type: 'progress', payload: { phase: 'Opening ZIP…', pct: 2 } })
  const zip = await JSZip.loadAsync(blob)
  post({ type: 'progress', payload: { phase: 'Extracting ZIP…', pct: 5 } })

  // Step 2: Extract and parse each CSV file.
  // Progress is spread from 10% → 80% across the 8 files (≈8.75 pct each).
  const files: Array<{ name: string; startPct: number }> = [
    { name: 'sleep.csv', startPct: 10 },
    { name: 'sleep_session.csv', startPct: 20 },
    { name: 'readiness.csv', startPct: 30 },
    { name: 'resilience.csv', startPct: 40 },
    { name: 'daily_activity.csv', startPct: 50 },
    { name: 'workouts.csv', startPct: 58 },
    { name: 'meditation.csv', startPct: 66 },
    { name: 'stress.csv', startPct: 74 },
  ]

  const sleepDays: SleepDay[] = []
  const sleepSessions: SleepSession[] = []
  const readinessDays: ReadinessDay[] = []
  const resilienceDays: ResilienceDay[] = []
  const activityDays: ActivityDay[] = []
  const workouts: Workout[] = []
  const meditations: Meditation[] = []
  const stressPoints: Omit<StressPoint, 'id'>[] = []

  for (const { name, startPct } of files) {
    post({
      type: 'progress',
      payload: { phase: `Parsing ${name}…`, pct: startPct },
    })
    const text = await extractCsv(zip, name)
    if (text === null) continue // file absent in this export — not an error

    const rows = parseCsv(text)

    switch (name) {
      case 'sleep.csv':
        sleepDays.push(...transformSleepDays(rows))
        break
      case 'sleep_session.csv':
        sleepSessions.push(...transformSleepSessions(rows))
        break
      case 'readiness.csv':
        readinessDays.push(...transformReadinessDays(rows))
        break
      case 'resilience.csv':
        resilienceDays.push(...transformResilienceDays(rows))
        break
      case 'daily_activity.csv':
        activityDays.push(...transformActivityDays(rows))
        break
      case 'workouts.csv':
        workouts.push(...transformWorkouts(rows))
        break
      case 'meditation.csv':
        meditations.push(...transformMeditations(rows))
        break
      case 'stress.csv':
        stressPoints.push(...transformStressPoints(rows))
        break
    }
  }

  // Step 3: Batch-write all parsed records to IndexedDB in a single transaction.
  //
  // Why bulkPut instead of bulkAdd?
  //   `bulkAdd` throws if a record with the same PK already exists.
  //   `bulkPut` is upsert — if the user re-imports the same ZIP or an updated
  //   export, existing records are overwritten in place rather than duplicated.
  //   This makes re-import safe and idempotent.
  //
  // Why a single transaction wrapping all tables?
  //   Atomicity — either every table is updated or none is (on error, IndexedDB
  //   rolls back the whole write). The user never ends up with partial data.
  post({ type: 'progress', payload: { phase: 'Writing to database…', pct: 82 } })

  await db.transaction(
    'rw',
    [
      db.sleepDays,
      db.sleepSessions,
      db.readinessDays,
      db.resilienceDays,
      db.activityDays,
      db.workouts,
      db.meditations,
      db.stressPoints,
      db.meta,
    ],
    async () => {
      await Promise.all([
        db.sleepDays.bulkPut(sleepDays),
        db.sleepSessions.bulkPut(sleepSessions),
        db.readinessDays.bulkPut(readinessDays),
        db.resilienceDays.bulkPut(resilienceDays),
        db.activityDays.bulkPut(activityDays),
        db.workouts.bulkPut(workouts),
        db.meditations.bulkPut(meditations),
        // StressPoint uses auto-increment PK — bulkPut with no id causes Dexie
        // to assign new IDs each time, so we clear first then add to avoid
        // accumulating duplicates across re-imports.
        db.stressPoints.clear().then(() => db.stressPoints.bulkAdd(stressPoints as StressPoint[])),
      ])

      // Store the original ZIP blob for Safari eviction recovery.
      //
      // Why keep the ZIP?
      //   Safari's ITP policy aggressively evicts IndexedDB storage after 7 days
      //   of inactivity. By caching the raw ZIP blob alongside the parsed data,
      //   we can re-run the import automatically if the DB is cleared, without
      //   asking the user to re-upload their file.
      await db.meta.put({ key: 'zipBlob', value: blob })
    },
  )

  // Step 4: Compute and persist import statistics.
  post({ type: 'progress', payload: { phase: 'Finalising…', pct: 96 } })

  const stats: ImportStats = {
    sleepNights: sleepDays.length,
    readinessDays: readinessDays.length,
    activityDays: activityDays.length,
    workouts: workouts.length,
    meditations: meditations.length,
    stressPoints: stressPoints.length,
    importedAt: new Date().toISOString(),
  }

  await db.meta.put({ key: 'importStats', value: stats })

  post({ type: 'done', payload: { stats } })
}

// ─── Entry point ──────────────────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data
  // WorkerInMessage only has type 'start', so no dispatch needed — go directly.

  runImport(msg.payload.blob).catch((e: unknown) => {
    // Catch and report errors rather than letting them propagate unhandled.
    //
    // Why not re-throw?
    //   An unhandled Worker error fires `onerror` on the main thread but gives
    //   no structured payload — the user sees nothing. Posting a typed 'error'
    //   message lets the UI surface a human-readable failure reason.
    const message = e instanceof Error ? e.message : String(e)
    post({ type: 'error', payload: { message } })
  })
}
