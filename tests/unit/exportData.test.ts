import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db/client'
import { buildExportPayload } from '@/lib/exportData'
import { seedDatabase } from '@/dev/seedDatabase'

describe('buildExportPayload', () => {
  beforeEach(async () => {
    await db.transaction('rw', db.tables, async () => {
      await Promise.all(db.tables.map((t) => t.clear()))
    })
  })

  it('exports empty tables as empty arrays with envelope metadata', async () => {
    const payload = await buildExportPayload()
    expect(payload.format).toBe('unofficial-oura-pwa')
    expect(payload.version).toBe(1)
    // ISO 8601 timestamp so downstream tools can parse it unambiguously.
    expect(new Date(payload.exportedAt).getTime()).not.toBeNaN()
    expect(payload.tables['sleepDays']).toEqual([])
  })

  it('round-trips every seeded table with full row counts', async () => {
    await seedDatabase()
    const payload = await buildExportPayload()

    expect(payload.tables['sleepDays']).toHaveLength(90)
    expect(payload.tables['readinessDays']).toHaveLength(90)
    expect(payload.tables['activityDays']).toHaveLength(90)
    expect(payload.tables['stressPoints']).toHaveLength(360)
    expect(payload.tables['workouts']).toHaveLength(30)
  })

  it('excludes the meta table (raw ZIP blob must not leak into the JSON)', async () => {
    await db.meta.put({ key: 'zipBlob', value: new Blob(['x']) })
    const payload = await buildExportPayload()
    expect(Object.keys(payload.tables)).not.toContain('meta')
  })

  it('produces JSON-serialisable output', async () => {
    await seedDatabase()
    const payload = await buildExportPayload()
    // Would throw on Blobs, cycles, or BigInt sneaking into a table.
    const text = JSON.stringify(payload)
    expect(text.length).toBeGreaterThan(1000)
  })
})
