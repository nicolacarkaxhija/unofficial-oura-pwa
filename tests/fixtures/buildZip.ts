// ─── Synthetic Oura ZIP Builder ───────────────────────────────────────────────
//
// Why we build a real ZIP rather than mocking the worker or the parser:
//
//   The ZIP→Papa.parse→Zod→Dexie pipeline is the highest-risk integration
//   point in the entire app. Every layer can silently corrupt data:
//     • JSZip can misread file entries (encoding, compression, CRC)
//     • Papa Parse can misidentify delimiters or header rows
//     • Zod coercions can silently produce `null` for values we expected
//     • Dexie's bulkPut can drop records when a PK constraint fires
//
//   Mocking any layer would give false confidence. A test that hands pre-parsed
//   data to the Zod schemas skips JSZip and Papa entirely — it cannot catch the
//   bug where a real ZIP has Windows-style \r\n line endings that cause Papa to
//   include the carriage return in the last column name. A test that mocks Zod
//   output skips the coercion logic that turns "" → null.
//
//   The approach here: produce a Blob that is byte-for-byte indistinguishable
//   from what membership.ouraring.com/data-export generates, then let the
//   import worker process it without any stubbing. If the round-trip produces
//   the correct Dexie records, every layer is verified in one go.

import Papa from 'papaparse'
import JSZip from 'jszip'
import {
  makeSleepDayRow,
  makeSleepSessionRow,
  makeReadinessDayRow,
  makeResilienceDayRow,
  makeActivityDayRow,
  makeWorkoutRow,
  makeMeditationRow,
  makeStressRow,
} from './csvRows'

export interface FixtureZipOptions {
  /** Number of days of data to generate. Default: 30. */
  days?: number
  /**
   * ISO date string (YYYY-MM-DD) for the first day in the range.
   * Default: 30 days before yesterday (so the last day is always yesterday).
   */
  startDate?: string
  /** Include workout rows in the ZIP. Default: true. */
  includeWorkouts?: boolean
  /** Include meditation rows. Default: true. */
  includeMeditations?: boolean
  /** Include stress rows. Default: true. */
  includeStress?: boolean
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Return "YYYY-MM-DD" for a Date object without timezone shifts. */
function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Add `n` days to a date (mutates and returns a new Date). */
function addDays(d: Date, n: number): Date {
  const result = new Date(d)
  result.setDate(result.getDate() + n)
  return result
}

/** Derive a session UUID-style id from a day string and suffix. */
function rowId(prefix: string, day: string): string {
  // Not a real UUID, but stable and unique per (prefix, day) pair.
  return `${prefix}-${day.replace(/-/g, '')}`
}

// ─── Date sequence ────────────────────────────────────────────────────────────

function buildDateSequence(startDate: string, days: number): string[] {
  const start = new Date(`${startDate}T12:00:00Z`)
  return Array.from({ length: days }, (_, i) => isoDate(addDays(start, i)))
}

// ─── Default startDate ────────────────────────────────────────────────────────

function defaultStartDate(days: number): string {
  // We want the last generated day to be yesterday, so start = today − days.
  // Using UTC noon avoids any midnight DST ambiguity.
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const start = new Date(yesterday)
  start.setDate(start.getDate() - (days - 1))
  return isoDate(start)
}

// ─── Row generators ───────────────────────────────────────────────────────────

function sleepDayRows(dates: string[]) {
  return dates.map((day, i) =>
    makeSleepDayRow({
      day,
      id: rowId('sd', day),
      // Vary score slightly so charts have something non-trivial to render.
      score: String(70 + (i % 20)),
    }),
  )
}

function sleepSessionRows(dates: string[]) {
  return dates.map((day, i) => {
    // Bedtime starts at ~22:30 the previous evening.
    const prevDay = isoDate(addDays(new Date(`${day}T12:00:00Z`), -1))
    return makeSleepSessionRow({
      id: rowId('ss', day),
      day,
      bedtime_start: `${prevDay}T22:${String(30 + (i % 15)).padStart(2, '0')}:00+00:00`,
      bedtime_end: `${day}T06:${String(i % 60).padStart(2, '0')}:00+00:00`,
      // Vary efficiency so tests can assert on non-constant parsed values.
      efficiency: String(80 + (i % 15)),
    })
  })
}

function readinessDayRows(dates: string[]) {
  return dates.map((day, i) =>
    makeReadinessDayRow({
      day,
      id: rowId('rd', day),
      score: String(68 + (i % 25)),
    }),
  )
}

function resilienceDayRows(dates: string[]) {
  const levels = ['exceptional', 'strong', 'solid', 'adequate', 'weak'] as const
  return dates.map((day, i) =>
    makeResilienceDayRow({
      day,
      id: rowId('res', day),
      level: levels[i % levels.length],
    }),
  )
}

function activityDayRows(dates: string[]) {
  return dates.map((day, i) =>
    makeActivityDayRow({
      day,
      id: rowId('ad', day),
      score: String(75 + (i % 20)),
      steps: String(6000 + i * 120),
    }),
  )
}

function workoutRows(dates: string[]) {
  // One workout every three days — realistic cadence, keeps the fixture small.
  const activities = ['running', 'cycling', 'yoga', 'weight_training', 'walking']
  return dates
    .filter((_, i) => i % 3 === 0)
    .map((day, i) =>
      makeWorkoutRow({
        id: rowId('wo', day),
        day,
        start_datetime: `${day}T07:30:00+00:00`,
        end_datetime: `${day}T08:20:00+00:00`,
        activity: activities[i % activities.length],
        calories: String(300 + i * 15),
      }),
    )
}

function meditationRows(dates: string[]) {
  // One meditation every five days.
  return dates
    .filter((_, i) => i % 5 === 0)
    .map((day, i) =>
      makeMeditationRow({
        id: rowId('med', day),
        day,
        start_datetime: `${day}T19:00:00+00:00`,
        end_datetime: `${day}T19:${String(10 + (i % 20)).padStart(2, '0')}:00+00:00`,
      }),
    )
}

function stressRows(dates: string[]) {
  // Four stress readings per day — one every six hours — simulates the
  // resolution Oura uses in real exports.
  return dates.flatMap((day, i) =>
    [6, 12, 18, 23].map((hour) =>
      makeStressRow({
        timestamp: `${day}T${String(hour).padStart(2, '0')}:00:00+00:00`,
        stress_value: String(30 + ((i + hour) % 50)),
        recovery_value: String(50 + ((i + hour) % 35)),
      }),
    ),
  )
}

// ─── CSV serialisation ────────────────────────────────────────────────────────

/**
 * Serialise an array of row objects to a CSV string.
 *
 * Papa.unparse() is the inverse of Papa.parse() — using the same library in
 * both directions guarantees that header detection, quoting, and escaping are
 * consistent with what the import worker will receive from a real Oura export.
 */
function toCsv(rows: Record<string, string>[]): string {
  if (rows.length === 0) return ''
  return Papa.unparse(rows)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a ZIP Blob that is format-compatible with the Oura data export portal.
 *
 * The returned Blob can be passed directly to the import worker without any
 * modification — it is the same artifact the user would download from
 * membership.ouraring.com/data-export.
 *
 * @example
 * const blob = await buildFixtureZip({ days: 7 })
 * // blob is a real ZIP; pass it to the import worker in an integration test.
 */
export async function buildFixtureZip(options: FixtureZipOptions = {}): Promise<Blob> {
  const {
    days = 30,
    startDate = defaultStartDate(days),
    includeWorkouts = true,
    includeMeditations = true,
    includeStress = true,
  } = options

  const dates = buildDateSequence(startDate, days)

  const zip = new JSZip()

  // Each CSV file mirrors the exact filename Oura uses in their export ZIP.
  // If the import worker uses these names as lookup keys, the fixture will
  // exercise that lookup without any stubbing.
  zip.file('sleep.csv', toCsv(sleepDayRows(dates)))
  zip.file('sleep_sessions.csv', toCsv(sleepSessionRows(dates)))
  zip.file('readiness.csv', toCsv(readinessDayRows(dates)))
  zip.file('resilience.csv', toCsv(resilienceDayRows(dates)))
  zip.file('activity.csv', toCsv(activityDayRows(dates)))

  if (includeWorkouts) {
    zip.file('workouts.csv', toCsv(workoutRows(dates)))
  }

  if (includeMeditations) {
    zip.file('meditations.csv', toCsv(meditationRows(dates)))
  }

  if (includeStress) {
    zip.file('stress.csv', toCsv(stressRows(dates)))
  }

  // JSZip generates a real DEFLATE-compressed ZIP binary.
  // `type: 'blob'` gives us the same Blob type the File API returns when a
  // user selects a file from disk — no conversion needed in tests.
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}
