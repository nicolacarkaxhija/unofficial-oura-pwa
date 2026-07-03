import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/db/client'
import { checkAndRepair } from '@/lib/evictionRecovery'

// ─── Eviction sentinel tests ──────────────────────────────────────────────────
//
// Regression guard for the sentinel bug: the check used to key on
// db.sleepDays.count(), so a valid export with zero sleep rows re-imported the
// whole ZIP on every launch. The sentinel is now the `importStats` meta entry
// (written as the final step of every successful import): present ⇒ data was
// imported ⇒ never re-import, regardless of which tables happen to be empty.

// The recovery path lazy-imports runImport; mock it so no real Worker spawns.
const runImportMock = vi.fn<(blob: Blob) => Promise<void>>()
vi.mock('@/workers/runImport', () => ({
  runImport: (blob: Blob) => runImportMock(blob),
}))

async function clearAll() {
  await Promise.all(db.tables.map((t) => t.clear()))
}

// Stubs db.meta.get for tests that need a real-Blob zipBlob entry:
// fake-indexeddb's structured clone does not round-trip jsdom Blobs as
// `instanceof Blob`, which would falsely take the no-zip branch. Real
// browsers persist Blobs natively. The double cast is needed because Dexie's
// get() is overloaded (key vs criteria object) and returns PromiseExtended.
function stubMetaGet(entries: Record<string, unknown>) {
  return vi
    .spyOn(db.meta, 'get')
    .mockImplementation(((key: string) =>
      Promise.resolve(
        key in entries ? { key, value: entries[key] } : undefined,
      )) as unknown as typeof db.meta.get)
}

describe('checkAndRepair (eviction sentinel)', () => {
  beforeEach(async () => {
    runImportMock.mockReset()
    runImportMock.mockResolvedValue(undefined)
    await clearAll()
  })

  it('does nothing when importStats is present — even with an empty sleepDays table', async () => {
    // The exact scenario the old count()-based check got wrong: an export
    // with no sleep rows but a completed import.
    await db.meta.put({ key: 'importStats', value: { sleepNights: 0 } })
    await db.meta.put({ key: 'zipBlob', value: new Blob(['zip']) })
    const dispatch = vi.spyOn(window, 'dispatchEvent')

    await checkAndRepair()

    expect(runImportMock).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
    dispatch.mockRestore()
  })

  it('does not clobber existing rows when stats are missing but a table has data', async () => {
    await db.readinessDays.put({ day: '2025-01-01' } as never)
    await db.meta.put({ key: 'zipBlob', value: new Blob(['zip']) })
    const dispatch = vi.spyOn(window, 'dispatchEvent')

    await checkAndRepair()

    expect(runImportMock).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
    dispatch.mockRestore()
  })

  it('silently re-imports the stored ZIP after a data-only eviction', async () => {
    const zip = new Blob(['zip-bytes'])
    const get = stubMetaGet({ zipBlob: zip })

    await checkAndRepair()
    get.mockRestore()

    expect(runImportMock).toHaveBeenCalledTimes(1)
    expect(runImportMock).toHaveBeenCalledWith(zip)
  })

  it('signals re-import required when the ZIP blob is gone too', async () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent')

    await checkAndRepair()

    expect(runImportMock).not.toHaveBeenCalled()
    const event = dispatch.mock.calls.at(0)?.[0] as CustomEvent | undefined
    expect(event?.type).toBe('oura:eviction')
    expect(event?.detail).toBe('no-zip')
    dispatch.mockRestore()
  })

  it('degrades to the no-zip signal when the silent re-import fails', async () => {
    const get = stubMetaGet({ zipBlob: new Blob(['corrupt']) })
    runImportMock.mockRejectedValue(new Error('bad zip'))
    const dispatch = vi.spyOn(window, 'dispatchEvent')

    await checkAndRepair()
    get.mockRestore()

    const event = dispatch.mock.calls.at(0)?.[0] as CustomEvent | undefined
    expect(event?.type).toBe('oura:eviction')
    dispatch.mockRestore()
  })
})
