import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db/client'
import type { SleepDay, SleepSession, StressPoint } from '@/db/schema'

// ─── Dexie layer tests ────────────────────────────────────────────────────────
//
// These exercise the exact queries the React hooks delegate to (useLatestSleepDay,
// useSleepSession, useStressForDay, …) but without React: dexie-react-hooks'
// useLiveQuery is a thin subscription wrapper, so the query semantics — the part
// that can actually be wrong — are fully testable against fake-indexeddb.
//
// The `db` singleton is constructed once at module load, so the fresh IDBFactory
// swapped in by tests/setup.ts is not enough on its own if a previous test left
// the connection open against an older factory. Clearing every table gives
// deterministic isolation regardless of when Dexie bound its IndexedDB instance.

function makeSleepDay(day: string, score = 80): SleepDay {
  return {
    day,
    id: `sd-${day}`,
    score,
    contributors: {
      deep_sleep: 80,
      efficiency: 90,
      latency: 70,
      rem_sleep: 75,
      restfulness: 72,
      timing: 85,
      total_sleep: 82,
    },
    optimalBedtime: null,
    status: null,
    spo2Percentage: null,
    breathingDisturbanceIndex: null,
  }
}

function makeSession(id: string, day: string): SleepSession {
  return {
    id,
    day,
    bedtimeStart: `${day}T23:00:00+00:00`,
    bedtimeEnd: `${day}T07:00:00+00:00`,
    type: 'long_sleep',
    efficiency: 90,
    latency: 300,
    totalSleepDuration: 27000,
    deepSleepDuration: 5400,
    remSleepDuration: 7200,
    lightSleepDuration: 14400,
    awakeTime: 1200,
    timeInBed: 28800,
    averageHeartRate: 55,
    lowestHeartRate: 48,
    averageHrv: 40,
    averageBreath: 14,
    restlessPeriods: 3,
    sleepPhase5Min: null,
    heartRate: null,
    hrv: null,
    movement30Sec: null,
  }
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

// ─── Schema ───────────────────────────────────────────────────────────────────

describe('OuraPWA schema', () => {
  it('declares all nine tables', () => {
    const names = db.tables.map((t) => t.name).sort()
    expect(names).toEqual([
      'activityDays',
      'meditations',
      'meta',
      'readinessDays',
      'resilienceDays',
      'sleepDays',
      'sleepSessions',
      'stressPoints',
      'workouts',
    ])
  })

  it('uses day as primary key for daily-summary tables', () => {
    // The "one record per calendar day" invariant is enforced by the PK choice,
    // not by application code — a wrong PK would silently allow duplicates.
    for (const table of ['sleepDays', 'readinessDays', 'resilienceDays', 'activityDays']) {
      expect(db.table(table).schema.primKey.keyPath).toBe('day')
    }
  })

  it('indexes day on session-style tables whose PK is id', () => {
    for (const table of ['sleepSessions', 'workouts', 'meditations']) {
      const schema = db.table(table).schema
      expect(schema.primKey.keyPath).toBe('id')
      expect(schema.idxByName['day']).toBeDefined()
    }
  })

  it('gives stressPoints an auto-increment PK and a [day+timestamp] compound index', () => {
    const schema = db.stressPoints.schema
    expect(schema.primKey.auto).toBe(true)
    expect(schema.idxByName['[day+timestamp]']?.compound).toBe(true)
  })
})

// ─── Latest-day semantics ─────────────────────────────────────────────────────
//
// useLatestSleepDay/-ReadinessDay/-ActivityDay all rely on this exact query.
// The `?? null` contract matters: hooks must distinguish "table empty" (null)
// from "query in flight" (undefined), so first() returning undefined on an
// empty table is normalised to null by the hook.

describe('latest-day query (orderBy(day).reverse().first())', () => {
  it('returns undefined on an empty table, which hooks normalise to null', async () => {
    const row = await db.sleepDays.orderBy('day').reverse().first()
    expect(row).toBeUndefined()
    expect(row ?? null).toBeNull()
  })

  it('returns the single row when only one exists', async () => {
    await db.sleepDays.put(makeSleepDay('2024-05-01'))
    const row = await db.sleepDays.orderBy('day').reverse().first()
    expect(row?.day).toBe('2024-05-01')
  })

  it('returns the max day even when rows are inserted out of order with gaps', async () => {
    // Insertion order deliberately scrambled and non-contiguous: the query must
    // rely on the index sort, not insertion order, and gaps must not matter
    // because "latest" means max key, not "yesterday" or "today".
    await db.sleepDays.bulkPut([
      makeSleepDay('2024-03-10'),
      makeSleepDay('2024-06-01'),
      makeSleepDay('2023-12-31'),
      makeSleepDay('2024-05-20'),
    ])
    const row = await db.sleepDays.orderBy('day').reverse().first()
    expect(row?.day).toBe('2024-06-01')
  })

  it('sorts ISO date strings correctly across year and month boundaries', async () => {
    // Day is stored as a string PK — lexicographic order only equals
    // chronological order because the format is fixed-width YYYY-MM-DD.
    // This test guards against anyone switching to a locale date format.
    await db.readinessDays.bulkPut(
      ['2023-09-30', '2023-10-01', '2024-01-01', '2023-12-31'].map((day) => ({
        day,
        id: `rd-${day}`,
        score: 70,
        temperatureDeviation: null,
        temperatureTrendDeviation: null,
        stressHigh: null,
        recoveryHigh: null,
        daySummary: null,
        contributors: {
          activity_balance: null,
          body_temperature: null,
          hrv_balance: null,
          previous_day_activity: null,
          previous_night: null,
          recovery_index: null,
          resting_heart_rate: null,
          sleep_balance: null,
        },
      })),
    )
    const row = await db.readinessDays.orderBy('day').reverse().first()
    expect(row?.day).toBe('2024-01-01')
  })

  it('list query returns newest-first and honours limit (useSleepDays contract)', async () => {
    await db.sleepDays.bulkPut(
      ['2024-01-01', '2024-01-03', '2024-01-02', '2024-01-05'].map((d) => makeSleepDay(d)),
    )
    const rows = await db.sleepDays.orderBy('day').reverse().limit(3).toArray()
    expect(rows.map((r) => r.day)).toEqual(['2024-01-05', '2024-01-03', '2024-01-02'])
  })
})

// ─── bulkPut upsert semantics ─────────────────────────────────────────────────

describe('bulkPut upsert semantics', () => {
  it('re-putting the same day updates in place instead of duplicating', async () => {
    await db.sleepDays.bulkPut([makeSleepDay('2024-04-01', 70)])
    await db.sleepDays.bulkPut([makeSleepDay('2024-04-01', 95)])

    expect(await db.sleepDays.count()).toBe(1)
    const row = await db.sleepDays.get('2024-04-01')
    // Last write wins — this is what makes re-importing an updated GDPR
    // export refresh scores rather than silently keeping stale values.
    expect(row?.score).toBe(95)
  })

  it('duplicate days within a single bulkPut batch collapse to the last one', async () => {
    // Oura exports occasionally contain the same day twice (e.g. a re-synced
    // night); the PK must deduplicate inside one batch, not just across imports.
    await db.sleepDays.bulkPut([makeSleepDay('2024-04-02', 60), makeSleepDay('2024-04-02', 88)])
    expect(await db.sleepDays.count()).toBe(1)
    expect((await db.sleepDays.get('2024-04-02'))?.score).toBe(88)
  })

  it('id-keyed tables upsert by id, allowing two sessions on the same day', async () => {
    // A night can legitimately contain a long sleep plus a nap — the id PK
    // must not collapse them, only true re-imports of the same session.
    await db.sleepSessions.bulkPut([
      makeSession('s1', '2024-04-03'),
      makeSession('s2', '2024-04-03'),
      makeSession('s1', '2024-04-03'),
    ])
    expect(await db.sleepSessions.count()).toBe(2)
  })
})

// ─── Secondary-index queries used by detail-page hooks ────────────────────────

describe('day-index queries', () => {
  it('where(day).equals(date).first() picks a session for that night only', async () => {
    await db.sleepSessions.bulkPut([makeSession('a', '2024-04-05'), makeSession('b', '2024-04-06')])
    const session = await db.sleepSessions.where('day').equals('2024-04-05').first()
    expect(session?.id).toBe('a')
  })

  it('returns undefined for a date with no session (useSleepSession loading vs missing)', async () => {
    await db.sleepSessions.put(makeSession('a', '2024-04-05'))
    expect(await db.sleepSessions.where('day').equals('1999-01-01').first()).toBeUndefined()
  })
})

// ─── StressPoint queries ──────────────────────────────────────────────────────

describe('stressPoints', () => {
  const points: Omit<StressPoint, 'id'>[] = [
    {
      day: '2024-04-10',
      timestamp: '2024-04-10T18:00:00+00:00',
      stressValue: 40,
      recoveryValue: 50,
    },
    {
      day: '2024-04-10',
      timestamp: '2024-04-10T06:00:00+00:00',
      stressValue: 30,
      recoveryValue: 60,
    },
    {
      day: '2024-04-11',
      timestamp: '2024-04-11T06:00:00+00:00',
      stressValue: 55,
      recoveryValue: 45,
    },
  ]

  it('auto-assigns increasing numeric ids on bulkAdd', async () => {
    await db.stressPoints.bulkAdd(points)
    const rows = await db.stressPoints.toArray()
    expect(rows).toHaveLength(3)
    // Every row must have received a PK — parsers deliberately omit `id`.
    expect(rows.every((r) => typeof r.id === 'number')).toBe(true)
  })

  it('where(day) uses the compound-index prefix and sortBy orders chronologically', async () => {
    // useStressForDay queries where('day') even though only [day+timestamp] is
    // declared — Dexie's virtual-index feature serves prefix lookups from the
    // compound index. If that ever regressed, the stress chart would throw
    // a SchemaError at runtime; this test pins the behaviour.
    await db.stressPoints.bulkAdd(points)
    const rows = await db.stressPoints.where('day').equals('2024-04-10').sortBy('timestamp')
    expect(rows.map((r) => r.timestamp)).toEqual([
      '2024-04-10T06:00:00+00:00',
      '2024-04-10T18:00:00+00:00',
    ])
  })

  it('clear-then-add keeps re-imports from accumulating duplicates', async () => {
    // The auto-increment PK means bulkPut cannot deduplicate stress rows;
    // the import worker compensates with clear() + bulkAdd(). This test
    // verifies that strategy actually yields a stable count.
    await db.stressPoints.bulkAdd(points)
    await db.stressPoints.clear()
    await db.stressPoints.bulkAdd(points)
    expect(await db.stressPoints.count()).toBe(3)
  })
})

// ─── Meta table ───────────────────────────────────────────────────────────────

describe('meta table', () => {
  it('returns undefined for importStats before any import (useImportStats contract)', async () => {
    expect(await db.meta.get('importStats')).toBeUndefined()
  })

  it('put overwrites the singleton entry by key', async () => {
    await db.meta.put({ key: 'importStats', value: { sleepNights: 1 } })
    await db.meta.put({ key: 'importStats', value: { sleepNights: 2 } })
    expect(await db.meta.count()).toBe(1)
    const entry = await db.meta.get('importStats')
    expect(entry?.value).toEqual({ sleepNights: 2 })
  })

  it('count() > 0 proxy works for useHasData', async () => {
    expect((await db.sleepDays.count()) > 0).toBe(false)
    await db.sleepDays.put(makeSleepDay('2024-04-01'))
    expect((await db.sleepDays.count()) > 0).toBe(true)
  })
})
