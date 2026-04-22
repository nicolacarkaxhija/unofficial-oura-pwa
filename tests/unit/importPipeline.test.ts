import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import JSZip from 'jszip'
import Papa from 'papaparse'
import { buildFixtureZip } from '../fixtures'
import { db } from '@/db/client'
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

// ─── ZIP round-trip integration ───────────────────────────────────────────────
//
// The worker file (src/workers/import.worker.ts) cannot run in Node — it calls
// self.postMessage at module scope handlers. Instead we replicate its pipeline
// step-for-step (same filenames, same Papa options, same bulkPut/clear-add
// write strategy) using the pure parse functions from src/connectors/oura.
// This still exercises every layer that can corrupt data: JSZip binary
// round-trip, Papa header/quoting/line-ending handling, Zod coercions, and
// Dexie PK/upsert semantics. Only the postMessage plumbing is untested here —
// that is covered by the Playwright e2e suite.

const CSV_FILES = [
  'sleep.csv',
  'sleep_session.csv',
  'readiness.csv',
  'resilience.csv',
  'daily_activity.csv',
  'workouts.csv',
  'meditation.csv',
  'stress.csv',
] as const

async function extractCsv(zip: JSZip, baseName: string): Promise<string | null> {
  // Same dual lookup as the worker: plain name and Oura_ prefix, anywhere in
  // the folder tree — this is the naming drift across Oura app versions.
  for (const name of [baseName, `Oura_${baseName}`]) {
    const entry = Object.values(zip.files).find(
      (f) => !f.dir && (f.name === name || f.name.endsWith(`/${name}`)),
    )
    if (entry) return entry.async('string')
  }
  return null
}

function parseCsv(text: string): Record<string, string>[] {
  return Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true }).data
}

// jsdom's Blob has no arrayBuffer() method (only real browsers/Node Blobs do),
// so we bridge through FileReader — the API JSZip itself would use in a browser.
function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(reader.result as ArrayBuffer)
    }
    reader.onerror = () => {
      reject(new Error('FileReader failed to read fixture blob'))
    }
    reader.readAsArrayBuffer(blob)
  })
}

async function importZip(blob: Blob): Promise<void> {
  const zip = await JSZip.loadAsync(await blobToArrayBuffer(blob))

  const texts = new Map<string, Record<string, string>[]>()
  for (const name of CSV_FILES) {
    const text = await extractCsv(zip, name)
    if (text === null) continue // absent file = partial export, not an error
    texts.set(name, parseCsv(text))
  }

  const sleepDays = parseSleepDays(texts.get('sleep.csv') ?? [])
  const sleepSessions = parseSleepSessions(texts.get('sleep_session.csv') ?? [])
  const readinessDays = parseReadinessDays(texts.get('readiness.csv') ?? [])
  const resilienceDays = parseResilienceDays(texts.get('resilience.csv') ?? [])
  const activityDays = parseActivityDays(texts.get('daily_activity.csv') ?? [])
  const workouts = parseWorkouts(texts.get('workouts.csv') ?? [])
  const meditations = parseMeditations(texts.get('meditation.csv') ?? [])
  const stressPoints = parseStressPoints(texts.get('stress.csv') ?? [])

  await db.transaction('rw', db.tables, async () => {
    await Promise.all([
      db.sleepDays.bulkPut(sleepDays),
      db.sleepSessions.bulkPut(sleepSessions),
      db.readinessDays.bulkPut(readinessDays),
      db.resilienceDays.bulkPut(resilienceDays),
      db.activityDays.bulkPut(activityDays),
      db.workouts.bulkPut(workouts),
      db.meditations.bulkPut(meditations),
      // Mirrors the worker: auto-increment PK forces clear-then-add to keep
      // re-imports idempotent for stress data.
      db.stressPoints.clear().then(() => db.stressPoints.bulkAdd(stressPoints)),
    ])
  })
}

/** Build a ZIP from raw CSV text per filename — for hand-crafted edge cases. */
async function zipFromCsvText(files: Record<string, string>): Promise<Blob> {
  const zip = new JSZip()
  for (const [name, text] of Object.entries(files)) zip.file(name, text)
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

const MINIMAL_SLEEP_HEADER = 'day,id,score,spo2_percentage,breathing_disturbance_index'

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  // Parsers warn once per skipped row; silencing keeps malformed-row tests
  // from flooding the runner output while still letting us assert call counts.
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  warnSpy.mockRestore()
})

// ─── Full fixture round-trip ──────────────────────────────────────────────────

describe('fixture ZIP round-trip', () => {
  it('imports a 10-day fixture into every table with expected counts', async () => {
    await importZip(await buildFixtureZip({ days: 10, startDate: '2024-03-01' }))

    expect(await db.sleepDays.count()).toBe(10)
    expect(await db.sleepSessions.count()).toBe(10)
    expect(await db.readinessDays.count()).toBe(10)
    expect(await db.resilienceDays.count()).toBe(10)
    expect(await db.activityDays.count()).toBe(10)
    // buildFixtureZip cadence: workouts every 3 days, meditations every 5,
    // 4 stress readings/day — the counts pin that contract.
    expect(await db.workouts.count()).toBe(4)
    expect(await db.meditations.count()).toBe(2)
    expect(await db.stressPoints.count()).toBe(40)
  })

  it('stores typed values, not CSV strings', async () => {
    await importZip(await buildFixtureZip({ days: 3, startDate: '2024-03-01' }))

    const day = await db.sleepDays.get('2024-03-01')
    // score went CSV string → Zod coercion → number; a string here would mean
    // a layer was skipped or Papa mangled the header row.
    expect(typeof day?.score).toBe('number')
    expect(day?.contributors.deep_sleep).not.toBeNull()

    const session = await db.sleepSessions.where('day').equals('2024-03-02').first()
    expect(Array.isArray(session?.heartRate)).toBe(true)
    expect(Array.isArray(session?.sleepPhase5Min)).toBe(true)
  })

  it('derives stress day from timestamp and preserves ordering', async () => {
    await importZip(await buildFixtureZip({ days: 2, startDate: '2024-03-01' }))
    const rows = await db.stressPoints.where('day').equals('2024-03-01').sortBy('timestamp')
    expect(rows).toHaveLength(4)
    expect(rows.every((r) => r.timestamp.startsWith('2024-03-01'))).toBe(true)
  })

  it('re-importing the same ZIP is idempotent for every table', async () => {
    const blob = await buildFixtureZip({ days: 7, startDate: '2024-03-01' })
    await importZip(blob)
    await importZip(blob)

    // bulkPut dedupes by PK; stressPoints relies on clear-then-add. If either
    // strategy regressed, users re-importing an updated export would see
    // doubled charts.
    expect(await db.sleepDays.count()).toBe(7)
    expect(await db.sleepSessions.count()).toBe(7)
    expect(await db.workouts.count()).toBe(3)
    expect(await db.stressPoints.count()).toBe(28)
  })

  it('honours include flags as a partial export (missing optional CSVs)', async () => {
    await importZip(
      await buildFixtureZip({
        days: 5,
        startDate: '2024-03-01',
        includeWorkouts: false,
        includeMeditations: false,
        includeStress: false,
      }),
    )
    expect(await db.sleepDays.count()).toBe(5)
    expect(await db.workouts.count()).toBe(0)
    expect(await db.meditations.count()).toBe(0)
    expect(await db.stressPoints.count()).toBe(0)
  })
})

// ─── Filename variants and partial archives ──────────────────────────────────

describe('archive structure edge cases', () => {
  const oneSleepRow = `${MINIMAL_SLEEP_HEADER}\n2024-05-01,sd-1,82,97.5,2`

  it('finds CSVs with the Oura_ filename prefix (newer exports)', async () => {
    await importZip(await zipFromCsvText({ 'Oura_sleep.csv': oneSleepRow }))
    expect(await db.sleepDays.count()).toBe(1)
  })

  it('finds CSVs nested inside a folder', async () => {
    await importZip(await zipFromCsvText({ 'export/sleep.csv': oneSleepRow }))
    expect(await db.sleepDays.count()).toBe(1)
  })

  it('imports what exists and leaves other tables empty for a minimal export', async () => {
    await importZip(await zipFromCsvText({ 'sleep.csv': oneSleepRow }))
    expect(await db.sleepDays.count()).toBe(1)
    expect(await db.readinessDays.count()).toBe(0)
    expect(await db.activityDays.count()).toBe(0)
  })

  it('handles a completely empty ZIP without writing anything', async () => {
    await importZip(await zipFromCsvText({}))
    for (const table of db.tables) {
      expect(await table.count()).toBe(0)
    }
  })

  it('handles an empty CSV file (zero bytes) as zero rows', async () => {
    await importZip(await zipFromCsvText({ 'sleep.csv': '' }))
    expect(await db.sleepDays.count()).toBe(0)
  })

  it('handles a header-only CSV (export with no data rows yet)', async () => {
    await importZip(await zipFromCsvText({ 'sleep.csv': MINIMAL_SLEEP_HEADER }))
    expect(await db.sleepDays.count()).toBe(0)
  })
})

// ─── CSV content edge cases ───────────────────────────────────────────────────

describe('CSV content edge cases', () => {
  it('parses Windows \\r\\n line endings without corrupting the last column', async () => {
    // Historic failure mode: \r sticks to the last header name, so the last
    // column of every row lands under "breathing_disturbance_index\r" and the
    // real field is undefined → coerced null. Papa must strip the \r.
    const csv = [
      MINIMAL_SLEEP_HEADER,
      '2024-05-01,sd-1,82,97.5,2',
      '2024-05-02,sd-2,75,96.0,4',
    ].join('\r\n')
    await importZip(await zipFromCsvText({ 'sleep.csv': csv }))

    expect(await db.sleepDays.count()).toBe(2)
    expect((await db.sleepDays.get('2024-05-02'))?.breathingDisturbanceIndex).toBe(4)
  })

  it('handles quoted fields containing commas and embedded quotes', async () => {
    // day_summary is free text from Oura and routinely contains commas —
    // if quoting broke, every subsequent column would shift by one.
    const csv = [
      'day,id,score,temperature_deviation,temperature_trend_deviation,contributors,stress_high,recovery_high,day_summary',
      '2024-05-01,rd-1,74,0.1,-0.05,"{""hrv_balance"":80}",false,true,"Rest today, you need it"',
    ].join('\n')
    await importZip(await zipFromCsvText({ 'readiness.csv': csv }))

    const row = await db.readinessDays.get('2024-05-01')
    expect(row?.daySummary).toBe('Rest today, you need it')
    expect(row?.contributors.hrv_balance).toBe(80)
    expect(row?.recoveryHigh).toBe(true)
  })

  it('coerces empty cells to null rather than 0 or ""', async () => {
    // "" → null matters clinically: a missing SpO2 reading is not 0% oxygen.
    const csv = `${MINIMAL_SLEEP_HEADER}\n2024-05-01,sd-1,,,`
    await importZip(await zipFromCsvText({ 'sleep.csv': csv }))

    const row = await db.sleepDays.get('2024-05-01')
    expect(row?.score).toBeNull()
    expect(row?.spo2Percentage).toBeNull()
    expect(row?.breathingDisturbanceIndex).toBeNull()
  })

  it('skips rows with non-numeric values in numeric columns but keeps the rest', async () => {
    // Zod's coerce.number turns "corrupt" into NaN, which fails validation —
    // the skip-and-warn strategy must drop that row only, not abort the file.
    const csv = [
      MINIMAL_SLEEP_HEADER,
      '2024-05-01,sd-1,82,97.5,2',
      '2024-05-02,sd-2,corrupt,96.0,4',
      '2024-05-03,sd-3,79,95.5,1',
    ].join('\n')
    await importZip(await zipFromCsvText({ 'sleep.csv': csv }))

    expect(await db.sleepDays.count()).toBe(2)
    expect(await db.sleepDays.get('2024-05-02')).toBeUndefined()
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('skips rows whose contributors JSON has non-numeric values', async () => {
    const csv = [
      'day,id,level,contributors',
      '2024-05-01,res-1,solid,"{""stress"":""high""}"',
      '2024-05-02,res-2,strong,"{""stress"":41}"',
    ].join('\n')
    await importZip(await zipFromCsvText({ 'resilience.csv': csv }))

    expect(await db.resilienceDays.count()).toBe(1)
    expect((await db.resilienceDays.get('2024-05-02'))?.stress).toBe(41)
  })

  it('skips resilience rows with an unknown level enum value', async () => {
    const csv = ['day,id,level,contributors', '2024-05-01,res-1,legendary,{}'].join('\n')
    await importZip(await zipFromCsvText({ 'resilience.csv': csv }))
    expect(await db.resilienceDays.count()).toBe(0)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('collapses duplicate day rows to the last occurrence via the day PK', async () => {
    const csv = [
      MINIMAL_SLEEP_HEADER,
      '2024-05-01,sd-1,60,97.0,2',
      '2024-05-01,sd-1b,90,98.0,1',
    ].join('\n')
    await importZip(await zipFromCsvText({ 'sleep.csv': csv }))

    expect(await db.sleepDays.count()).toBe(1)
    // bulkPut keeps the later row — matching "newest data wins" on re-sync.
    expect((await db.sleepDays.get('2024-05-01'))?.score).toBe(90)
  })

  it('accepts syntactically-invalid date strings in day (documented gap)', async () => {
    // The Zod schemas type `day` as z.string() without a date refinement, so a
    // corrupt date passes validation and lands in the DB. This test documents
    // the current contract; if a date refinement is ever added, this test
    // should flip to expect 0 rows.
    const csv = `${MINIMAL_SLEEP_HEADER}\nnot-a-date,sd-1,82,97.5,2`
    await importZip(await zipFromCsvText({ 'sleep.csv': csv }))
    expect(await db.sleepDays.count()).toBe(1)
  })
})
