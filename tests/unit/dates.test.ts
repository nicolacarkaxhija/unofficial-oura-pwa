import { describe, it, expect } from 'vitest'
import { parseISO, isValid } from 'date-fns'
import JSZip from 'jszip'
import Papa from 'papaparse'
import { buildFixtureZip } from '../fixtures'

// ─── Date handling ────────────────────────────────────────────────────────────
//
// router.tsx's parseDateParam is module-private (routes bind it directly), so
// its validation logic cannot be imported without touching src. Its entire
// behaviour is `parseISO` + `isValid` from date-fns — we pin that contract
// here so a date-fns major upgrade that changes parseISO strictness surfaces
// as a unit failure instead of a broken route guard in production.

function isValidDateParam(date: string): boolean {
  return isValid(parseISO(date))
}

describe('parseISO/isValid route-param contract', () => {
  it('accepts canonical YYYY-MM-DD dates', () => {
    expect(isValidDateParam('2024-03-15')).toBe(true)
    expect(isValidDateParam('1999-12-31')).toBe(true)
  })

  it('accepts leap day only on leap years', () => {
    expect(isValidDateParam('2024-02-29')).toBe(true)
    // date-fns parseISO rejects overflow dates rather than rolling them over
    // (unlike new Date('2023-02-29') in some engines) — that strictness is
    // exactly why the router uses it.
    expect(isValidDateParam('2023-02-29')).toBe(false)
  })

  it('rejects garbage, out-of-range components, and the empty string', () => {
    expect(isValidDateParam('not-a-date')).toBe(false)
    expect(isValidDateParam('2024-13-01')).toBe(false)
    expect(isValidDateParam('2024-00-10')).toBe(false)
    expect(isValidDateParam('2024-01-32')).toBe(false)
    expect(isValidDateParam('')).toBe(false)
  })

  it('accepts full ISO timestamps (URLs may carry them; Dexie lookups then miss)', () => {
    // parseDateParam lets a full timestamp through because parseISO parses it.
    // db.sleepDays.get() would then miss (keys are plain YYYY-MM-DD). Recorded
    // here as the current, permissive contract.
    expect(isValidDateParam('2024-03-15T10:00:00Z')).toBe(true)
  })
})

// ─── Fixture default date range ───────────────────────────────────────────────

// jsdom's Blob has no arrayBuffer() method; FileReader is the portable bridge.
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

async function readSleepDays(blob: Blob): Promise<string[]> {
  const zip = await JSZip.loadAsync(await blobToArrayBuffer(blob))
  const file = zip.file('sleep.csv')
  if (!file) throw new Error('fixture ZIP missing sleep.csv')
  const rows = Papa.parse<Record<string, string>>(await file.async('string'), {
    header: true,
    skipEmptyLines: true,
  }).data
  return rows.map((r) => r['day'] ?? '')
}

function localIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${String(d.getFullYear())}-${m}-${day}`
}

describe('buildFixtureZip default date range', () => {
  it('ends on yesterday so seeded dashboards always look current', async () => {
    // The e2e suite depends on "latest day = yesterday": the dashboard shows
    // the latest row, and a fixture ending weeks in the past would make
    // staleness bugs invisible. Local-date arithmetic mirrors the fixture's
    // own isoDate() to stay timezone-safe.
    const days = await readSleepDays(await buildFixtureZip({ days: 5 }))

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    expect(days.at(-1)).toBe(localIso(yesterday))
    expect(days).toHaveLength(5)
  })

  it('generates consecutive calendar days from the given startDate', async () => {
    const days = await readSleepDays(await buildFixtureZip({ days: 4, startDate: '2024-02-27' }))
    // Crosses the 2024 leap day — a naive "+86400s" implementation with DST
    // or month-length bugs would produce a gap or a duplicate here.
    expect(days).toEqual(['2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01'])
  })
})
