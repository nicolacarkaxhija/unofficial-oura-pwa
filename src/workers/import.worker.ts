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
  parseSleepDays,
  parseSleepSessions,
  parseReadinessDays,
  parseResilienceDays,
  parseActivityDays,
  parseWorkouts,
  parseMeditations,
  parseStressPoints,
} from '../connectors/oura/parsers'
import { computeDayRange } from '../lib/aggregates'

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

// ─── Per-file parsers ─────────────────────────────────────────────────────────
//
// Row transformation is delegated to src/connectors/oura/parsers — the module
// the unit suite exercises directly. The worker previously carried its own
// copies of these transforms, which silently diverged from the tested ones
// (e.g. the legacy "HH:MM-HH:MM" optimal_bedtime format was handled only in
// the tested copy). One implementation, one test surface.

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
  const stressPoints: StressPoint[] = []

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
        sleepDays.push(...parseSleepDays(rows))
        break
      case 'sleep_session.csv':
        sleepSessions.push(...parseSleepSessions(rows))
        break
      case 'readiness.csv':
        readinessDays.push(...parseReadinessDays(rows))
        break
      case 'resilience.csv':
        resilienceDays.push(...parseResilienceDays(rows))
        break
      case 'daily_activity.csv':
        activityDays.push(...parseActivityDays(rows))
        break
      case 'workouts.csv':
        workouts.push(...parseWorkouts(rows))
        break
      case 'meditation.csv':
        meditations.push(...parseMeditations(rows))
        break
      case 'stress.csv':
        stressPoints.push(...parseStressPoints(rows))
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
        db.stressPoints.clear().then(() => db.stressPoints.bulkAdd(stressPoints)),
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

  // Coverage range spans the three daily pillar files only — workouts,
  // meditations and stress are sparse side-tables that never extend past the
  // days the pillars already cover in a real Oura export.
  const range = computeDayRange([...sleepDays, ...readinessDays, ...activityDays].map((r) => r.day))

  const stats: ImportStats = {
    sleepNights: sleepDays.length,
    readinessDays: readinessDays.length,
    activityDays: activityDays.length,
    workouts: workouts.length,
    meditations: meditations.length,
    stressPoints: stressPoints.length,
    importedAt: new Date().toISOString(),
    firstDay: range?.first ?? null,
    lastDay: range?.last ?? null,
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
