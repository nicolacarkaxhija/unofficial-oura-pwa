import { describe, it, expect, beforeEach } from 'vitest'
import { subDays, format } from 'date-fns'
import { seedDatabase } from '@/dev/seedDatabase'
import { db } from '@/db/client'
import type { ImportStats } from '@/db/schema'

// ─── seedDatabase ─────────────────────────────────────────────────────────────
//
// The seeder is the only data source developers without a ring ever see, so a
// broken seed (wrong counts, malformed shapes) silently breaks every page in
// dev while unit tests on the parsers stay green. These tests pin the seeded
// dataset's contract: 90 contiguous days ending today, the documented
// workout/meditation/stress cadences, and shapes the chart components consume.

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('seedDatabase', () => {
  it('seeds 90 days of daily summaries plus cadenced events', async () => {
    await seedDatabase()

    expect(await db.sleepDays.count()).toBe(90)
    expect(await db.sleepSessions.count()).toBe(90)
    expect(await db.readinessDays.count()).toBe(90)
    expect(await db.resilienceDays.count()).toBe(90)
    expect(await db.activityDays.count()).toBe(90)
    // i % 3 === 0 for i in 0..89 → 30 workouts; i % 5 === 0 → 18 meditations;
    // 4 stress readings per day → 360.
    expect(await db.workouts.count()).toBe(30)
    expect(await db.meditations.count()).toBe(18)
    expect(await db.stressPoints.count()).toBe(360)
  })

  it('spans exactly the last 90 days ending today', async () => {
    await seedDatabase()
    const today = format(new Date(), 'yyyy-MM-dd')
    const first = format(subDays(new Date(), 89), 'yyyy-MM-dd')

    const newest = await db.sleepDays.orderBy('day').reverse().first()
    const oldest = await db.sleepDays.orderBy('day').first()
    // "Latest day = today" is what makes the dashboard show fresh-looking data
    // in dev instead of a stale 3-month-old snapshot.
    expect(newest?.day).toBe(today)
    expect(oldest?.day).toBe(first)
  })

  it('writes importStats to meta with counts matching the seeded tables', async () => {
    await seedDatabase()
    const entry = await db.meta.get('importStats')
    const stats = entry?.value as ImportStats

    expect(stats.sleepNights).toBe(90)
    expect(stats.readinessDays).toBe(90)
    expect(stats.activityDays).toBe(90)
    expect(stats.workouts).toBe(30)
    expect(stats.meditations).toBe(18)
    expect(stats.stressPoints).toBe(360)
    // useHasData gates onboarding on sleepDays.count() — a seeded DB must
    // pass that gate, otherwise devs land on the import screen anyway.
    expect(await db.sleepDays.count()).toBeGreaterThan(0)
  })

  it('produces chart-consumable shapes (arrays, contributors, ISO timestamps)', async () => {
    await seedDatabase()

    const session = await db.sleepSessions.orderBy('day').reverse().first()
    // Hypnogram and HR charts index directly into these arrays — null or
    // string values would crash uPlot at render time.
    expect(Array.isArray(session?.sleepPhase5Min)).toBe(true)
    expect(session?.sleepPhase5Min?.length).toBeGreaterThan(0)
    expect(session?.heartRate?.length).toBe(session?.sleepPhase5Min?.length)
    expect(session?.hrv?.length).toBe(session?.sleepPhase5Min?.length)

    const sleepDay = await db.sleepDays.orderBy('day').first()
    expect(sleepDay?.contributors.deep_sleep).toBeTypeOf('number')
    expect(sleepDay?.score).toBeGreaterThanOrEqual(58)
    expect(sleepDay?.score).toBeLessThanOrEqual(95)

    const activity = await db.activityDays.orderBy('day').first()
    expect(activity?.met?.length).toBe(288)
    expect(activity?.class5Min?.length).toBe(288)

    const stress = await db.stressPoints.orderBy('id').first()
    expect(stress?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(stress?.day).toBe(stress?.timestamp.slice(0, 10))
  })

  it('is deterministic: two seeds produce identical daily values', async () => {
    await seedDatabase()
    const firstRun = await db.sleepDays.orderBy('day').toArray()

    await Promise.all(db.tables.map((t) => t.clear()))
    await seedDatabase()
    const secondRun = await db.sleepDays.orderBy('day').toArray()

    // The seeded PRNG exists precisely so reloads don't reshuffle the UI;
    // score equality across runs proves the seed actually drives the values.
    expect(secondRun.map((d) => d.score)).toEqual(firstRun.map((d) => d.score))
  })

  it('re-seeding without clearing duplicates stressPoints (characterisation of a bug)', async () => {
    // seedDatabase uses bulkAdd for stressPoints (auto-increment PK) with no
    // clear() first — unlike the import worker, which clears before adding.
    // Running the seeder twice therefore doubles stress rows while every
    // day-keyed table stays at 90. This is a genuine defect in
    // src/dev/seedDatabase.ts; the test characterises today's behaviour so
    // the fix (adding clear-before-add) will be visible as a test update.
    await seedDatabase()
    await seedDatabase()

    expect(await db.sleepDays.count()).toBe(90)
    expect(await db.stressPoints.count()).toBe(720)
  })
})
